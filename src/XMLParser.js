import { buildOptions } from './OptionsBuilder.js';
import { ParseError, ErrorCode } from './ParseError.js';
import Xml2JsParser from './Xml2JsParser.js';
import FeedableSource from './InputSource/FeedableSource.js';
import StreamSource from './InputSource/StreamSource.js';
import EncodingRegistry, { defaultEncodingRegistry } from './Encoding/EncodingRegistry.js';

export default class XMLParser {

  constructor(options) {
    this.options = buildOptions(options);

    // feed()/end() session state
    this._feedParser = null;
    this._feedSource = null;
    this._isFeeding = false;

    // ── Batching state ──────────────────────────────────
    this._pendingBytes = 0;
    this._batchThreshold = this.options.feedable?.bufferSize;

    // Per-instance encoding registry only when custom decoders are supplied
    // — avoids mutating the shared default registry (which would leak a
    // customDecoder registered on one XMLParser instance into every other
    // instance in the process). The common case (no customDecoders) reuses
    // the shared default registry, seeded once at module load.
    if (this.options.decoding?.customDecoders) {
      const registry = new EncodingRegistry();
      for (const [name, descriptor] of Object.entries(this.options.decoding.customDecoders)) {
        registry.register({ name, ...descriptor });
      }
      this.options.decoding._registry = registry;
    } else {
      this.options.decoding = this.options.decoding || {};
      this.options.decoding._registry = defaultEncodingRegistry;
    }

    // Shared tag/attribute name cache — lives on `options`, not on any one
    // Xml2JsParser instance, because `.parse()` creates a fresh Xml2JsParser
    // every call while `this.options` is passed by reference to all of them.
    // This lets repeated names skip re-validation/re-sanitization across
    // separate parse() calls on the same XMLParser instance, not just within
    // one document. See Xml2JsParser.js for what's cached and why.
    this.options._nameCache = { tags: new Map(), attrs: new Map() };
  }

  // ─── One-shot parse methods ───────────────────────────────────────────────

  /**
   * Parse an XML string or Buffer and return a JS object.
   * @param {string|Buffer} xmlData
   */
  parse(xmlData) {
    if (xmlData instanceof Buffer || ArrayBuffer.isView(xmlData)) {
      // Route through the encoding-aware path (auto-detect / configured
      // `decoding.encoding`) instead of an unconditional utf8 toString() —
      // otherwise a non-utf8 `decoding.encoding` option would silently be
      // ignored for Buffer input given directly to parse().
      return this.parseBytesArr(xmlData);
    } else if (typeof xmlData !== 'string') {
      if (xmlData && typeof xmlData.toString === 'function') {
        xmlData = xmlData.toString();
      } else {
        throw new ParseError('XML data must be a string or Buffer.', ErrorCode.INVALID_INPUT);
      }
    }

    const parser = this._createParser();
    const result = parser.parse(xmlData);
    this.wasExited = parser.wasExited();
    this._lastParseErrors = parser.autoCloseHandler?.getErrors() ?? [];
    return result;
  }

  /**
   * Parse a Uint8Array / byte array and return a JS object.
   * @param {Uint8Array|ArrayBufferView} xmlData
   */
  parseBytesArr(xmlData) {
    if (xmlData instanceof Uint8Array || ArrayBuffer.isView(xmlData)) {
      xmlData = Buffer.from(xmlData);
    } else {
      throw new ParseError('XML data must be a Uint8Array or ArrayBufferView.', ErrorCode.INVALID_INPUT);
    }

    const parser = this._createParser();
    const result = parser.parseBytesArr(xmlData);
    this.wasExited = parser.wasExited();
    this._lastParseErrors = parser.autoCloseHandler?.getErrors() ?? [];
    return result;
  }

  // ─── Stream input ─────────────────────────────────────────────────────────

