import { ParseError, ErrorCode } from './ParseError.js';

/**
 * Well-known enclosure presets.
 *
 * Import these in your parser config to compose skipEnclosures arrays:
 *
 *   import { xmlEnclosures, quoteEnclosures } from 'flex-xml-parser';
 *
 *   stopNodes: [
 *     "..script",                                              // plain — no enclosures (default)
 *     { expression: "body..pre",   skipEnclosures: [...xmlEnclosures] },
 *     { expression: "head..style", skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] },
 *     { expression: "root.stopNode", nested: true, skipEnclosures: [{ open: '<!--', close: '-->' }] },
 *   ]
 */

/** XML structural delimiters — comments, CDATA, processing instructions. */
export const xmlEnclosures = [
  { open: '<!--', close: '-->' },       // comment
  { open: '<![CDATA[', close: ']]>' },  // CDATA section
  { open: '<?', close: '?>' },          // processing instruction
];

/** String literal delimiters — useful for JS / CSS stop-node content. */
export const quoteEnclosures = [
  { open: "'", close: "'" },
  { open: '"', close: '"' },
  { open: '`', close: '`' },  // template literal
];

/**
 * StopNodeProcessor — self-contained processor for stop nodes.
 *
 * A stop node is a "sealed envelope": the parser goes blind the moment it
 * enters one, collecting raw characters until the matching closing tag is
 * found. The content is returned as a raw string and never parsed by the
 * XML engine.
 *
 * ### Modes
 *
 * The behaviour is controlled by two independent flags:
 *
 *   **`nested`** (boolean, default false):
 *     When true, the processor tracks the depth of nested same-name opening
 *     tags. The stop node ends only when the depth returns to zero — i.e. the
 *     closing tag that matches the original opening tag. When false (default),
 *     the very first `</tagName>` ends the stop node regardless of nesting.
 *
 *   **`skipEnclosures`** (array, default []):
 *     A list of `{ open: string, close: string }` pairs. When the processor
 *     encounters an open marker it consumes everything up to the close marker
 *     wholesale, suppressing all closing-tag (and depth) logic for that span.
 *     Enclosures are checked in array order; the first match wins. When the
 *     array is empty, no enclosure skipping is performed.
 *
 * The two flags compose freely:
 *
 *   | nested | skipEnclosures | Behaviour                                                              |
 *   |--------|----------------|------------------------------------------------------------------------|
 *   | false  | []             | Plain: stop at first `</tagName>`.                                     |
 *   | true   | []             | Depth-only: track nested open tags, no enclosures.                    |
 *   | false  | [...]          | Enclosure-only: skip interiors, stop at first close tag outside them. |
 *   | true   | [...]          | Full: depth tracking + enclosure skipping.                             |
 *
 * ### Chunk-boundary survival (feedable / stream sources)
 *
 * When input runs out mid-collection, `collect()` throws `UNEXPECTED_END`.
 * The caller (`feed()` in XMLParser) catches it and rewinds the source to the
 * outer mark (the `<` of the stop node's opening tag). On the next `feed()`
 * call `readOpeningTag()` sees the reader is already active (`isActive()`) and
 * calls `resumeAfterOpenTag()` to re-consume the opening tag before calling
 * `collect()` again. All accumulated content and state are preserved in
 * instance fields between attempts.
 */
export class StopNodeProcessor {
  /**
   * @param {string}   tagName
   *   The stop-node tag name to watch for.
   * @param {object}   [opts]
   * @param {boolean}  [opts.nested=false]
   *   When true, nested same-name open tags increment a depth counter; the
   *   stop node ends only when depth returns to zero.
   * @param {Array<{open:string,close:string}>} [opts.skipEnclosures=[]]
   *   Enclosure pairs whose interiors suppress closing-tag detection.
   */
  constructor(tagName, { nested = false, skipEnclosures = [] } = {}) {
    this._tagName = tagName;
    this._nested = nested;
    this._enclosures = skipEnclosures;

    // Runtime state — reset in activate() / resumeAfterOpenTag()
    this._content = '';
    this._depth = 1;   // already inside the opening tag
    this._active = false;
  }

  /** True once activated; cleared when `collect()` returns successfully. */
  isActive() {
    return this._active;
  }

