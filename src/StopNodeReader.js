import { ParseError, ErrorCode } from './ParseError.js';

/**
 * StopNodeReader — self-contained processor for stop nodes.
 *
 * A stop node is a "sealed envelope": the parser must go blind the moment it
 * enters one, collecting raw characters until the matching closing tag is
 * found. The content is never parsed — it is returned as a raw string.
 *
 * ### Design principle
 *
 * The caller (readOpeningTag) sets up this reader ONCE when it identifies a
 * stop node. After that, this reader owns everything: accumulation, depth
 * tracking, chunk-boundary survival, and completion. The caller does nothing
 * until this reader says "done".
 *
 * This avoids the split-ownership problem where the caller had to manage
 * resume state, decide whether to re-consume the opening tag, and null out
 * fields in different code paths — which caused the original bugs.
 *
 * ### Chunk-boundary survival (feedable / stream sources)
 *
 * When input runs out mid-collection, collect() throws UNEXPECTED_END.
 * feed() catches it and rewinds the source to the outer mark (the '<' of the
 * stop node's opening tag). On the next feed(), readOpeningTag() sees that
 * this reader is already active (isActive()) and calls resumeAfterOpenTag()
 * instead of starting fresh — so the opening tag is re-consumed from source
 * (because the source was rewound to it) but no setup work is repeated.
 * Then collect() is called again and picks up exactly where it left off.
 *
 * ### What we track inside the content to avoid false endings
 *
 * We only track enough to not be fooled by content that looks like our
 * closing tag:
 *
 *   - Nested same-name open tags  → increment depth, decrement on their close
 *   - Comments <!--...-->         → skip interior wholesale
 *   - CDATA <![CDATA[...]]>       → skip interior wholesale
 *   - Processing instructions <?...?> → skip interior wholesale
 *
 * We do NOT parse anything else. Everything goes into the raw content bag.
 */
export class StopNodeReader {
  /**
   * @param {string} tagName  The stop node tag name to watch for.
   */
  constructor(tagName) {
    this._tagName = tagName;
    this._content = '';
    this._depth = 1;    // we are already inside one open tag
    this._active = false;
  }

  /** True once activated; cleared when collect() returns successfully. */
  isActive() {
    return this._active;
  }

  /**
   * Activate this reader. Called by readOpeningTag the first time it
   * encounters the stop node (after readTagExp has consumed the opening tag).
   */
  activate() {
    this._active = true;
    this._content = '';
    this._depth = 1;
  }

  /**
   * Called on resume (chunk boundary): the source was rewound to the '<' of
   * the stop node's opening tag, so readOpeningTag must re-consume it via
   * readTagExp before calling collect(). This method does nothing to internal
   * state — it exists only to make the intent explicit at the call site.
   */
  resumeAfterOpenTag() {
    // No state change needed. _content and _depth already hold the progress
    // saved from the previous collect() attempt. The caller's job is to
    // re-consume the opening tag from source (via readTagExp) so that source
    // is positioned right after '>' before collect() is called.
  }

