import { ParseError, ErrorCode } from '../ParseError.js';

/**
 * FeedableSource — input source for the feed()/end() API.
 *
 * Accepts incremental string/Buffer chunks via feed(), accumulates them in a
 * single string buffer, and exposes the same read interface as StringSource so
 * Xml2JsParser can use it without modification.
 *
 * ### Incremental parsing
 *
 * The parser calls parseXml() after every feed() call, consuming as much of
 * the buffer as possible. When a chunk boundary falls mid-token (e.g. a CDATA
 * section split across two feeds), every reader function marks its start
 * position with markTokenStart() before it begins. If the reader throws
 * UNEXPECTED_END, the caller (XMLParser.feed) catches it and calls
 * rewindToMark() to restore startIndex to the beginning of the incomplete
 * token. The incomplete bytes stay in the buffer and are re-parsed on the
 * next feed() once the rest of the token has arrived.
 *
 * ### Two-level mark stack
 *
 * There are two mark levels:
 *
 *   Level 0 — outer mark, set by parseXml()'s main loop BEFORE it reads the
 *              '<' character that begins a tag dispatch. This is the position
 *              that rewindToMark() always restores to, so the full tag (including
 *              its '<![', '</', etc. prefix) is replayed correctly on the next
 *              feed().
 *
 *   Level 1 — inner mark, set by individual reader functions (readCdata,
 *              readClosingTagName, readTagExp, …) at the point where *they*
 *              begin. This does NOT affect rewindToMark(); it is used only by
 *              flush() to determine the safe trim boundary while a reader is
 *              in progress.
 *
 * Using two levels instead of a single slot prevents inner markTokenStart()
 * calls from overwriting the outer mark that feed() needs to rewind to.
 *
 * ### Memory
 *
 * Parsed data is reclaimed from the buffer automatically (autoFlush) once the
 * processed portion exceeds flushThreshold bytes. Because parseXml() runs per
 * chunk and completed tokens are consumed before the next chunk arrives, only
 * incomplete tokens at the current chunk boundary are retained — not the whole
 * document.
 *
 * maxBufferSize is checked against the live (unprocessed) portion of the
 * buffer plus the incoming chunk, not the raw buffer.length, so post-flush
 * sizing stays accurate.
 */
export default class FeedableSource {
  constructor(options = {}) {
    this.line = 1;
    this.cols = 0;
    this.buffer = '';
    this.startIndex = 0;
    this.isComplete = false;

    this.maxBufferSize = options.maxBufferSize || 10 * 1024 * 1024; // 10 MB
    this.autoFlush = options.autoFlush !== false;            // true by default
    this.flushThreshold = options.flushThreshold || 1024;             // 1 KB

    /**
     * Two-level mark stack.
     *
     * _marks[0] — outer mark: set by parseXml()'s loop before consuming '<'.
     *             rewindToMark() always restores startIndex here.
     * _marks[1] — inner mark: set by individual reader functions.
     *             Used only by flush() as the safe trim boundary.
     *
     * -1 means "not set" for that level.
     */
    this._marks = [-1, -1];
  }

  /**
   * Append a data chunk to the buffer.
   *
   * maxBufferSize is checked against the live unprocessed portion
   * (buffer.length - startIndex) plus the incoming data length. Data that has
   * already been parsed and is waiting to be flushed does not count against
   * the limit.
   *
   * @param {string|Buffer} data
   */
  feed(data) {
    const newData = typeof data === 'string' ? data : data.toString();
    const liveBytes = this.buffer.length - this.startIndex;

    if (liveBytes + newData.length > this.maxBufferSize) {
      throw new ParseError(
        `Buffer size limit exceeded (${liveBytes + newData.length} > ${this.maxBufferSize}). ` +
        `Increase feedable.maxBufferSize or reduce chunk size.`,
        ErrorCode.INVALID_INPUT
      );
    }

    this.buffer += newData;
  }

  /** Signal that no more data will be fed. */
  end() {
    this.isComplete = true;
  }

  /**
   * Returns true when there is at least one character available at or after
   * the given offset (relative to startIndex).
   * @param {number} [n=0]
   */
  canRead(n = 0) {
    return this.startIndex + n < this.buffer.length;
  }

  // ─── Two-level mark API ───────────────────────────────────────────────────

  /**
   * Save the current read position into the mark stack.
   *
   * The `level` parameter selects which mark slot to write:
   *
   *   level 0 (default) — outer mark, written by parseXml()'s main loop
   *                        before it reads the '<' that begins a dispatch.
   *   level 1           — inner mark, written by reader functions
   *                        (readCdata, readClosingTagName, readTagExp, …)
   *                        at the start of their own logic.
   *
   * The two levels are independent. An inner markTokenStart(1) never
   * overwrites the outer mark[0] that rewindToMark() relies on.
   *
   * @param {0|1} [level=0]
   */
  markTokenStart(level = 0) {
    this._marks[level] = this.startIndex;
  }

