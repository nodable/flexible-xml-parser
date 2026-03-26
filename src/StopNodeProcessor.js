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
 *   ]
 */

/** XML structural delimiters — comments, CDATA, processing instructions. */
export const xmlEnclosures = [
  { open: '<!--', close: '-->' },   // comment
  { open: '<![CDATA[', close: ']]>' },    // CDATA section
  { open: '<?', close: '?>' },    // processing instruction
];

/** String literal delimiters — useful for JS / CSS stop-node content. */
export const quoteEnclosures = [
  { open: "'", close: "'" },
  { open: '"', close: '"' },
  { open: '`', close: '`' },   // template literal
];

/**
 * StopNodeProcessor — self-contained processor for stop nodes.
 *
 * A stop node is a "sealed envelope": the parser goes blind the moment it
 * enters one, collecting raw characters until the matching closing tag is
 * found at the correct depth. The content is returned as a raw string and
 * never parsed by the XML engine.
 *
 * ### skipEnclosures
 *
 * Each stop-node definition can supply a `skipEnclosures` array of
 * `{ open: string, close: string }` pairs. While inside an enclosure the
 * processor ignores closing-tag detection entirely — so a `</script>` that
 * appears inside a string literal or a comment does not end the stop node.
 *
 * Enclosures are checked in array order; the first match wins. Once inside
 * an enclosure, no further matching (including other enclosures) runs until
 * the close marker is found.
 *
 * A `skipEnclosures: []` (or omitted) array means plain/first-match behaviour:
 * the very first `</tagName>` ends the stop node, with no depth tracking.
 *
 * When `skipEnclosures` has entries, depth tracking is enabled so nested
 * same-name open tags are handled correctly.
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
   * @param {string}   tagName        The stop-node tag name to watch for.
   * @param {Array<{open:string,close:string}>} skipEnclosures
   *   Pairs whose interiors are skipped when scanning for the closing tag.
   *   Pass an empty array (default) for plain first-match behaviour.
   */
  constructor(tagName, skipEnclosures = []) {
    this._tagName = tagName;
    this._enclosures = skipEnclosures;
    this._trackDepth = skipEnclosures.length > 0;

    // Runtime state — reset in activate()
    this._content = '';
    this._depth = 1;   // already inside one opening tag
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
   * Because the rewind replays the entire opening tag, any content that
   * `collect()` had accumulated during the failed attempt is invalid — it may
   * include characters from the opening tag itself that were read before the
   * UNEXPECTED_END. Reset to a clean post-activation state so the next
   * `collect()` starts fresh from right after the opening tag.
   */
  resumeAfterOpenTag() {
    this._content = '';
    this._depth = 1;
  }

  /**
   * Collect raw content from `source` until the matching closing tag is found.
   *
   * Two modes depending on `skipEnclosures`:
   *
   *   **Plain mode** (`skipEnclosures` empty):
   *     Scans for the first `</tagName>`, no depth tracking. Fast path.
   *
   *   **Enclosure-aware mode** (`skipEnclosures` non-empty):
   *     Checks enclosure open markers in priority order before every `<`.
   *     While inside an enclosure, closing-tag and depth-tracking logic is
   *     suspended. Depth tracks nested same-name open tags so they don't
   *     prematurely end the stop node.
   *
   * Progress (`_content`, `_depth`) is stored in instance fields so a
   * chunk-boundary `UNEXPECTED_END` can be retried seamlessly.
   *
   * @param {object} source  Any source object with the standard read interface.
   * @returns {string}  Raw content between the opening and closing tags.
   */
  collect(source) {
    source.markTokenStart(1);

    if (this._trackDepth) {
      return this._collectEnclosureAware(source);
    } else {
      return this._collectPlain(source);
    }
  }

  // ── Private: plain mode ────────────────────────────────────────────────────

  /**
   * Plain mode: scan for the first occurrence of `</tagName` followed by
   * optional whitespace then `>` (no other characters), with no depth
   * tracking and no enclosure skipping.
   */
  _collectPlain(source) {
    const needed = '</' + this._tagName;  // e.g. '</script'

    while (source.canRead()) {
      const ch = source.readChAt(0);

      if (ch !== '<') {
        this._content += source.readCh();
        continue;
      }

      // We're at '<' — check if this looks like our closing tag
      let match = true;
      for (let i = 0; i < needed.length; i++) {
        if (source.readChAt(i) !== needed[i]) { match = false; break; }
      }

      if (match) {
        // After the tag name must be '>' or only whitespace before '>'.
        // Peek ahead to confirm: scan from needed.length until we find '>'
        // or a non-whitespace character.
        let offset = needed.length;
        let validClose = false;
        while (true) {
          const c = source.readChAt(offset);
          if (c === '>') { validClose = true; break; }
          if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { offset++; continue; }
          break; // non-whitespace, non-'>' — not a valid close tag
        }

        if (validClose) {
          // Consume '</' + tagName + optional whitespace + '>'
          this._skipChars(source, needed.length);
          while (source.canRead()) {
            const c = source.readCh();
            if (c === '>') break;
          }
          const result = this._content;
          this._active = false;
          this._content = '';
          this._depth = 1;
          return result;
        }
      }

      // Not our closing tag — consume the '<' and continue
      this._content += source.readCh();
    }

    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end of input`,
      ErrorCode.UNEXPECTED_END,
    );
  }

  // ── Private: enclosure-aware mode ─────────────────────────────────────────

  /**
   * Enclosure-aware mode:
   *   - At every position, check enclosure open markers in priority order.
   *   - While inside an enclosure, skip to the close marker wholesale.
   *   - When at '<' (and not in an enclosure), check for depth changes.
   *   - Closing tags end the stop node only when depth reaches 0.
   */
  _collectEnclosureAware(source) {
    while (this._depth > 0) {
      if (!source.canRead()) {
        throw new ParseError(
          `Unclosed stop node <${this._tagName}> — unexpected end of input`,
          ErrorCode.UNEXPECTED_END,
        );
      }

      // ── Check for enclosure openers at current position ───────────────────
      const encIdx = this._matchEnclosureOpen(source);
      if (encIdx !== -1) {
        const enc = this._enclosures[encIdx];
        // Consume the open marker into content
        this._skipChars(source, enc.open.length);
        this._content += enc.open;
        // Consume everything until the close marker
        const interior = this._readUpto(source, enc.close);
        this._content += interior + enc.close;
        continue;
      }

      const ch = source.readChAt(0);

      // ── Not '<' — just accumulate ─────────────────────────────────────────
      if (ch !== '<') {
        this._content += source.readCh();
        continue;
      }

      // ── We're at '<' — classify what follows ─────────────────────────────
      source.readCh(); // consume '<'

      if (!source.canRead()) {
        throw new ParseError(
          `Unclosed stop node <${this._tagName}> — unexpected end after '<'`,
          ErrorCode.UNEXPECTED_END,
        );
      }

      const c0 = source.readChAt(0);

      // ── Closing tag: </...>  ──────────────────────────────────────────────
      if (c0 === '/') {
        source.readCh(); // consume '/'
        const closeName = this._readTagName(source);
        const closeSuffix = this._readToAngleClose(source); // optional WS + '>'

        if (closeName === this._tagName) {
          this._depth--;
          if (this._depth === 0) {
            const result = this._content;
            this._active = false;
            this._content = '';
            this._depth = 1;
            return result;
          }
        }
        // Not our tag (or depth still > 0) — preserve as-is
        this._content += '</' + closeName + closeSuffix;
        continue;
      }

      // ── Opening tag (including self-closing) ─────────────────────────────
      {
        const openName = this._readTagName(source);
        this._content += '<' + openName;

        const { selfClosing, attrText } = this._readTagTail(source);
        this._content += attrText;

        if (!selfClosing && openName === this._tagName) {
          this._depth++;
        }
        continue;
      }
    }

    /* istanbul ignore next */
    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end of input`,
      ErrorCode.UNEXPECTED_END,
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Check whether any enclosure's `open` marker starts at the current source
   * position (without consuming). Returns the index of the first matching
   * enclosure, or -1 if none match.
   *
   * Enclosures are tested in array order — first match wins.
   */
  _matchEnclosureOpen(source) {
    for (let i = 0; i < this._enclosures.length; i++) {
      const { open } = this._enclosures[i];
      let match = true;
      for (let j = 0; j < open.length; j++) {
        if (source.readChAt(j) !== open[j]) { match = false; break; }
      }
      if (match) return i;
    }
    return -1;
  }

  /**
   * Read characters until `stopChar` is reached (or input runs out).
   * Does NOT consume `stopChar`. Returns accumulated text.
   */
  _readUntilChar(source, stopChar) {
    let text = '';
    while (source.canRead()) {
      if (source.readChAt(0) === stopChar) break;
      text += source.readCh();
    }
    return text;
  }

  /**
   * Read until `stopStr` is found, consuming `stopStr`.
   * Returns the text before `stopStr` (not including it).
   * Throws UNEXPECTED_END if input runs out.
   */
  _readUpto(source, stopStr) {
    let text = '';
    const s0 = stopStr[0];
    const sLen = stopStr.length;

    while (source.canRead()) {
      const ch = source.readChAt(0);
      if (ch === s0) {
        let match = true;
        for (let i = 1; i < sLen; i++) {
          if (source.readChAt(i) !== stopStr[i]) { match = false; break; }
        }
        if (match) {
          for (let i = 0; i < sLen; i++) source.readCh(); // consume stopStr
          return text;
        }
      }
      text += source.readCh();
    }

    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end looking for '${stopStr}'`,
      ErrorCode.UNEXPECTED_END,
    );
  }

  /**
   * Peek at the character `offset` positions ahead of the current source
   * position, without consuming.
   */
  _peekCharAt(source, offset) {
    return source.readChAt(offset);
  }

  /**
   * Check whether the source (starting at current position) starts with `str`.
   * Position 0 of `str` is checked at readChAt(0), position 1 at readChAt(1), …
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
    let attrText = '';
    let inSingle = false;
    let inDouble = false;

    while (source.canRead()) {
      const ch = source.readCh();
      attrText += ch;

      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
      } else if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
      } else if (!inSingle && !inDouble) {
        if (ch === '>') {
          return { selfClosing: false, attrText };
        }
        if (ch === '/' && source.canRead() && source.readChAt(0) === '>') {
          attrText += source.readCh(); // consume '>'
          return { selfClosing: true, attrText };
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
    let suffix = '';
    while (source.canRead()) {
      const ch = source.readCh();
      suffix += ch;
      if (ch === '>') return suffix;
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