  /**
   * Collect raw content from source until the matching closing tag is found.
   *
   * This is the core of the sealed-envelope loop. It reads characters one
   * conceptual token at a time, appending everything to _content, and watches
   * only for:
   *   - Comments, CDATA, PIs  → consume wholesale into content (no depth change)
   *   - Nested same-name open tags  → depth++
   *   - Matching close tag at depth 1  → done, return content
   *   - Any other close tag at depth > 1  → depth--
   *
   * On UNEXPECTED_END: saves progress (_content, _depth) implicitly (they are
   * instance fields), then re-throws so feed() can rewind and retry.
   *
   * On success: clears active flag, returns the raw content string.
   *
   * @param {object} source  Any source object with the standard read interface.
   * @returns {string}
   */
  collect(source) {
    source.markTokenStart(1);

    while (this._depth > 0) {
      // ── Accumulate plain text until the next '<' ──────────────────────────
      this._content += this._readUntilAngle(source);

      // We stopped because we found a '<' or ran out of input.
      if (!source.canRead()) {
        throw new ParseError(
          `Unclosed stop node <${this._tagName}> — unexpected end of input`,
          ErrorCode.UNEXPECTED_END
        );
      }

      // Consume the '<' — it won't go into content yet; we need to know what
      // follows before deciding how to represent it.
      source.readCh(); // consume '<'

      if (!source.canRead()) {
        throw new ParseError(
          `Unclosed stop node <${this._tagName}> — unexpected end after '<'`,
          ErrorCode.UNEXPECTED_END
        );
      }

      const c0 = source.readChAt(0);

      // ── Comment: <!--...-->  ──────────────────────────────────────────────
      if (c0 === '!' &&
        source.readChAt(1) === '-' &&
        source.readChAt(2) === '-') {
        source.readCh(); source.readCh(); source.readCh(); // consume '!--'
        const body = this._readUpto(source, '-->');
        this._content += '<!--' + body + '-->';
        continue;
      }

      // ── CDATA: <![CDATA[...]]>  ───────────────────────────────────────────
      if (c0 === '!' &&
        source.readChAt(1) === '[' &&
        source.readChAt(2) === 'C' &&
        source.readChAt(3) === 'D' &&
        source.readChAt(4) === 'A' &&
        source.readChAt(5) === 'T' &&
        source.readChAt(6) === 'A' &&
        source.readChAt(7) === '[') {
        // consume '![CDATA['  (8 chars)
        for (let i = 0; i < 8; i++) source.readCh();
        const body = this._readUpto(source, ']]>');
        this._content += '<![CDATA[' + body + ']]>';
        continue;
      }

      // ── Processing instruction: <?...?>  ──────────────────────────────────
      if (c0 === '?') {
        source.readCh(); // consume '?'
        const body = this._readUpto(source, '?>');
        this._content += '<?' + body + '?>';
        continue;
      }

      // ── Closing tag: </...>  ──────────────────────────────────────────────
      if (c0 === '/') {
        source.readCh(); // consume '/'
        const closeName = this._readTagName(source);
        const closeSuffix = this._readToAngleClose(source); // whitespace + '>'

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
        // Not our closing tag (or depth still > 0): preserve whitespace faithfully.
        this._content += '</' + closeName + closeSuffix;
        continue;
      }

      // ── Opening tag (or anything else starting with a name char)  ─────────
      {
        const openName = this._readTagName(source);
        this._content += '<' + openName;

        // Read the rest of the tag (attributes + possible self-close '/>')
        // respecting quoted strings so '>' inside a value doesn't end the tag.
        const { selfClosing, attrText } = this._readTagTail(source);
        this._content += attrText;

        if (!selfClosing && openName === this._tagName) {
          this._depth++;
        }
        continue;
      }
    }

    // Should never reach here — loop exits via return inside depth===0 branch.
    /* istanbul ignore next */
    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end of input`,
      ErrorCode.UNEXPECTED_END
    );
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Read characters into a string until '<' is found or input runs out.
   * Does NOT consume the '<'.
   */
  _readUntilAngle(source) {
    let text = '';
    while (source.canRead()) {
      if (source.readChAt(0) === '<') break;
      text += source.readCh();
    }
    return text;
  }

  /**
   * Read until stopStr is found, consuming stopStr.
   * Throws UNEXPECTED_END if input runs out first.
   */
  _readUpto(source, stopStr) {
    let text = '';
    const s0 = stopStr[0];
    const sLen = stopStr.length;

    while (source.canRead()) {
      const ch = source.readChAt(0);
      if (ch === s0) {
        // Check for full match
        let match = true;
        for (let i = 1; i < sLen; i++) {
          if (source.readChAt(i) !== stopStr[i]) { match = false; break; }
        }
        if (match) {
          // consume stopStr
          for (let i = 0; i < sLen; i++) source.readCh();
          return text;
        }
      }
      text += source.readCh();
    }

    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end looking for '${stopStr}'`,
      ErrorCode.UNEXPECTED_END
    );
  }

  /**
   * Read an XML name (tag name) from the current source position.
   * Stops at '>', '/', whitespace. Does NOT consume the delimiter.
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
   * Read from after the tag name to the end of the tag ('>'),
   * collecting the attribute text (including the final '>') and detecting
   * self-closing ('/>').
   *
   * Returns { selfClosing: bool, attrText: string }
   * attrText includes everything from the first attribute char up to and
   * including the closing '>' (or '/>').
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
      ErrorCode.UNEXPECTED_END
    );
  }

  /**
   * After reading a closing tag name, read optional whitespace and the '>'
   * and return them as a raw string (e.g. '  >' or '>').
   * This preserves the original spacing when reconstructing inner closing tags.
   * Throws if a non-whitespace, non-'>' character is found (malformed XML).
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
          ErrorCode.UNEXPECTED_END
        );
      }
    }
    throw new ParseError(
      `Unclosed stop node <${this._tagName}> — unexpected end looking for '>'`,
      ErrorCode.UNEXPECTED_END
    );
  }
}