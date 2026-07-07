import { ParseError, ErrorCode } from '../ParseError.js';
import { StringDecoder } from 'node:string_decoder';
import { sniff } from '../Encoding/EncodingDetector.js';

// Matches EncodingDetector's own declaration-peek window — bounds how much
// raw (undecoded) data 'auto' mode ever holds before giving up and resolving
// on whatever it has (a document with no BOM and no <?xml?> declaration is
// legitimately using the utf8 default, not something to keep waiting on).
const SNIFF_CAP = 200;

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

    // See StringSource.js's copy of this comment — same handoff, same
    // reason for using plain fields instead of a per-call object.
    this._pendingScanEnd = -1;
    this._pendingScanNewlineCount = 0;
    this._pendingScanLastNewlineIdx = -1;

    this.maxBufferSize = options.maxBufferSize || 10 * 1024 * 1024; // 10 MB
    this.autoFlush = options.autoFlush !== false;            // true by default
    this.flushThreshold = options.flushThreshold || 1024;             // 1 KB

    // Encoding resolution. Three modes:
    //   - explicit name (options.decoding.encoding, e.g. 'utf16le'): resolve
    //     a decoder immediately via the registry.
    //   - 'auto': can't build a decoder yet — not enough bytes seen. Buffer
    //     raw (undecoded) bytes in `_sniffBuffer` until either a BOM+enough
    //     bytes, a complete `<?xml ... ?>` declaration, or SNIFF_CAP bytes
    //     have accumulated, then resolve once via _resolveDetection() and
    //     replay the held bytes through the real decoder. See feed() below.
    //   - neither supplied (direct FeedableSource construction, bypassing
    //     XMLParser): falls back to a caller-supplied `options.createDecoder`
    //     if given, else plain utf8 — identical to this class's behavior
    //     before this feature existed.
    this._decodingOptions = options.decoding || null;
    const requestedEncoding = this._decodingOptions?.encoding;
    this._detecting = requestedEncoding === 'auto';
    this._sniffBuffer = this._detecting ? Buffer.alloc(0) : null;
    if (!this._detecting && requestedEncoding && this._decodingOptions.registry) {
      const registry = this._decodingOptions.registry;
      this._createDecoder = () => registry.resolve(requestedEncoding).createDecoder();
    } else {
      this._createDecoder = typeof options.createDecoder === 'function' ? options.createDecoder : null;
    }

    /**
     * Two-level mark stack.
     *
     * _marks[0] — outer mark: set by parseXml()'s loop before consuming '<'.
     *             rewindToMark() always restores startIndex here.
     * _marks[1] — inner mark: set by individual reader functions.
     *             Used only by flush() as the safe trim boundary.
     *
     * `null` means "not set" for that level.
     *
     * Each entry is { startIndex, line, cols } (or null when unset) — line/cols
     * are captured alongside startIndex so a rewind can undo readCh()'s
     * line/col advancement too, not just the buffer offset. Without this,
     * any token that fails mid-read (UNEXPECTED_END) and gets replayed on
     * the next feed() double-counts every '\n' it consumed before failing.
     */
    this._marks = [null, null];

    /**
     * Lazily-created, persistent across the whole feed() session. Buffer
     * chunks must go through this rather than Buffer#toString() per chunk —
     * toString() decodes each chunk in isolation, so a multi-byte UTF-8
     * character whose bytes straddle a chunk boundary gets corrupted (each
     * half independently replaced with U+FFFD). StringDecoder holds back an
     * incomplete trailing sequence internally and prepends it to the next
     * write(), so a split character decodes correctly once the rest of its
     * bytes arrive. Only created if Buffer input is ever fed — string-only
     * callers never pay for it.
     */
    this._decoder = null;
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
   * @returns {number} number of characters appended to the buffer (after
   *   decoding) — callers that track fed-byte totals (e.g. XMLParser.feed's
   *   batch threshold) should use this rather than the raw input length,
   *   since a Buffer chunk ending mid-character may decode to fewer chars
   *   than its byte length until the next chunk completes the sequence.
   */
  feed(data) {
    if (this._detecting) {
      if (typeof data === 'string') {
        // Already decoded upstream (e.g. stream.setEncoding() was called by
        // the caller) — detection is moot, nothing left to sniff.
        this._detecting = false;
      } else {
        const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this._sniffBuffer = this._sniffBuffer.length ? Buffer.concat([this._sniffBuffer, chunk]) : chunk;
        const declarationComplete = this._sniffBuffer.includes(Buffer.from('?>'));
        if (this._sniffBuffer.length < SNIFF_CAP && !declarationComplete) {
          // Not enough to decide yet — hold everything, decode nothing.
          return 0;
        }
        data = this._resolveDetection();
      }
    }

    let newData = this._decodeNow(data);

    const liveBytes = this.buffer.length - this.startIndex;

    if (liveBytes + newData.length > this.maxBufferSize) {
      throw new ParseError(
        `Buffer size limit exceeded (${liveBytes + newData.length} > ${this.maxBufferSize}). ` +
        `Increase feedable.maxBufferSize or reduce chunk size.`,
        ErrorCode.INVALID_INPUT
      );
    }

    this.buffer += newData;
    return newData.length;
  }

  /** @private */
  _decodeNow(data) {
    if (typeof data === 'string') return data;
    if (Buffer.isBuffer(data)) {
      // Stateful decode: bytes of a multi-byte char split across two feed()
      // calls are buffered internally by StringDecoder and correctly
      // stitched together, instead of each chunk being decoded in isolation.
      if (!this._decoder) this._decoder = this._createDecoder ? this._createDecoder() : new StringDecoder('utf8');
      return this._decoder.write(data);
    }
    if (data?.toString) return data.toString();
    throw new ParseError('feed() data must be a string or Buffer.', ErrorCode.DATA_MUST_BE_STRING);
  }

  /**
   * Resolve 'auto' encoding from `_sniffBuffer` (BOM + `<?xml encoding="...">`
   * sniffing, XML 1.0 Appendix F — see Encoding/EncodingDetector.js), build
   * the real decoder, strip any BOM, and return the held bytes ready to be
   * decoded normally by the caller in feed(). Runs exactly once per session.
   * @private
   * @returns {Buffer}
   */
  _resolveDetection() {
    const registry = this._decodingOptions.registry;
    const { encoding, bomLength } = sniff(this._sniffBuffer, registry);
    const descriptor = registry.resolve(encoding);
    this._createDecoder = () => descriptor.createDecoder();
    this._detecting = false;
    const held = bomLength ? this._sniffBuffer.subarray(bomLength) : this._sniffBuffer;
    this._sniffBuffer = null;
    return held;
  }

  /** Signal that no more data will be fed. */
  end() {
    if (this._detecting) {
      // Whole document arrived without ever reaching SNIFF_CAP or a
      // complete declaration (a short, unadorned document like <root/>) —
      // resolve now, on whatever bytes we have.
      const held = this._resolveDetection();
      this.buffer += this._decodeNow(held);
    }
    if (this._decoder) {
      // Flush any final incomplete byte sequence held by the decoder. For
      // well-formed UTF-8 input this is normally '' (nothing pending); a
      // non-empty result here means the input was genuinely truncated
      // mid-character, and StringDecoder's own U+FFFD substitution is the
      // correct, standard behavior for that case.
      const tail = this._decoder.end();
      if (tail) this.buffer += tail;
    }
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
    this._marks[level] = { startIndex: this.startIndex, line: this.line, cols: this.cols };
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
    if (this._marks[0] !== null) {
      this.startIndex = this._marks[0].startIndex;
      this.line = this._marks[0].line;
      this.cols = this._marks[0].cols;
    }
    this._marks[0] = null;
    this._marks[1] = null;
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
    this._marks[0] = null;
    this._marks[1] = null;
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
   * See StringSource.js's copy of this method for the full doc — identical
   * contract here. `null` (not enough buffered data yet) is the routine
   * case for this source in particular, since a chunk boundary can land
   * mid-check; callers already have to handle that the same way they
   * handle scanTagExpEnd's -1.
   */
  matchAhead(expected, caseInsensitive = false) {
    const len = expected.length;
    for (let i = 0; i < len; i++) {
      let ch = this.buffer[this.startIndex + i];
      if (ch === undefined) return null;
      if (caseInsensitive) ch = ch.toLowerCase();
      if (ch !== expected[i]) return false;
    }
    return true;
  }

  /**
   * Quote-aware scan, from the current read position, for the unquoted '>'
   * that ends a tag expression. Used by readTagExp() — replaces the old
   * per-char canRead(i)/readChAt(i) loop, which profiling showed as the
   * single largest hotspot (~23-26% of parse time).
   *
   * IMPORTANT: bracket char access (`buf[i]`), not `charCodeAt(i)`. This
   * source's buffer is built via repeated `+=` in feed() (a growing V8
   * ConsString/rope). charCodeAt forces a full rope-flatten on access —
   * confirmed via a crash (Runtime_StringCharCodeAt -> String::SlowFlatten)
   * causing real O(n^2) memory growth when this was first written with
   * charCodeAt. Bracket access matches what the pre-existing readChAt()
   * already safely used.
   *
   * @returns {number} relative offset of the unquoted '>', or -1 if the
   *   buffer runs out first — caller treats that as UNEXPECTED_END, the
   *   normal retryable chunk-boundary signal for this source.
   */
  scanTagExpEnd() {
    const buf = this.buffer;
    const len = buf.length;
    const start = this.startIndex;
    let inSingle = false;
    let inDouble = false;
    let newlineCount = 0;
    let lastNewlineIdx = -1;
    for (let i = start; i < len; i++) {
      const c = buf[i];
      if (c === "'") {
        if (!inDouble) inSingle = !inSingle;
      } else if (c === '"') {
        if (!inSingle) inDouble = !inDouble;
      } else if (c === '>' && !inSingle && !inDouble) {
        // See StringSource.js's copy of this method for why — same fix,
        // same reason, kept consistent across all input sources.
        this._pendingScanEnd = i;
        this._pendingScanNewlineCount = newlineCount;
        this._pendingScanLastNewlineIdx = lastNewlineIdx;
        return i - start;
      } else if (c === '\n') {
        newlineCount++;
        lastNewlineIdx = i;
      }
    }
    return -1;
  }

  /**
   * Read until stop string is found.
   * @param {string} stopStr
   * @returns {string} content before the stop string (stop string is consumed)
   * @throws {ParseError} UNEXPECTED_END when stop string is not found
   */
  /**
   * Scan buffer[this.startIndex, end) for '\n' and advance line/cols to match,
   * mirroring readCh()'s per-char logic. Does NOT touch startIndex — callers
   * set that themselves afterwards (their "end" is not always startIndex + n;
   * readUptoCloseTag's consumed span includes the matched stop string).
   *
   * Shared by updateBufferBoundary() and the readUpto*() family so every path
   * that advances the cursor in bulk keeps line/col accurate, not just the
   * single-character readCh() path.
   *
   * @param {number} end — exclusive end of the span being skipped
   */
  _advanceLineCol(end) {
    let lastNewlineIdx = -1;
    for (let i = this.startIndex; i < end; i++) {
      if (this.buffer[i] === '\n') {
        this.line++;
        lastNewlineIdx = i;
      }
    }
    if (lastNewlineIdx >= 0) {
      this.cols = end - lastNewlineIdx - 1;
    } else {
      this.cols += end - this.startIndex;
    }
  }

  readUpto(stopStr) {
    const inputLength = this.buffer.length;
    const stopLength = stopStr.length;
    let newlineCount = 0;
    let lastNewlineIdx = -1;

    for (let i = this.startIndex; i < inputLength; i++) {
      if (this.buffer[i] === '\n') { newlineCount++; lastNewlineIdx = i; }
      let match = true;
      for (let j = 0; j < stopLength; j++) {
        if (this.buffer[i + j] !== stopStr[j]) { match = false; break; }
      }
      if (match) {
        const result = this.buffer.substring(this.startIndex, i);
        const end = i + stopLength;
        // Already counted every '\n' up to (not including) i above — the
        // matched stop string itself never contains one (it's a fixed XML
        // delimiter like '</tagname' or ']]>').
        if (newlineCount > 0) this.line += newlineCount, this.cols = end - lastNewlineIdx - 1;
        else this.cols += end - this.startIndex;
        this.startIndex = end;
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
    this._advanceLineCol(i + 1);
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
    let newlineCount = 0;
    let lastNewlineIdx = -1;

    for (let i = this.startIndex; i < inputLength; i++) {
      if (this.buffer[i] === '\n') { newlineCount++; lastNewlineIdx = i; }
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
        const end = i + 1;
        if (newlineCount > 0) this.line += newlineCount, this.cols = end - lastNewlineIdx - 1;
        else this.cols += end - this.startIndex;
        this.startIndex = end;
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
    const end = this.startIndex + n;
    const pendingEnd = this._pendingScanEnd;
    this._pendingScanEnd = -1;
    if (pendingEnd !== -1 && end === pendingEnd + 1) {
      if (this._pendingScanNewlineCount > 0) {
        this.line += this._pendingScanNewlineCount;
        this.cols = end - this._pendingScanLastNewlineIdx - 1;
      } else {
        this.cols += end - this.startIndex;
      }
      this.startIndex = end;
    } else {
      this._advanceLineCol(end);
      this.startIndex = end;
    }
    // No "any mark active" gate here — flush()'s own min(startIndex, marks...)
    // origin computation already guarantees any in-progress token (at either
    // mark level) survives the trim. A separate boolean gate on top of that
    // was redundant, and since _marks[0] is set on every parseXml() loop
    // iteration and never nulled outside of rewindToMark() (an error path),
    // that gate was effectively permanent — flush() never ran in normal
    // operation. See specs/flushArchitecture_spec.js for the regression test.
    if (this.autoFlush && this.startIndex >= this.flushThreshold) {
      this.flush();
    }
  }

  /**
   * Discard already-processed data from the front of the buffer to free memory.
   * startIndex is reset to 0 after the trim.
   *
   * The flush origin is the minimum of all active mark positions, so that any
   * in-progress token (at either mark level) is preserved in the buffer and
   * can be re-read after the flush. This is the sole safety mechanism for
   * flush() — callers do not need to additionally check "is a mark active"
   * before calling this; an active mark simply caps how much origin can
   * advance, rather than blocking the call outright.
   *
   * If no marks are active, the origin is startIndex itself — everything
   * before the current read position is discarded.
   */
  flush() {
    // Determine the earliest position that must be kept.
    let origin = this.startIndex;
    for (const m of this._marks) {
      if (m !== null && m.startIndex < origin) origin = m.startIndex;
    }

    if (origin > 0) {
      this.buffer = this.buffer.substring(origin);

      // Adjust all mark buffer-offsets by the amount trimmed.
      // line/cols are not buffer-relative — they stay untouched.
      const marksLen = this._marks.length;
      for (let i = 0; i < marksLen; i++) {
        if (this._marks[i] !== null) this._marks[i].startIndex -= origin;
      }

      this.startIndex -= origin;
    }
  }
}