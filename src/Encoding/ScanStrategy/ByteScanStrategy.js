import { ParseError, ErrorCode } from '../../ParseError.js';

const Constants = { space: 32, tab: 9 };

/**
 * ByteScanStrategy — for self-synchronizing encodings only (utf8/ascii/latin1
 * by default; any custom encoding that explicitly asserts
 * `selfSynchronizing: true`). All positions/indices here (`n`, `index`, loop
 * counters passed in from XmlPartReader/DocTypeReader/StopNodeProcessor) are
 * BYTE offsets, matching BufferSource's original convention throughout —
 * unchanged by the encoding feature. Delimiters (<,>,",') are matched at the
 * byte level for speed, safe here precisely because self-synchronizing means
 * an ASCII delimiter byte can never occur as a continuation byte of a
 * different character.
 *
 * `decodeCharAt(buf, i)` -> `{ char, width }` is the one piece that varies
 * per encoding (width in BYTES for the character starting at byte offset i).
 * ascii/latin1 are always width 1 — identical cost to the original
 * hand-written BufferSource code. utf8 is the real fix: readCh()/readChAt()
 * used to do single-byte `String.fromCharCode`, silently disagreeing with
 * readStr()/readUpto*() (which already correctly used Buffer#toString() over
 * byte spans and need no change at all — a byte-range boundary here is
 * always a genuine character boundary, since it's only ever produced by
 * matching an ASCII delimiter, which self-synchronizing guarantees is safe).
 *
 * Functions here are plain (non-arrow) so they can be assigned directly onto
 * a BufferSource instance and keep correct `this` binding with zero extra
 * indirection — resolved once at construction, no per-call branching.
 */
