import { ParseError, ErrorCode } from '../ParseError.js';
import { createByteScanStrategy, decodeCharAtUtf8 } from '../Encoding/ScanStrategy/ByteScanStrategy.js';
import { QUOTE_PAIRS_CAPACITY } from '../util.js';

const Constants = {
  space: 32,
  tab: 9,
};

// Zero-config default when no profile is supplied (e.g. tests/callers that
// construct BufferSource directly rather than through XMLParser): UTF-8
// byte-scan. Identical output/cost to the pre-encoding-feature code for pure
// ASCII content (the common case) and correctly decodes multi-byte UTF-8,
// which the old raw fromCharCode() path did not.
const DEFAULT_SCAN_STRATEGY = createByteScanStrategy(decodeCharAtUtf8, 'utf8');

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
  /**
   * @param {Buffer} bytesArr — the full XML document as a Node.js Buffer
   * @param {object} [options]
   * @param {boolean} [options.autoFlush=true]      — enable automatic flushing
   * @param {number}  [options.flushThreshold=1024] — flush after this many processed bytes
   * @param {object}  [profile] — resolved encoding profile from
   *   Encoding/EncodingProfile.js#buildProfileForBuffer. Omit for the
   *   zero-config UTF-8 default (used directly by tests/callers that don't
   *   go through XMLParser).
   */
  constructor(bytesArr, options = {}, profile = null) {
    // BOM bytes (if any) are detection artifacts, not content — strip them
    // and exclude from the index.
    this.buffer = profile?.bomLength ? bytesArr.subarray(profile.bomLength) : bytesArr;
    if (profile?.decodeFirst) {
      // Not self-synchronizing (UTF-16, or a custom encoding that didn't
      // assert selfSynchronizing) — byte-level delimiter scanning is unsafe,
      // so decode the whole buffer once up front and hand off to
      // CharScanStrategy, which then behaves exactly like StringSource.
      const decoder = profile.descriptor.createDecoder();
      this.buffer = decoder.write(this.buffer) + decoder.end();
    }
    this.startIndex = 0;

    this.autoFlush = options.autoFlush !== false;
    this.flushThreshold = options.flushThreshold ?? 1024;

    // Token-start checkpoint for mark/rewind (mirrors FeedableSource API).
    this._tokenStart = -1;

    // Reused across every scanTagExpEnd() call, never reallocated. See
    // StringSource.js's copy of this field for the full doc. Populated by
    // whichever ScanStrategy (byte or char) is assigned below.
    this._quotePairs = new Int32Array(QUOTE_PAIRS_CAPACITY);
    this._quotePairsLen = 0;

    // Resolve once, dispatch polymorphically from here on — no encoding
    // branching anywhere else in this class. See EncodingProfile.js.
    const strategy = profile?.scanStrategy ?? DEFAULT_SCAN_STRATEGY;
    Object.assign(this, strategy);
    this.encodingName = profile?.descriptor?.name ?? 'utf8';
    // See EncodingProfile.js's buildProfileForBuffer() doc — false only for
    // ByteScanStrategy+utf8, where a raw byte offset can land mid-character
    // once decoded. DEFAULT_SCAN_STRATEGY (used when no profile is supplied)
    // is itself utf8 byte-scan, so the no-profile default must also be false.
    this._quotePairsUsable = profile ? profile.quotePairsUsable !== false : false;
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
}
