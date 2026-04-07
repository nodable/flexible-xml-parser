import { ParseError, ErrorCode } from '../ParseError.js';

/**
 * StringSource — input source backed by an in-memory string.
 *
 * ### Memory reclamation
 *
 * Unlike FeedableSource, the full document is available from the start, so
 * there is no chunk-boundary risk and rewindToMark() is a safe no-op.
 * However, the parsed prefix of the string is still held in memory until the
 * parse finishes. flush() reclaims that prefix by slicing the buffer and
 * resetting startIndex to 0.
 *
 * The same mark/flush protocol used by FeedableSource is implemented here so
 * all reader functions (readTagExp, readClosingTagName, readCdata, etc.) work
 * without any source-type conditionals:
 *
 *   markTokenStart()  — save the current read position at the start of a token
 *   rewindToMark()    — no-op for StringSource (full doc always present)
 *   flush()           — drop the already-parsed prefix to free memory
 *
 * Auto-flush fires inside updateBufferBoundary() whenever the processed
 * portion exceeds flushThreshold and no token checkpoint is active.
 */
export default class StringSource {
  /**
   * @param {string} str — the full XML document string
   * @param {object} [options]
   * @param {boolean} [options.autoFlush=true]      — enable automatic flushing
   * @param {number}  [options.flushThreshold=1024] — flush after this many processed chars
   */
  constructor(str, options = {}) {
    this.line = 1;
    this.cols = 0;
    this.buffer = str;
    // Boundary pointer: data before this index has been consumed and may be freed.
    this.startIndex = 0;

    this.autoFlush = options.autoFlush !== false;
    this.flushThreshold = options.flushThreshold ?? 1024;

    // Two-level mark stack matching FeedableSource's API.
    // _marks[0] = outer mark (parseXml loop), _marks[1] = inner mark (readers).
    // -1 means "not set" for that level.
    this._marks = [-1, -1];
  }

  // ─── Token-start checkpoint ───────────────────────────────────────────────

  /**
   * Save the current read position into the two-level mark stack.
   *
   * Mirrors FeedableSource's two-level API so all reader functions work
   * identically regardless of source type:
   *
   *   level 0 (default) — outer mark, set by parseXml()'s main loop.
   *   level 1           — inner mark, set by individual reader functions.
   *
   * For StringSource the distinction only matters for flush() boundary
   * calculations — rewindToMark() is always a no-op here.
   *
   * @param {0|1} [level=0]
   */
  markTokenStart(level = 0) {
    this._marks[level] = this.startIndex;
  }

  /**
   * Restore startIndex to the last markTokenStart() position.
   *
   * StringSource always has the full document available, so a mid-token end
   * of input cannot occur and this method is a safe no-op. It exists solely
   * so caller code (XMLParser.feed / parseXml) can call rewindToMark()
   * unconditionally without branching on source type.
   */
  rewindToMark() {
    // No-op: the complete document is in memory; no rewind is ever needed.
  }

  /** Clear both mark slots (mirrors FeedableSource.clearMark). */
  clearMark() {
    this._marks[0] = -1;
    this._marks[1] = -1;
  }

  /**
   * Discard the already-processed prefix of the buffer to free memory.
   *
   * The flush origin is the minimum of all active mark positions so that any
   * in-progress token (at either mark level) is preserved in the buffer.
   * If no marks are active, the origin is startIndex itself.
   */
  flush() {
    let origin = this.startIndex;
    for (const m of this._marks) {
      if (m >= 0 && m < origin) origin = m;
    }
    if (origin > 0) {
      this.buffer = this.buffer.substring(origin);
      for (let i = 0; i < this._marks.length; i++) {
        if (this._marks[i] >= 0) this._marks[i] -= origin;
      }
      this.startIndex -= origin;
    }
  }

  // ─── Core read interface ──────────────────────────────────────────────────

  readCh() {
    return this.buffer[this.startIndex++];
  }

  readChAt(index) {
    return this.buffer[this.startIndex + index];
  }

  readStr(n, from) {
    if (typeof from === 'undefined') from = this.startIndex;
    return this.buffer.substring(from, from + n);
  }

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
        this.startIndex = i + stopLength;
        return result;
      }
    }

    throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
  }

  readUptoChar(stopChar) {
    const i = this.buffer.indexOf(stopChar, this.startIndex);
    if (i === -1) throw new ParseError(`Unexpected end of source reading '${stopChar}'`, ErrorCode.UNEXPECTED_END);
    const result = this.buffer.substring(this.startIndex, i);
    this.startIndex = i + 1;
    return result;
  }

  readUptoCloseTag(stopStr) { // stopStr: "</tagname"
    const inputLength = this.buffer.length;
    const stopLength = stopStr.length;
    let stopIndex = 0;
    // 0: non-matching, 1: tag-name matched (scanning for '>'), 2: full match
    let match = 0;

    for (let i = this.startIndex; i < inputLength; i++) {
      if (match === 1) {
        if (stopIndex === 0) stopIndex = i;
        if (this.buffer[i] === ' ' || this.buffer[i] === '\t') continue;
        else if (this.buffer[i] === '>') match = 2;
      } else {
        match = 1;
        for (let j = 0; j < stopLength; j++) {
          if (this.buffer[i + j] !== stopStr[j]) { match = 0; break; }
        }
      }
      if (match === 2) {
        const result = this.buffer.substring(this.startIndex, stopIndex - 1);
        this.startIndex = i + 1;
        return result;
      }
    }

    throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
  }

  readFromBuffer(n, updateIndex) {
    const ch = n === 1
      ? this.buffer[this.startIndex]
      : this.buffer.substring(this.startIndex, this.startIndex + n);
    if (updateIndex) this.updateBufferBoundary(n);
    return ch;
  }

  /**
   * Advance the read cursor by n characters.
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
    const anyMarkActive = this._marks[0] >= 0 || this._marks[1] >= 0;
    if (this.autoFlush && this.startIndex >= this.flushThreshold && !anyMarkActive) {
      this.flush();
    }
  }

  canRead(n) {
    n = (n !== undefined) ? n : this.startIndex;
    return this.buffer.length - n > 0;
  }
}