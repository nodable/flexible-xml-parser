import toNumber from 'strnum';

/**
 * Number parser class that wraps the strnum toNumber function
 * Provides consistent API for value parsing in flex-xml-parser
 */
export default class numParser {
  constructor(options) {
    this.options = options || {};
  }

  /**
   * Parse a value, converting strings to numbers based on options
   * @param {*} val - Value to parse
   * @returns {*} Parsed value (number if successfully parsed, otherwise original value)
   */
  parse(val) {
    if (typeof val === 'string') {
      val = toNumber(val, this.options);
    }
    return val;
  }
}
