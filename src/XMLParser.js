import { buildOptions } from './OptionsBuilder.js';
import { ParseError, ErrorCode } from './ParseError.js';
import Xml2JsParser from './Xml2JsParser.js';
import FeedableSource from './InputSource/FeedableSource.js';
import StreamSource from './InputSource/StreamSource.js';

export default class XMLParser {

  constructor(options) {
    this.externalEntities = {};
    this.options = buildOptions(options);

    // feed()/end() session state
    this._feedParser = null;
    this._feedSource = null;
    this._isFeeding = false;
  }

  // ─── One-shot parse methods ───────────────────────────────────────────────

  /**
   * Parse an XML string or Buffer and return a JS object.
   * @param {string|Buffer} xmlData
   */
  parse(xmlData) {
    if (xmlData instanceof Buffer || ArrayBuffer.isView(xmlData)) {
      xmlData = xmlData.toString();
    } else if (typeof xmlData !== 'string') {
      if (xmlData && typeof xmlData.toString === 'function') {
        xmlData = xmlData.toString();
      } else {
        throw new ParseError('XML data must be a string or Buffer.', ErrorCode.INVALID_INPUT);
      }
    }

    const parser = this._createParser();
    const result = parser.parse(xmlData);
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

    const source = new StreamSource(this.options.feedable);
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

    let str;
    if (typeof data === 'string') {
      str = data;
    } else if (Buffer.isBuffer(data)) {
      str = data.toString();
    } else if (data?.toString) {
      str = data.toString();
    } else {
      throw new ParseError('feed() data must be a string or Buffer.', ErrorCode.DATA_MUST_BE_STRING);
    }

    this._feedSource.feed(str);

    try {
      this._feedParser.parseXml();
    } catch (err) {
      if (err.code === ErrorCode.UNEXPECTED_END) {
        // Chunk boundary fell mid-token. Rewind to the token start so the
        // incomplete bytes are re-parsed when the next chunk arrives.
        this._feedSource.rewindToMark();
      } else {
        // Real parse error — clean up and propagate.
        this._cleanupFeedSession();
        throw err;
      }
    }

    return this;
  }

  /**
   * Signal end of input, validate end-of-document state, and return the
   * parsed result. Throws if called before any feed() call.
   *
   * parseXml() is NOT called here — it ran (incrementally) inside each
   * feed() call. This method only finalises: checks for unclosed tags,
   * applies autoClose recovery if configured, and returns the output.
   *
   * @returns {any}
   */
  end() {
    if (!this._isFeeding) {
      throw new ParseError('No data fed. Call feed() before end().', ErrorCode.NOT_STREAMING);
    }

    try {
      this._feedSource.end();
      this._feedParser.finalizeXml();
      this._lastParseErrors = this._feedParser.autoCloseHandler?.getErrors() ?? [];
      return this._feedParser.outputBuilder.getOutput();
    } finally {
      this._cleanupFeedSession();
    }
  }

  // ─── Entity registration ──────────────────────────────────────────────────

  /**
   * Register a custom entity for replacement (without `&` and `;`).
   * Requires 'replaceEntities' in the valueParsers chain.
   *
   * @param {string} key   e.g. 'copy' for &copy;
   * @param {string} value replacement string; must not contain '&'
   */
  addEntity(key, value) {
    if (typeof key !== 'string' || key.includes('&') || key.includes(';')) {
      throw new ParseError(
        "Entity key must not contain '&' or ';'. E.g. use 'copy' for '&copy;'",
        ErrorCode.ENTITY_INVALID_KEY
      );
    }
    if (typeof value !== 'string' || value.includes('&')) {
      throw new ParseError(
        "Entity value must be a string and must not contain '&'",
        ErrorCode.ENTITY_INVALID_VALUE
      );
    }
    this.externalEntities[key] = value;
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
    const p = new Xml2JsParser(this.options);
    p.entityParser.addExternalEntities(this.externalEntities);
    return p;
  }

  /** @private */
  _initFeedSession() {
    this._feedSource = new FeedableSource(this.options.feedable);
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