  /**
   * Activate this processor. Called by `readOpeningTag` the first time it
   * encounters the stop node (after `readTagExp` has consumed the opening tag).
   */
  activate() {
    this._active = true;
    this._content = '';
    this._depth = 1;
  }

  /**
   * Called on resume (chunk boundary): the source was rewound to the `<` of
   * the stop node's opening tag, so the caller must re-consume the opening tag
   * via `readTagExp` before calling `collect()`.
   *
   * Because the rewind replays the entire opening tag, any content accumulated
   * during the failed attempt is invalid. Reset to a clean post-activation
   * state so the next `collect()` starts fresh from right after the opening tag.
   */
  resumeAfterOpenTag() {
    this._content = '';
    this._depth = 1;
  }

  /**
   * Collect raw content from `source` until the matching closing tag is found.
   *
   * Dispatches to one of four internal strategies based on the `nested` flag
   * and whether `skipEnclosures` is non-empty:
   *
   *   - Plain          (`nested:false`, no enclosures): fastest path — scan for
   *                    the literal `</tagName>` string and stop immediately.
   *   - Depth-only     (`nested:true`,  no enclosures): track open/close tags
   *                    for depth, no enclosure skipping.
   *   - Enclosure-only (`nested:false`, enclosures): skip enclosure interiors,
   *                    stop at the first closing tag found outside them.
   *   - Full           (`nested:true`,  enclosures): depth tracking AND
   *                    enclosure skipping.
   *
   * Progress (`_content`, `_depth`) is stored in instance fields so a
   * chunk-boundary `UNEXPECTED_END` can be retried seamlessly.
   *
   * @param {object} source  Any source object with the standard read interface.
   * @returns {string}  Raw content between the opening and closing tags.
   */
  collect(source) {
    source.markTokenStart(1);

    if (!this._nested && this._enclosures.length === 0) {
      return this._collectPlain(source);
    }
    if (this._nested && this._enclosures.length === 0) {
      return this._collectDepthOnly(source);
    }
    if (!this._nested && this._enclosures.length > 0) {
      return this._collectEnclosureOnly(source);
    }
    // nested && enclosures.length > 0
    return this._collectFull(source);
  }

  // ── Strategy 1: Plain ──────────────────────────────────────────────────────

