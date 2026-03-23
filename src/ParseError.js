/**
 * ParseError — structured error class for flex-xml-parser.
 *
 * All errors thrown by the parser are instances of ParseError so callers can
 * distinguish library errors from generic runtime errors and reliably inspect
 * position information.
 *
 * @property {string}          code     - Machine-readable error code (e.g. 'UNEXPECTED_CLOSE_TAG')
 * @property {number|undefined} line    - 1-based line number where the error occurred (when available)
 * @property {number|undefined} col     - 1-based column where the error occurred (when available)
 * @property {number|undefined} index   - 0-based character offset from document start (when available)
 */
export class ParseError extends Error {
  /**
   * @param {string} message       - Human-readable error message
   * @param {string} code          - Machine-readable error code
   * @param {object} [position]    - Optional position info
   * @param {number} [position.line]
   * @param {number} [position.col]
   * @param {number} [position.index]
   */
  constructor(message, code, position = {}) {
    super(message);
    this.name = 'ParseError';
    this.code = code;

    this.line  = position.line  ?? undefined;
    this.col   = position.col   ?? undefined;
    this.index = position.index ?? undefined;
  }

  toString() {
    const pos = this._posStr();
    return pos ? `${this.name} [${this.code}] at ${pos}: ${this.message}` : `${this.name} [${this.code}]: ${this.message}`;
  }

  _posStr() {
    if (this.line !== undefined && this.col !== undefined) {
      return `line ${this.line}, col ${this.col}`;
    }
    if (this.index !== undefined) {
      return `index ${this.index}`;
    }
    return null;
  }
}

// ─── Error codes ─────────────────────────────────────────────────────────────

export const ErrorCode = Object.freeze({
  // Input type errors
  INVALID_INPUT:              'INVALID_INPUT',
  INVALID_STREAM:             'INVALID_STREAM',

  // Streaming / feed API
  ALREADY_STREAMING:          'ALREADY_STREAMING',
  NOT_STREAMING:              'NOT_STREAMING',
  DATA_MUST_BE_STRING:        'DATA_MUST_BE_STRING',

  // Tag structure
  UNEXPECTED_END:             'UNEXPECTED_END',
  UNEXPECTED_CLOSE_TAG:       'UNEXPECTED_CLOSE_TAG',
  MISMATCHED_CLOSE_TAG:       'MISMATCHED_CLOSE_TAG',
  UNEXPECTED_TRAILING_DATA:   'UNEXPECTED_TRAILING_DATA',
  INVALID_TAG:                'INVALID_TAG',
  UNCLOSED_QUOTE:             'UNCLOSED_QUOTE',

  // Namespace
  MULTIPLE_NAMESPACES:        'MULTIPLE_NAMESPACES',

  // Security
  SECURITY_PROTOTYPE_POLLUTION: 'SECURITY_PROTOTYPE_POLLUTION',
  SECURITY_RESERVED_OPTION:     'SECURITY_RESERVED_OPTION',
  SECURITY_RESTRICTED_NAME:     'SECURITY_RESTRICTED_NAME',

  // Limits (DoS prevention)
  LIMIT_MAX_NESTED_TAGS:      'LIMIT_MAX_NESTED_TAGS',
  LIMIT_MAX_ATTRIBUTES:       'LIMIT_MAX_ATTRIBUTES',

  // Entity limits
  ENTITY_MAX_COUNT:           'ENTITY_MAX_COUNT',
  ENTITY_MAX_SIZE:            'ENTITY_MAX_SIZE',
  ENTITY_MAX_EXPANSIONS:      'ENTITY_MAX_EXPANSIONS',
  ENTITY_MAX_EXPANDED_LENGTH: 'ENTITY_MAX_EXPANDED_LENGTH',

  // Entity registration
  ENTITY_INVALID_KEY:         'ENTITY_INVALID_KEY',
  ENTITY_INVALID_VALUE:       'ENTITY_INVALID_VALUE',
});

export default ParseError;
