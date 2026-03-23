import { ParseError, ErrorCode } from '../ParseError.js';
/**
 * FeedableSource - Input source that accepts incremental data feeding
 * Compatible with StringSource interface
 */
export default class FeedableSource {
  constructor(options = {}) {
    this.line = 1;
    this.cols = 0;
    this.buffer = '';
    this.startIndex = 0;
    this.isComplete = false;
    this.waitingForData = false;

    // Configuration
    this.maxBufferSize = options.maxBufferSize || 10 * 1024 * 1024; // 10MB default
    this.autoFlush = options.autoFlush !== false; // true by default
    this.flushThreshold = options.flushThreshold || 1024; // Clear buffer after 1KB processed
  }

  /**
   * Feed new data chunk to the parser
   * @param {string|Buffer} data - Data chunk to add
   */
  feed(data) {
    // Convert to string if needed
    const newData = typeof data === 'string' ? data : data.toString();

    // Check buffer size limit
    const newSize = this.buffer.length + newData.length;
    if (newSize > this.maxBufferSize) {
      throw new ParseError(
        `Buffer size limit exceeded: ${newSize} > ${this.maxBufferSize}. Consider enabling autoFlush or increasing maxBufferSize.`,
        ErrorCode.INVALID_INPUT
      );
    }

    // Append to buffer
    this.buffer += newData;
    this.waitingForData = false;
  }

  /**
   * Signal that no more data will be fed
   */
  end() {
    this.isComplete = true;
  }

  /**
   * Check if data is available to read
   * @param {number} n - Number of characters to check (optional)
   * @returns {boolean}
   */
  canRead(n) {
    n = (n !== undefined) ? n : this.startIndex;
    const available = this.buffer.length - n > 0;

    if (!available && !this.isComplete) {
      this.waitingForData = true;
      return false;
    }

    return available;
  }

  /**
   * Read next character and advance position
   * @returns {string}
   */
  readCh() {
    const ch = this.buffer[this.startIndex++];

    // Track line/col for error reporting
    if (ch === '\n') {
      this.line++;
      this.cols = 0;
    } else {
      this.cols++;
    }

    return ch;
  }

  /**
   * Read character at offset without advancing
   * @param {number} index - Offset from current position
   * @returns {string}
   */
  readChAt(index) {
    return this.buffer[this.startIndex + index];
  }

  /**
   * Read n characters as string
   * @param {number} n - Number of characters to read
   * @param {number} from - Start position (default: current position)
   * @returns {string}
   */
  readStr(n, from) {
    if (typeof from === 'undefined') from = this.startIndex;
    return this.buffer.substring(from, from + n);
  }

  /**
   * Read until stop string is found
   * @param {string} stopStr - String to search for
   * @returns {string}
   * @throws {Error} If stop string not found and source is incomplete
   */
  readUpto(stopStr) {
    const inputLength = this.buffer.length;
    const stopLength = stopStr.length;

    for (let i = this.startIndex; i < inputLength; i++) {
      let match = true;

      // Check if we need more data to match
      if (i + stopLength > inputLength) {
        if (!this.isComplete) {
          this.waitingForData = true;
          throw new Error('NEED_MORE_DATA');
        }
      }

      for (let j = 0; j < stopLength; j++) {
        if (this.buffer[i + j] !== stopStr[j]) {
          match = false;
          break;
        }
      }

      if (match) {
        const result = this.buffer.substring(this.startIndex, i);
        this.startIndex = i + stopLength;
        return result;
      }
    }

    if (!this.isComplete) {
      this.waitingForData = true;
      throw new Error('NEED_MORE_DATA');
    }

    throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
  }

  /**
   * Read until closing tag is found (for stop nodes)
   * @param {string} stopStr - Closing tag pattern (e.g., "</tagname")
   * @returns {string}
   */
  readUptoCloseTag(stopStr) {
    const inputLength = this.buffer.length;
    const stopLength = stopStr.length;
    let stopIndex = 0;
    let match = 0;

    for (let i = this.startIndex; i < inputLength; i++) {
      // Check if we need more data
      if (match === 1 && i + 1 >= inputLength) {
        if (!this.isComplete) {
          this.waitingForData = true;
          throw new Error('NEED_MORE_DATA');
        }
      }

      if (match === 1) {
        if (stopIndex === 0) stopIndex = i;
        if (this.buffer[i] === ' ' || this.buffer[i] === '\t') continue;
        else if (this.buffer[i] === '>') {
          match = 2;
        }
      } else {
        match = 1;
        for (let j = 0; j < stopLength; j++) {
          if (i + j >= inputLength) {
            if (!this.isComplete) {
              this.waitingForData = true;
              throw new Error('NEED_MORE_DATA');
            }
          }
          if (this.buffer[i + j] !== stopStr[j]) {
            match = 0;
            break;
          }
        }
      }

      if (match === 2) {
        const result = this.buffer.substring(this.startIndex, stopIndex - 1);
        this.startIndex = i + 1;
        return result;
      }
    }

    if (!this.isComplete) {
      this.waitingForData = true;
      throw new Error('NEED_MORE_DATA');
    }

    throw new ParseError(`Unexpected end of source reading '${stopStr}'`, ErrorCode.UNEXPECTED_END);
  }

  /**
   * Update buffer boundary and optionally flush processed data
   * @param {number} n - Number of characters processed
   */
  updateBufferBoundary(n = 1) {
    this.startIndex += n;

    // Auto-flush processed data if enabled
    if (this.autoFlush && this.startIndex >= this.flushThreshold) {
      this.flush();
    }
  }

  /**
   * Clear processed data from buffer to free memory
   */
  flush() {
    if (this.startIndex > 0) {
      this.buffer = this.buffer.substring(this.startIndex);
      this.startIndex = 0;
    }
  }

  /**
   * Get current buffer size
   * @returns {number}
   */
  getBufferSize() {
    return this.buffer.length;
  }

  /**
   * Get unprocessed buffer size
   * @returns {number}
   */
  getUnprocessedSize() {
    return this.buffer.length - this.startIndex;
  }

  /**
   * Check if waiting for more data
   * @returns {boolean}
   */
  isWaitingForData() {
    return this.waitingForData;
  }
}