  /**
   * Fastest path. No depth tracking, no enclosure skipping.
   * Scans for the literal `</tagName>` followed by optional whitespace then `>`.
   */
  _collectPlain(source) {
    const needed = '</' + this._tagName;

    while (source.canRead()) {
      const ch = source.readChAt(0);

      if (ch !== '<') {
        this._content += source.readCh();
        continue;
      }

      // At '<' — check whether this is our closing tag
      if (this._peekMatch(source, needed)) {
        let offset = needed.length;
        let validClose = false;
        while (true) {
          const c = source.readChAt(offset);
          if (c === '>') { validClose = true; break; }
          if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { offset++; continue; }
          break;
        }

        if (validClose) {
          // Consume `</tagName + optional whitespace + >`
          this._skipChars(source, needed.length);
          while (source.canRead()) {
            const c = source.readCh();
            if (c === '>') break;
          }
          return this._finish();
        }
      }

      this._content += source.readCh();
    }

    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end of input`,
      ErrorCode.UNEXPECTED_END,
    );
  }

  // ── Strategy 2: Depth-only ─────────────────────────────────────────────────

  /**
   * Depth tracking without enclosure skipping.
   * Properly handles nested same-name open tags. No enclosure awareness.
   */
  _collectDepthOnly(source) {
    while (this._depth > 0) {
      if (!source.canRead()) {
        throw new ParseError(
          `Unclosed stop node <${this._tagName}> — unexpected end of input`,
          ErrorCode.UNEXPECTED_END,
        );
      }

      const ch = source.readChAt(0);

      if (ch !== '<') {
        this._content += source.readCh();
        continue;
      }

      // Consume '<'
      source.readCh();

      if (!source.canRead()) {
        throw new ParseError(
          `Unclosed stop node <${this._tagName}> — unexpected end after '<'`,
          ErrorCode.UNEXPECTED_END,
        );
      }

      const c0 = source.readChAt(0);

      if (c0 === '/') {
        // Closing tag
        source.readCh(); // consume '/'
        const closeName = this._readTagName(source);
        const closeSuffix = this._readToAngleClose(source);

        if (closeName === this._tagName) {
          this._depth--;
          if (this._depth === 0) return this._finish();
        }
        this._content += '</' + closeName + closeSuffix;
        continue;
      }

      // Opening tag (including self-closing)
      const openName = this._readTagName(source);
      this._content += '<' + openName;

      const { selfClosing, attrText } = this._readTagTail(source);
      this._content += attrText;

      if (!selfClosing && openName === this._tagName) {
        this._depth++;
      }
    }

    /* istanbul ignore next */
    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end of input`,
      ErrorCode.UNEXPECTED_END,
    );
  }

  // ── Strategy 3: Enclosure-only ─────────────────────────────────────────────

  /**
   * Enclosure skipping without depth tracking.
   * Skips enclosure interiors; stops at the first `</tagName>` found outside them.
   */
  _collectEnclosureOnly(source) {
    while (source.canRead()) {
      // Enclosure openers take priority over everything else
      const encIdx = this._matchEnclosureOpen(source);
      if (encIdx !== -1) {
        const enc = this._enclosures[encIdx];
        this._skipChars(source, enc.open.length);
        this._content += enc.open;
        const interior = this._readUpto(source, enc.close);
        this._content += interior + enc.close;
        continue;
      }

      const ch = source.readChAt(0);

      if (ch !== '<') {
        this._content += source.readCh();
        continue;
      }

      // At '<' outside any enclosure — check for our closing tag
      const needed = '</' + this._tagName;
      if (this._peekMatch(source, needed)) {
        let offset = needed.length;
        let validClose = false;
        while (true) {
          const c = source.readChAt(offset);
          if (c === '>') { validClose = true; break; }
          if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { offset++; continue; }
          break;
        }

        if (validClose) {
          this._skipChars(source, needed.length);
          while (source.canRead()) {
            const c = source.readCh();
            if (c === '>') break;
          }
          return this._finish();
        }
      }

      this._content += source.readCh();
    }

    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end of input`,
      ErrorCode.UNEXPECTED_END,
    );
  }

  // ── Strategy 4: Full (nested + enclosures) ─────────────────────────────────

  /**
   * Full mode: enclosure skipping AND depth tracking.
   * Enclosure interiors suppress all closing-tag and depth logic for their span.
   * Depth tracks nested same-name open tags; the stop node ends at depth zero.
   */
  _collectFull(source) {
    while (this._depth > 0) {
      if (!source.canRead()) {
        throw new ParseError(
          `Unclosed stop node <${this._tagName}> — unexpected end of input`,
          ErrorCode.UNEXPECTED_END,
        );
      }

      // Enclosure openers take priority over tag scanning
      const encIdx = this._matchEnclosureOpen(source);
      if (encIdx !== -1) {
        const enc = this._enclosures[encIdx];
        this._skipChars(source, enc.open.length);
        this._content += enc.open;
        const interior = this._readUpto(source, enc.close);
        this._content += interior + enc.close;
        continue;
      }

      const ch = source.readChAt(0);

      if (ch !== '<') {
        this._content += source.readCh();
        continue;
      }

      // Consume '<'
      source.readCh();

      if (!source.canRead()) {
        throw new ParseError(
          `Unclosed stop node <${this._tagName}> — unexpected end after '<'`,
          ErrorCode.UNEXPECTED_END,
        );
      }

      const c0 = source.readChAt(0);

      if (c0 === '/') {
        // Closing tag
        source.readCh(); // consume '/'
        const closeName = this._readTagName(source);
        const closeSuffix = this._readToAngleClose(source);

        if (closeName === this._tagName) {
          this._depth--;
          if (this._depth === 0) return this._finish();
        }
        this._content += '</' + closeName + closeSuffix;
        continue;
      }

      // Opening tag (including self-closing)
      const openName = this._readTagName(source);
      this._content += '<' + openName;

      const { selfClosing, attrText } = this._readTagTail(source);
      this._content += attrText;

      if (!selfClosing && openName === this._tagName) {
        this._depth++;
      }
    }

    /* istanbul ignore next */
    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end of input`,
      ErrorCode.UNEXPECTED_END,
    );
  }

  // ── Shared finish helper ───────────────────────────────────────────────────

  /**
   * Reset runtime state and return the accumulated content.
   * Called by every strategy when the closing tag is confirmed.
   * @returns {string}
   */
  _finish() {
    const result = this._content;
    this._active = false;
    this._content = '';
    this._depth = 1;
    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Check whether any enclosure's `open` marker starts at the current source
   * position (without consuming). Returns the index of the first matching
   * enclosure, or -1 if none match.
   */
  _matchEnclosureOpen(source) {
    for (let i = 0; i < this._enclosures.length; i++) {
      if (this._peekMatch(source, this._enclosures[i].open)) return i;
    }
    return -1;
  }

  /**
   * Read until `stopStr` is found, consuming `stopStr` itself.
   * Returns the text before `stopStr`. Throws UNEXPECTED_END if input runs out.
   */
  _readUpto(source, stopStr) {
    const s0 = stopStr[0];
    const sLen = stopStr.length;
    const start = source.startIndex;
    let len = 0;

    while (source.canRead()) {
      if (source.readChAt(0) === s0 && this._peekMatch(source, stopStr)) {
        const text = source.readStr(len, start);
        this._skipChars(source, sLen);
        return text;
      }
      source.readCh();
      len++;
    }

    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end looking for '${stopStr}'`,
      ErrorCode.UNEXPECTED_END,
    );
  }

  /**
   * Check whether the source (starting at current position) starts with `str`.
   * Does NOT consume.
   */
  _peekMatch(source, str) {
    for (let i = 0; i < str.length; i++) {
      if (source.readChAt(i) !== str[i]) return false;
    }
    return true;
  }

  /**
   * Consume exactly `n` characters from source (discarding them — the caller
   * is responsible for appending to `_content` if needed).
   */
  _skipChars(source, n) {
    for (let i = 0; i < n; i++) source.readCh();
  }

  /**
   * Read an XML name (tag name) from the current source position.
   * Stops at `>`, `/`, or any whitespace. Does NOT consume the delimiter.
   */
  _readTagName(source) {
    let name = '';
    while (source.canRead()) {
      const ch = source.readChAt(0);
      if (ch === '>' || ch === '/' || ch === ' ' || ch === '\t' ||
        ch === '\n' || ch === '\r') break;
      name += source.readCh();
    }
    return name;
  }

  /**
   * Read from after the tag name up to and including the closing `>`,
   * detecting self-closing `/>` and respecting quoted attribute values so
   * a `>` inside a value does not prematurely end the tag.
   *
   * Returns `{ selfClosing: boolean, attrText: string }` where `attrText`
   * includes everything from the first attribute character up to and
   * including the closing `>` (or `/>`).
   */
  _readTagTail(source) {
    const start = source.startIndex;
    let len = 0;
    let inSingle = false;
    let inDouble = false;

    while (source.canRead()) {
      const ch = source.readCh();
      len++;

      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
      } else if (!inSingle && !inDouble) {
        if (ch === '>') {
          return { selfClosing: false, attrText: source.readStr(len, start) };
        }
        if (ch === '/' && source.canRead() && source.readChAt(0) === '>') {
          source.readCh(); // consume '>'
          len++;
          return { selfClosing: true, attrText: source.readStr(len, start) };
        }
      }
    }

    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end inside tag`,
      ErrorCode.UNEXPECTED_END,
    );
  }

  /**
   * After reading a closing tag name, read optional whitespace and the `>`
   * returning them as a raw string (e.g. `'  >'` or `'>'`).
   * Preserves original spacing when reconstructing inner closing tags.
   */
  _readToAngleClose(source) {
    const start = source.startIndex;
    let len = 0;
    while (source.canRead()) {
      const ch = source.readCh();
      len++;
      if (ch === '>') return source.readStr(len, start);
      if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') {
        throw new ParseError(
          `Malformed closing tag for </${this._tagName}>`,
          ErrorCode.UNEXPECTED_END,
        );
      }
    }
    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end looking for '>'`,
      ErrorCode.UNEXPECTED_END,
    );
  }
}