export function createByteScanStrategy(decodeCharAt, nodeEncoding = 'utf8', isContinuationByte = () => false) {
  return {
    readCh() {
      const { char, width } = decodeCharAt(this.buffer, this.startIndex);
      this.startIndex += width;
      if (char === '\n') {
        this.line++;
        this.cols = 0;
        this._charCol = 0;
      } else {
        // `cols` stays byte-counted (matches _advanceLineCol below — cheap,
        // consistent, unchanged cost). `_charCol` is the true character
        // column, kept in lockstep at O(1) per call, never rescanned. An
        // earlier version of this file computed the character column lazily
        // ("only pay at error time") — wrong here, because the call site
        // that needs position (tagStart capture in Xml2JsParser's main loop,
        // §14 of the project map) runs once per CHARACTER, not once per
        // error, so a rescan-per-call is O(line length) per character —
        // O(n²) overall. Fixed by tracking incrementally instead.
        this.cols += width;
        this._charCol += 1;
      }
      return char;
    },

    /** index is a BYTE offset ahead of startIndex, same as original BufferSource. */
    readChAt(index) {
      return decodeCharAt(this.buffer, this.startIndex + index).char;
    },

    readStr(n, from) {
      if (typeof from === 'undefined') from = this.startIndex;
      return this.buffer.slice(from, from + n).toString(nodeEncoding);
    },

    scanTagExpEnd() {
      const buf = this.buffer;
      const len = buf.length;
      const start = this.startIndex;
      let inSingle = false;
      let inDouble = false;
      for (let i = start; i < len; i++) {
        const c = buf[i];
        if (c === 39) { if (!inDouble) inSingle = !inSingle; }
        else if (c === 34) { if (!inSingle) inDouble = !inDouble; }
        else if (c === 62 && !inSingle && !inDouble) return i - start;
      }
      return -1;
    },

    // Single pass, same cost class as the original (which already walked
    // the span looking for newlines) — charCol is accumulated in the same
    // loop, not a separate rescan.
    _advanceLineCol(end) {
      let lastNewlineIdx = -1;
      let charsSinceLastNewline = 0;
      for (let i = this.startIndex; i < end; i++) {
        const b = this.buffer[i];
        if (b === 10) { this.line++; lastNewlineIdx = i; charsSinceLastNewline = 0; }
        else if (!isContinuationByte(b)) { charsSinceLastNewline++; }
      }
      if (lastNewlineIdx >= 0) {
        this.cols = end - lastNewlineIdx - 1;
      } else {
        this.cols += end - this.startIndex;
      }
      this._charCol = lastNewlineIdx >= 0 ? charsSinceLastNewline : this._charCol + charsSinceLastNewline;
    },

    readUpto(stopStr) {
      const inputLength = this.buffer.length;
      const stopLength = stopStr.length;
      const stopBuffer = Buffer.from(stopStr);
      for (let i = this.startIndex; i < inputLength; i++) {
        let match = true;
        for (let j = 0; j < stopLength; j++) {
          if (this.buffer[i + j] !== stopBuffer[j]) { match = false; break; }
        }
        if (match) {
          const result = this.buffer.slice(this.startIndex, i).toString(nodeEncoding);
          this._advanceLineCol(i + stopLength);
          this.startIndex = i + stopLength;
          return result;
        }
      }
      throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
    },

    readUptoChar(stopChar) {
      const stopCode = stopChar.charCodeAt(0);
      const buf = this.buffer;
      const len = buf.length;
      for (let i = this.startIndex; i < len; i++) {
        if (buf[i] === stopCode) {
          const result = buf.slice(this.startIndex, i).toString(nodeEncoding);
          this._advanceLineCol(i + 1);
          this.startIndex = i + 1;
          return result;
        }
      }
      throw new ParseError(`Unexpected end of source reading '${stopChar}'`, ErrorCode.UNEXPECTED_END);
    },

    readUptoCloseTag(stopStr) {
      const inputLength = this.buffer.length;
      const stopLength = stopStr.length;
      const stopBuffer = Buffer.from(stopStr);
      const GT = 62;
      let tagMatchStart = -1;
      let state = 0;
      for (let i = this.startIndex; i < inputLength; i++) {
        if (state === 1) {
          const b = this.buffer[i];
          if (b === Constants.space || b === Constants.tab) continue;
          if (b === GT) { state = 2; }
          else { state = 0; tagMatchStart = -1; }
        } else {
          let matched = true;
          for (let j = 0; j < stopLength; j++) {
            if (this.buffer[i + j] !== stopBuffer[j]) { matched = false; break; }
          }
          if (matched) { state = 1; tagMatchStart = i; i += stopLength - 1; }
        }
        if (state === 2) {
          const result = this.buffer.slice(this.startIndex, tagMatchStart).toString(nodeEncoding);
          this._advanceLineCol(i + 1);
          this.startIndex = i + 1;
          return result;
        }
      }
      throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
    },

    readFromBuffer(n, shouldUpdate) {
      if (n === 1) {
        const { char, width } = decodeCharAt(this.buffer, this.startIndex);
        if (shouldUpdate) this.updateBufferBoundary(width);
        return char;
      }
      const ch = this.buffer.slice(this.startIndex, this.startIndex + n).toString(nodeEncoding);
      if (shouldUpdate) this.updateBufferBoundary(n);
      return ch;
    },

    updateBufferBoundary(n = 1) {
      const end = this.startIndex + n;
      this._advanceLineCol(end);
      this.startIndex = end;
      if (this.autoFlush && this.startIndex >= this.flushThreshold && this._tokenStart < 0) {
        this.flush();
      }
    },

    // Relative to current position, matching FeedableSource's formula.
    canRead(n = 0) {
      return this.startIndex + n < this.buffer.length;
    },
  };
}

// ─── decodeCharAt implementations ───────────────────────────────────────────

export function decodeCharAtFixedWidth1(buf, i) {
  return { char: String.fromCharCode(buf[i]), width: 1 };
}

export function decodeCharAtUtf8(buf, i) {
  const b0 = buf[i];
  let width = 1;
  if ((b0 & 0x80) === 0x00) width = 1;
  else if ((b0 & 0xe0) === 0xc0) width = 2;
  else if ((b0 & 0xf0) === 0xe0) width = 3;
  else if ((b0 & 0xf8) === 0xf0) width = 4;
  // Invalid/truncated lead byte falls through with width 1; toString()
  // below then surfaces U+FFFD, consistent with Node's own UTF-8 handling
  // rather than us inventing a different fallback.
  if (i + width > buf.length) width = buf.length - i;
  const char = buf.toString('utf8', i, i + width);
  return { char, width };
}

/** UTF-8 continuation bytes (10xxxxxx) are not separate characters. */
export function isUtf8ContinuationByte(b) {
  return (b & 0xc0) === 0x80;
}
