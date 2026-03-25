import { ParseError, ErrorCode } from '../ParseError.js';

const Constants = {
  space: 32,
  tab: 9,
};

/**
 * BufferSource — input source backed by a Node.js Buffer (byte array).
 *
 * ### Memory reclamation
 *
 * The full document is available from the start, so there is no chunk-boundary
 * risk and rewindToMark() is a safe no-op. However, the parsed prefix of the
 * Buffer is held in memory until the parse finishes. flush() reclaims it by
 * slicing the Buffer and resetting startIndex to 0.
 *
 * The same mark/flush protocol used by FeedableSource is implemented here so
 * all reader functions work without source-type conditionals:
 *
 *   markTokenStart()  — save current read position at the start of a token
 *   rewindToMark()    — no-op for BufferSource (full doc always present)
 *   flush()           — drop the already-parsed prefix to free memory
 *
 * Auto-flush fires inside updateBufferBoundary() whenever the processed
 * portion exceeds flushThreshold and no token checkpoint is active.
 */
export default class BufferSource {
  /**
   * @param {Buffer} bytesArr — the full XML document as a Node.js Buffer
   * @param {object} [options]
   * @param {boolean} [options.autoFlush=true]      — enable automatic flushing
   * @param {number}  [options.flushThreshold=1024] — flush after this many processed bytes
   */
  constructor(bytesArr, options = {}) {
    this.line = 1;
    this.cols = 0;
    this.buffer = bytesArr;
    this.startIndex = 0;

    this.autoFlush = options.autoFlush !== false;
    this.flushThreshold = options.flushThreshold ?? 1024;

    // Token-start checkpoint for mark/rewind (mirrors FeedableSource API).
    this._tokenStart = -1;
  }

  // ─── Token-start checkpoint ───────────────────────────────────────────────

  /**
   * Save the current read position as the start of a new logical token.
   *
   * For BufferSource this primarily guards flush() from reclaiming data that
   * is still being read, mirroring the same safety invariant as FeedableSource.
   */
  markTokenStart() {
    this._tokenStart = this.startIndex;
  }

  /**
   * Restore startIndex to the last markTokenStart() position.
   *
   * BufferSource always has the full document available, so a mid-token end
   * of input cannot occur and this method is a safe no-op. It exists solely
   * so caller code can call rewindToMark() unconditionally without branching
   * on source type.
   */
  rewindToMark() {
    // No-op: the complete document is in memory; no rewind is ever needed.
  }

  /**
   * Discard the already-processed prefix of the buffer to free memory.
   *
   * Uses Buffer.subarray() (zero-copy view) rather than Buffer.slice() for
   * clarity, then copies to a fresh Buffer so the original allocation can be
   * GC'd. If a token checkpoint is active, the flush origin is moved back to
   * the checkpoint so the in-progress token is preserved.
   */
  flush() {
    const origin = this._tokenStart >= 0 ? this._tokenStart : this.startIndex;
    if (origin > 0) {
      // Buffer.from(subarray) copies the bytes so the original large Buffer
      // can be released by the GC once no other references remain.
      this.buffer = Buffer.from(this.buffer.subarray(origin));
      if (this._tokenStart >= 0) {
        this.startIndex -= origin;
        this._tokenStart = 0;
      } else {
        this.startIndex = 0;
      }
    }
  }

  // ─── Core read interface ──────────────────────────────────────────────────

  readCh() {
    return String.fromCharCode(this.buffer[this.startIndex++]);
  }

  readChAt(index) {
    return String.fromCharCode(this.buffer[this.startIndex + index]);
  }

  readStr(n, from) {
    if (typeof from === 'undefined') from = this.startIndex;
    return this.buffer.slice(from, from + n).toString();
  }

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
        const result = this.buffer.slice(this.startIndex, i).toString();
        this.startIndex = i + stopLength;
        return result;
      }
    }

    throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
  }

  readUptoCloseTag(stopStr) { // stopStr: "</tagname"
    const inputLength = this.buffer.length;
    const stopLength = stopStr.length;
    const stopBuffer = Buffer.from(stopStr);
    let stopIndex = 0;
    // 0: non-matching, 1: tag-name matched (scanning for '>'), 2: full match
    let match = 0;

    for (let i = this.startIndex; i < inputLength; i++) {
      if (match === 1) {
        if (stopIndex === 0) stopIndex = i;
        if (this.buffer[i] === Constants.space || this.buffer[i] === Constants.tab) continue;
        else if (this.buffer[i] === '>') match = 2; // TODO: compare against ASCII code if needed
      } else {
        match = 1;
        for (let j = 0; j < stopLength; j++) {
          if (this.buffer[i + j] !== stopBuffer[j]) { match = 0; break; }
        }
      }
      if (match === 2) {
        const result = this.buffer.slice(this.startIndex, stopIndex - 1).toString();
        this.startIndex = i + 1;
        return result;
      }
    }

    throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
  }

  readFromBuffer(n, shouldUpdate) {
    let ch;
    if (n === 1) {
      ch = this.buffer[this.startIndex];
      if (ch === 10) { // '\n'
        this.line++;
        this.cols = 1;
      } else {
        this.cols++;
      }
      ch = String.fromCharCode(ch);
    } else {
      this.cols += n;
      ch = this.buffer.slice(this.startIndex, this.startIndex + n).toString();
    }
    if (shouldUpdate) this.updateBufferBoundary(n);
    return ch;
  }

  /**
   * Advance the read cursor by n bytes.
   *
   * Triggers an automatic flush of already-processed data when autoFlush is
   * enabled, the processed portion has grown past flushThreshold, and no
   * token checkpoint is currently active (a flush while a checkpoint is live
   * would invalidate the saved position).
   *
   * @param {number} [n=1]
   */
  updateBufferBoundary(n = 1) {
    this.startIndex += n;
    if (this.autoFlush && this.startIndex >= this.flushThreshold && this._tokenStart < 0) {
      this.flush();
    }
  }

  canRead(n) {
    n = (n !== undefined) ? n : this.startIndex;
    return this.buffer.length - n > 0;
  }
}