  /**
   * Parse an XML Node.js Readable stream and return a Promise that resolves
   * with the parsed JS object.
   *
   * Chunks are processed incrementally as they arrive — parseXml() runs after
   * each 'data' event and already-consumed input is freed before the next
   * chunk arrives, so memory stays proportional to the largest incomplete token
   * at any chunk boundary rather than the total document size.
   *
   * @param {NodeJS.ReadableStream} readable
   * @returns {Promise<any>}
   */
  parseStream(readable) {
    if (!isReadableStream(readable)) {
      throw new ParseError('parseStream() requires a Node.js Readable stream.', ErrorCode.INVALID_STREAM);
    }

    const source = new StreamSource({
      ...this.options.feedable,
      decoding: { encoding: this.options.decoding.encoding, registry: this.options.decoding._registry },
    });
    const streamParser = this._createParser();
    streamParser.source = source;
    streamParser.initializeParser();

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (!settled) {
          settled = true;
          readable.destroy(); // stop further data/end events and free the handle
          reject(err);
        }
      };

      source.attachStream(
        readable,
        // onChunk — run the parser incrementally after each chunk arrives.
        // Mirrors what feed() does: advance as far as possible, rewind on
        // UNEXPECTED_END (chunk boundary mid-token), re-throw real errors.
        (err) => {
          if (err) { fail(err); return; }
          try {
            streamParser.parseXml();
          } catch (parseErr) {
            if (parseErr.code === ErrorCode.UNEXPECTED_END) {
              source.rewindToMark();
            } else {
              fail(parseErr);
            }
          }
        },
        // onEnd — stream finished cleanly; finalise the document.
        () => {
          if (settled) return;
          try {
            // source.end() (called by attachStream just before this) can
            // release content that was held back pending encoding detection
            // (see FeedableSource's 'auto' mode) — run parseXml() once more
            // to consume it before finalizing. No-op if there's nothing new.
            streamParser.parseXml();
            streamParser.finalizeXml();
            this._lastParseErrors = streamParser.autoCloseHandler?.getErrors() ?? [];
            settled = true;
            resolve(streamParser.outputBuilder.getOutput());
          } catch (err) { fail(err); }
        },
        // onError — stream-level error (e.g. file not found, network drop)
        fail,
      );
    });
  }

  // ─── Incremental feed()/end() API ────────────────────────────────────────

  _runParse() {
    if (!this._feedParser) return;

    const beforePos = this._feedSource.startIndex; // bytes consumed so far

    try {
      this._feedParser.parseXml();
    } catch (err) {
      if (err.code === ErrorCode.UNEXPECTED_END) {
        this._feedSource.rewindToMark();
      } else {
        throw err;
      }
    }

    const afterPos = this._feedSource.startIndex;
    const didAdvance = afterPos > beforePos;

    if (didAdvance) {
      // Real progress made — reset threshold normally
      this._pendingBytes = 0;
    } else {
      // Parser is stuck mid-token — grow the threshold to avoid
      // hammering parseXml() until significantly more data arrives
      this._batchThreshold = Math.min(
        this._batchThreshold * 2,
        this.options.feedable.maxBufferSize
      );
    }
  }

  /**
   * Feed an XML data chunk for incremental parsing.
   *
   * After appending the chunk, parseXml() is run immediately so the parser
   * advances as far as possible. If a chunk boundary falls mid-token, the
   * reader throws UNEXPECTED_END; this is caught here and the source is
   * rewound to the start of the incomplete token so it will be re-parsed on
   * the next feed() call once more data has arrived.
   *
   * Any other ParseError (unclosed quote, mismatched tag, etc.) is a real
   * parse failure and is re-thrown after cleaning up the session.
   *
   * Returns `this` for chaining.
   *
   * @param {string|Buffer} data
   * @returns {XMLParser}
   */
  feed(data) {
    if (!this._isFeeding) {
      this._initFeedSession();
    }

    // Pass raw data straight through — do NOT pre-convert Buffers to string
    // here. FeedableSource.feed() decodes Buffers via a persistent
    // StringDecoder so a multi-byte UTF-8 character split across two feed()
    // calls decodes correctly; converting each chunk with .toString() first
    // (as this used to do) decodes each chunk in isolation and corrupts a
    // split character. feed() itself validates the type and throws
    // DATA_MUST_BE_STRING for anything unsupported.
    const appendedLength = this._feedSource.feed(data);
    this._pendingBytes += appendedLength;

    if (this._pendingBytes >= this._batchThreshold) {
      this._runParse();
    }
    // Otherwise, delay parsing until next feed() or end()

    return this;
  }

  /**
   * Signal end of input, validate end-of-document state, and return the
   * parsed result. Throws if called before any feed() call.
   *
   * parseXml() is called one final time after marking the source complete.
   * This replays any bytes that were rewound during the last feed() call
   * (e.g. a tag that was split across the final chunk boundary). Now that
   * isComplete is true, any UNEXPECTED_END thrown by a reader means the
   * document is genuinely truncated — not a chunk boundary — so it is
   * treated as a real parse error rather than silently swallowed.
   *
   * autoClose partial-tag recovery works the same way it does in
   * _parseAndFinalize(): if autoCloseHandler is configured and parseXml()
   * throws UNEXPECTED_END, the handler is given a chance to recover before
   * finalizeXml() runs.
   *
   * @returns {any}
   */
  end() {
    if (!this._isFeeding) {
      throw new ParseError('No data fed. Call feed() before end().', ErrorCode.NOT_STREAMING);
    }

    // Force a final parse (any pending bytes are now processed)
    this._runParse();

    try {
      // Mark the source as complete so readers know there is no more data.
      this._feedSource.end();

      // Replay any bytes rewound during the last feed() call (e.g. an
      // incomplete tag at the very end of the input stream). Any
      // UNEXPECTED_END thrown here is a genuine truncation error.
      let partialTagError = null;
      const autoClose = this._feedParser.autoCloseHandler;
      if (autoClose) autoClose.reset();

      try {
        this._feedParser.parseXml();
      } catch (err) {
        if (err.code === ErrorCode.UNEXPECTED_END) {
          if (autoClose) {
            // autoClose recovery: treat the truncated tag the same way
            // _parseAndFinalize() does for the one-shot parse path.
            partialTagError = err;
          } else {
            // No recovery configured — truncated document is a hard error.
            throw err;
          }
        } else {
          throw err;
        }
      }

      if (partialTagError) {
        autoClose.handlePartialTag(partialTagError, this._feedParser._parserState());
      } else {
        this._feedParser.finalizeXml();
      }

      this._lastParseErrors = autoClose?.getErrors() ?? [];
      this.wasExited = this._feedParser.wasExited();
      return this._feedParser.outputBuilder.getOutput();
    } finally {
      this._cleanupFeedSession();
    }
  }

  // ─── Error reporting ──────────────────────────────────────────────────────

  /**
   * Return structural errors collected during the last parse call.
   * Only populated when autoClose.collectErrors is true.
   * Each entry: { type, tag, expected, line, col, index }
   *
   * @returns {Array}
   */
  getParseErrors() {
    return this._lastParseErrors ?? [];
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** @private */
  _createParser() {
    return new Xml2JsParser(this.options);
  }

  /** @private */
  _initFeedSession() {
    this._feedSource = new FeedableSource({
      ...this.options.feedable,
      decoding: { encoding: this.options.decoding.encoding, registry: this.options.decoding._registry },
    });
    this._feedParser = this._createParser();
    this._feedParser.source = this._feedSource;
    this._feedParser.initializeParser();
    this._isFeeding = true;
  }

  /** @private */
  _cleanupFeedSession() {
    this._feedParser = null;
    this._feedSource = null;
    this._isFeeding = false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isReadableStream(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.read === 'function' &&
    typeof value.on === 'function' &&
    typeof value.readableEnded === 'boolean'
  );
}