  /**
   * Restore startIndex to the OUTER mark (level 0) and clear both marks.
   *
   * Always rewinds to the outermost saved position so the full tag —
   * including any prefix characters consumed by parseXml() before the
   * dispatch (e.g. '<', '!', '[') — is replayed on the next feed().
   *
   * Called by XMLParser.feed() when a reader throws UNEXPECTED_END.
   */
  rewindToMark() {
    if (this._marks[0] >= 0) {
      this.startIndex = this._marks[0];
    }
    this._marks[0] = -1;
    this._marks[1] = -1;
  }

  /**
   * Clear both mark slots after a token completes successfully.
   *
   * Should be called (or marks allowed to be overwritten) once a dispatch
   * fully succeeds so stale positions don't block flush().
   *
   * In practice the outer mark is overwritten at the top of every
   * parseXml() loop iteration, so explicit clearing is only needed when
   * the loop does NOT continue (e.g. after a non-'<' character is consumed
   * as plain text). The flush guard uses the minimum of set marks, so a
   * stale mark only delays flushing — it does not cause correctness issues.
   */
  clearMark() {
    this._marks[0] = -1;
    this._marks[1] = -1;
  }

  /**
   * Read next character and advance position.
   * @returns {string}
   */
  readCh() {
    const ch = this.buffer[this.startIndex++];

    if (ch === '\n') {
      this.line++;
      this.cols = 0;
    } else {
      this.cols++;
    }

    return ch;
  }

  /**
   * Read character at offset without advancing.
   * @param {number} index - Offset from current position
   * @returns {string}
   */
  readChAt(index) {
    return this.buffer[this.startIndex + index];
  }

  /**
   * Read n characters as string.
   * @param {number} n    - Number of characters to read
   * @param {number} from - Start position (default: current position)
   * @returns {string}
   */
  readStr(n, from) {
    if (typeof from === 'undefined') from = this.startIndex;
    return this.buffer.substring(from, from + n);
  }

  /**
   * Read until stop string is found.
   * @param {string} stopStr
   * @returns {string} content before the stop string (stop string is consumed)
   * @throws {ParseError} UNEXPECTED_END when stop string is not found
   */
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

  /**
   * Single-character variant of readUpto — faster because there is no inner
   * match loop.  Reads until `stopChar` is found, consumes it, and returns
   * the text before it.
   *
   * @param {string} stopChar  Exactly one character.
   * @returns {string}
   */
  readUptoChar(stopChar) {
    const i = this.buffer.indexOf(stopChar, this.startIndex);
    if (i === -1) {
      throw new ParseError(`Unexpected end of source reading '${stopChar}'`, ErrorCode.UNEXPECTED_END);
    }
    const result = this.buffer.substring(this.startIndex, i);
    this.startIndex = i + 1;
    return result;
  }

  /**
   * Read until a closing tag is found (used for stop nodes).
   * @param {string} stopStr  e.g. `"</tagname"`
   * @returns {string} raw content between the current position and the closing tag
   * @throws {ParseError} UNEXPECTED_END when the closing tag is not found
   */
  readUptoCloseTag(stopStr) {
    const inputLength = this.buffer.length;
    const stopLength = stopStr.length;
    let tagMatchStart = -1;
    let state = 0; // 0=scanning, 1=tag-name matched (scanning for '>'), 2=full match

    for (let i = this.startIndex; i < inputLength; i++) {
      if (state === 1) {
        const c = this.buffer[i];
        if (c === ' ' || c === '\t') continue;
        if (c === '>') { state = 2; }
        else { state = 0; tagMatchStart = -1; } // false match e.g. </scriptX>
      } else {
        // Try to match stopStr at position i
        let matched = true;
        for (let j = 0; j < stopLength; j++) {
          if (this.buffer[i + j] !== stopStr[j]) { matched = false; break; }
        }
        if (matched) {
          state = 1;
          tagMatchStart = i;
          i += stopLength - 1; // skip past matched string
        }
      }
      if (state === 2) {
        const result = this.buffer.substring(this.startIndex, tagMatchStart);
        this.startIndex = i + 1;
        return result;
      }
    }

    throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
  }

  /**
   * Advance the read cursor by n characters.
   *
   * Triggers an automatic flush of already-processed data when autoFlush is
   * enabled, the processed portion has grown past flushThreshold, and no
   * mark is currently active. Any active mark (either level) blocks the
   * flush to prevent the saved position from becoming invalid.
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

  /**
   * Discard already-processed data from the front of the buffer to free memory.
   * startIndex is reset to 0 after the trim.
   *
   * The flush origin is the minimum of all active mark positions, so that any
   * in-progress token (at either mark level) is preserved in the buffer and
   * can be re-read after the flush.
   *
   * If no marks are active, the origin is startIndex itself — everything
   * before the current read position is discarded.
   */
  flush() {
    // Determine the earliest position that must be kept.
    let origin = this.startIndex;
    for (const m of this._marks) {
      if (m >= 0 && m < origin) origin = m;
    }

    if (origin > 0) {
      this.buffer = this.buffer.substring(origin);

      // Adjust all mark positions by the amount trimmed.
      for (let i = 0; i < this._marks.length; i++) {
        if (this._marks[i] >= 0) this._marks[i] -= origin;
      }

      this.startIndex -= origin;
    }
  }
}