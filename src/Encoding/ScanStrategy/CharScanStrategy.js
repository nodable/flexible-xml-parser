import { ParseError, ErrorCode } from '../../ParseError.js';

/**
 * CharScanStrategy — for encodings that are NOT self-synchronizing (UTF-16
 * LE/BE by default, or any custom multi-byte encoding that doesn't assert
 * `selfSynchronizing: true`). Byte-level delimiter scanning is unsafe for
 * these (an ASCII delimiter byte value can legitimately occur as part of a
 * different character), so the only correct option is to decode fully up
 * front and scan on the resulting JS string — exactly what StringSource
 * already does. This is that same algorithm, extracted so BufferSource can
 * reuse it verbatim instead of re-deriving a second copy.
 *
 * Cost model: one eager decode of the whole buffer at construction (not
 * per-token, not per-chunk) — see the encoding savepoint §8.4. Only paid by
 * documents that actually use one of these encodings; the default UTF-8/
 * ASCII/Latin-1 path never touches this file.
 */
export function createCharScanStrategy() {
  return {
    readCh() {
      const ch = this.buffer[this.startIndex++];
      if (ch === '\n') { this.line++; this.cols = 0; }
      else { this.cols++; }
      return ch;
    },

    readChAt(index) {
      return this.buffer[this.startIndex + index];
    },

    readStr(n, from) {
      if (typeof from === 'undefined') from = this.startIndex;
      return this.buffer.substring(from, from + n);
    },

    scanTagExpEnd() {
      const buf = this.buffer;
      const len = buf.length;
      const start = this.startIndex;
      let inSingle = false;
      let inDouble = false;
      for (let i = start; i < len; i++) {
        const c = buf[i];
        if (c === "'") { if (!inDouble) inSingle = !inSingle; }
        else if (c === '"') { if (!inSingle) inDouble = !inDouble; }
        else if (c === '>' && !inSingle && !inDouble) return i - start;
      }
      return -1;
    },

    _advanceLineCol(end) {
      let lastNewlineIdx = -1;
      for (let i = this.startIndex; i < end; i++) {
        if (this.buffer[i] === '\n') { this.line++; lastNewlineIdx = i; }
      }
      if (lastNewlineIdx >= 0) this.cols = end - lastNewlineIdx - 1;
      else this.cols += end - this.startIndex;
    },

    readUpto(stopStr) {
      const inputLength = this.buffer.length;
      const stopLength = stopStr.length;
      for (let i = this.startIndex; i < inputLength; i++) {
        let match = true;
        for (let j = 0; j < stopLength; j++) {
          if (this.buffer[i + j] !== stopStr[j]) { match = false; break; }
        }
        if (match) {
          const result = this.buffer.substring(this.startIndex, i);
          this._advanceLineCol(i + stopLength);
          this.startIndex = i + stopLength;
          return result;
        }
      }
      throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
    },

    readUptoChar(stopChar) {
      const i = this.buffer.indexOf(stopChar, this.startIndex);
      if (i === -1) {
        throw new ParseError(`Unexpected end of source reading '${stopChar}'`, ErrorCode.UNEXPECTED_END);
      }
      const result = this.buffer.substring(this.startIndex, i);
      this._advanceLineCol(i + 1);
      this.startIndex = i + 1;
      return result;
    },

    readUptoCloseTag(stopStr) {
      const inputLength = this.buffer.length;
      const stopLength = stopStr.length;
      let tagMatchStart = -1;
      let state = 0;
      for (let i = this.startIndex; i < inputLength; i++) {
        if (state === 1) {
          const c = this.buffer[i];
          if (c === ' ' || c === '\t') continue;
          if (c === '>') { state = 2; }
          else { state = 0; tagMatchStart = -1; }
        } else {
          let matched = true;
          for (let j = 0; j < stopLength; j++) {
            if (this.buffer[i + j] !== stopStr[j]) { matched = false; break; }
          }
          if (matched) { state = 1; tagMatchStart = i; i += stopLength - 1; }
        }
        if (state === 2) {
          const result = this.buffer.substring(this.startIndex, tagMatchStart);
          this._advanceLineCol(i + 1);
          this.startIndex = i + 1;
          return result;
        }
      }
      throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
    },

    readFromBuffer(n, shouldUpdate) {
      const ch = n === 1
        ? this.buffer[this.startIndex]
        : this.buffer.substring(this.startIndex, this.startIndex + n);
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
