import { buildOptions } from './OptionsBuilder.js';
import { ParseError, ErrorCode } from './ParseError.js';
import Xml2JsParser from './Xml2JsParser.js';
import FeedableSource from './InputSource/FeedableSource.js';

export default class XMLParser {

    constructor(options) {
        this.externalEntities = {};
        this.options = buildOptions(options);

        // Streaming state
        this.streamingParser = null;
        this.feedableSource = null;
        this.isStreaming = false;
    }

    /**
     * Parse XML data string to JS object (original API)
     * @param {string|Buffer} xmlData 
     */
    parse(xmlData) {
        if (Array.isArray(xmlData) && xmlData.byteLength !== undefined) {
            xmlData = Buffer.from(xmlData).toString();
        } else if (xmlData.toString) {
            xmlData = xmlData.toString();
        } else {
            throw new ParseError("XML data is accepted in String or Bytes[] form.", ErrorCode.INVALID_INPUT)
        }

        const parser = new Xml2JsParser(this.options);
        parser.entityParser.addExternalEntities(this.externalEntities);
        const result = parser.parse(xmlData);
        this._lastParseErrors = parser.autoCloseHandler
            ? parser.autoCloseHandler.getErrors()
            : [];
        return result;
    }

    /**
     * Parse XML data buffer to JS object (original API)
     * @param {string|Buffer} xmlData 
     */
    parseBytesArr(xmlData) {
        if (xmlData instanceof Uint8Array || ArrayBuffer.isView(xmlData)) {
            xmlData = Buffer.from(xmlData);
        } else if (Array.isArray(xmlData) && xmlData.byteLength !== undefined) {
            // legacy typed-array-like object
        } else {
            throw new ParseError("XML data is accepted in Bytes[] form.", ErrorCode.INVALID_INPUT)
        }

        const parser = new Xml2JsParser(this.options);
        parser.entityParser.addExternalEntities(this.externalEntities);
        const result = parser.parseBytesArr(xmlData);
        this._lastParseErrors = parser.autoCloseHandler
            ? parser.autoCloseHandler.getErrors()
            : [];
        return result;
    }

    /**
     * Parse XML data stream to JS object (original API)
     * @param {fs.ReadableStream} xmlDataStream 
     */
    parseStream(xmlDataStream) {
        if (!isStream(xmlDataStream)) throw new ParseError("FXP: Invalid stream input", ErrorCode.INVALID_STREAM);

        const orderedObjParser = new Xml2JsParser(this.options);
        orderedObjParser.entityParser.addExternalEntities(this.externalEntities);
        return orderedObjParser.parseStream(xmlDataStream);
    }

    /**
     * Initialize streaming mode
     * @private
     */
    _initializeStreaming() {
        if (this.isStreaming) {
            throw new ParseError('Parser already in streaming mode. Call end() before starting a new stream.', ErrorCode.ALREADY_STREAMING);
        }

        // Create feedable source
        this.feedableSource = new FeedableSource({
            maxBufferSize: this.options.maxBufferSize,
            autoFlush: this.options.autoFlush,
            flushThreshold: this.options.flushThreshold
        });

        // Create parser instance
        this.streamingParser = new Xml2JsParser(this.options);
        this.streamingParser.entityParser.addExternalEntities(this.externalEntities);
        this.streamingParser.source = this.feedableSource;
        this.streamingParser.initializeParser();

        this.isStreaming = true;
    }

    /**
     * Feed XML data incrementally
     * @param {string|Buffer} data - XML data chunk
     * @returns {XMLParser} - Returns this for chaining
     */
    feed(data) {
        // Initialize on first feed
        if (!this.isStreaming) {
            this._initializeStreaming();
        }

        // Convert data to string if needed
        let strData;
        if (typeof data === 'string') {
            strData = data;
        } else if (Buffer.isBuffer(data)) {
            strData = data.toString();
        } else if (data?.toString) {
            strData = data.toString();
        } else {
            throw new ParseError('Data must be a string or Buffer', ErrorCode.DATA_MUST_BE_STRING);
        }

        // Accumulate data in source buffer; parsing happens all at once on end()
        this.feedableSource.feed(strData);

        return this; // For chaining
    }

    /**
     * Signal end of data and get final result
     * @returns {Object} - Parsed XML as JavaScript object
     */
    end() {
        if (!this.isStreaming) {
            throw new ParseError('No data fed. Call feed() before end()', ErrorCode.NOT_STREAMING);
        }

        try {
            // Mark source as complete so readUpto doesn't throw NEED_MORE_DATA
            this.feedableSource.end();

            // Parse the fully accumulated buffer in one pass
            this.streamingParser.parseXml();

            // Capture parse errors before cleanup clears streamingParser
            this._lastParseErrors = this.streamingParser.autoCloseHandler
                ? this.streamingParser.autoCloseHandler.getErrors()
                : [];

            // Get result
            const result = this.streamingParser.outputBuilder.getOutput();

            // Cleanup
            this._cleanup();

            return result;
        } catch (error) {
            this._cleanup();
            throw error;
        }
    }

    /**
     * Return structural errors collected during the last parse call.
     * Only populated when autoClose.collectErrors is true.
     * Returns an empty array when autoClose is not configured or no errors occurred.
     *
     * Each entry: { type, tag, expected, line, col, index }
     * Types: 'unclosed-eof' | 'mismatched-close' | 'phantom-close' | 'partial-tag'
     *
     * @returns {Array}
     */
    getParseErrors() {
        return this._lastParseErrors || [];
    }

    /**
     * Reset streaming state
     * @private
     */
    _cleanup() {
        this.streamingParser = null;
        this.feedableSource = null;
        this.isStreaming = false;
    }

    /**
     * Check if parser is currently in streaming mode
     * @returns {boolean}
     */
    isStreamingMode() {
        return this.isStreaming;
    }

    /**
     * Get current buffer stats (for debugging/monitoring)
     * @returns {Object|null} - Buffer statistics or null if not streaming
     */
    getBufferStats() {
        if (!this.feedableSource) return null;

        return {
            totalSize: this.feedableSource.getBufferSize(),
            unprocessedSize: this.feedableSource.getUnprocessedSize(),
            waitingForData: this.feedableSource.isWaitingForData(),
            isPaused: this.streamingParser?.isPaused || false
        };
    }

    /**
     * Register a custom entity for replacement.
     * The entity is stored and applied whenever 'replaceEntities' is in the valueParsers chain
     * and entityParseOptions.external is true (the default).
     *
     * @param {string} key   - Entity name without '&' and ';'. E.g. 'copy' for '&copy;'
     * @param {string} value - Replacement value. Must not contain '&'.
     */
    addEntity(key, value) {
        if (typeof key !== 'string' || key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
            throw new ParseError("An entity must be set without '&' and ';'. Eg. use 'copy' for '&copy;'", ErrorCode.ENTITY_INVALID_KEY);
        } else if (typeof value !== 'string' || value.indexOf("&") !== -1) {
            throw new ParseError("Entity value must be a string and must not contain '&'", ErrorCode.ENTITY_INVALID_VALUE);
        } else {
            this.externalEntities[key] = value;
        }
    }
}

function isStream(stream) {
    if (stream && typeof stream.read === "function" && typeof stream.on === "function" && typeof stream.readableEnded === "boolean") return true;
    return false;
}