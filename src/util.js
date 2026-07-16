import { ParseError, ErrorCode } from './ParseError.js';

export function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}



export function isSpace(char) {
  return char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";
}


export function isSpaceCode(code) {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12; // space \t \n \r \f
}

export function isExist(v) {
  return typeof v !== 'undefined';
}

export function isEmptyObject(obj) {
  return Object.keys(obj).length === 0;
}

export function getValue(v) {
  if (isExist(v)) {
    return v;
  } else {
    return '';
  }
}

export const DANGEROUS_PROPERTY_NAMES = [
  'hasOwnProperty',
  'toString',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  "toLocaleString",
  "isPrototypeOf",
  "propertyIsEnumerable"
];

export const criticalProperties = ["__proto__", "constructor", "prototype"];

// Capacity (in numbers, i.e. QUOTE_PAIRS_CAPACITY/2 quoted-attribute-values)
// of the reusable typed array each InputSource uses to record quote
// positions found by scanTagExpEnd(), reused by
// AttributeProcessor.parseAttributes(). A plain fixed cap, not a growable
// array — see scanTagExpEnd()'s doc for why: comfortably covers real-world
// tags, and a tag with more quoted attributes than this just falls back to
// per-character quote scanning for the overflow, so there's no correctness
// cost to keeping this small and allocation-free.
export const QUOTE_PAIRS_CAPACITY = 128; // 64 quoted attribute values per tag

/**
 * True document-start-relative offset for a source's current read position.
 *
 * `source.startIndex` is only an offset into the source's *live buffer* —
 * every flush() trims already-consumed characters off the front of that
 * buffer and rebases startIndex back down, so startIndex alone drifts from
 * the true document offset the moment a flush has happened. Each source
 * tracks how much it has trimmed away so far in `_baseOffset` (bumped by the
 * trimmed amount inside flush()); the real position is always the sum of
 * the two. This is the one place that sum is computed — every caller that
 * needs an absolute, document-start-relative position (errors, tag index/
 * openEnd/closeEnd, attribute offsets, stop-node end) must go through this
 * function rather than reading `startIndex` directly.
 */
export function absolutePosition(source) {
  return source.startIndex + (source._baseOffset || 0);
}

/**
 * Uniform error-position accessor across all InputSource types.
 *
 * Position reporting is index-only (absolute offset from document start) —
 * no line/column.
 */
export function errorPositionOf(source) {
  return { index: absolutePosition(source) };
}

/**
 * True for character codes that are illegal as literal characters anywhere in
 * an XML document (element text, attribute values, CDATA, comments): 0x00-0x08,
 * 0x0B, 0x0C, 0x0E-0x1F. Tab/LF/CR (0x09/0x0A/0x0D) are legal whitespace and
 * excluded. A numeric character reference like `&#0;` is just ASCII text at
 * this stage (entity expansion happens later, in the output builder), so it
 * never reaches this check as a raw byte.
 */
function isIllegalControlCode(c) {
  return c <= 8 || c === 11 || c === 12 || (c >= 14 && c <= 31);
}

/**
 * Normalize a complete piece of document content (element text, CDATA
 * content, or comment content) per XML §2.11: a real `\r\n` pair or a lone
 * `\r` becomes a single `\n`; a bare `\n` is left alone. Also rejects illegal
 * literal control characters (see isIllegalControlCode) — this check always
 * runs, regardless of autoClose/lenient settings.
 *
 * Meant to be called exactly once per finished token (a whole text run, a
 * whole CDATA block, a whole comment) — never mid-scan — so no chunk-boundary
 * carry logic is needed: by the time a reader has a complete string, any
 * `\r\n` that happened to straddle a feed() chunk boundary has already been
 * concatenated back together by the caller.
 *
 * @param {string} str
 * @param {object} [source] - for error position only; omit if unavailable.
 * @returns {string}
 */
export function sanitizeContent(str, source) {
  const len = str.length;
  let hasCR = false;
  for (let i = 0; i < len; i++) {
    const c = str.charCodeAt(i);
    if (isIllegalControlCode(c)) {
      throw new ParseError(
        `Illegal control character 0x${c.toString(16).padStart(2, '0')} in document content`,
        ErrorCode.ILLEGAL_CHARACTER,
        source ? errorPositionOf(source) : {}
      );
    }
    if (c === 13) hasCR = true;
  }
  if (!hasCR) return str; // fast path — nothing to fold, no reallocation

  let out = '';
  let segStart = 0;
  for (let i = 0; i < len; i++) {
    if (str.charCodeAt(i) === 13) {
      out += str.substring(segStart, i) + '\n';
      if (str.charCodeAt(i + 1) === 10) i++; // \r\n pair → one \n, not two
      segStart = i + 1;
    }
  }
  out += str.substring(segStart);
  return out;
}

/**
 * Assert that the upcoming characters in the source match the expected string.
 * If not enough data → throws UNEXPECTED_END.
 * If mismatch → throws INVALID_TAG with the given errorMsg.
 * On success, consumes the matched characters (advances startIndex).
 *
 * @param {object} source - input source (must have canRead, matchAhead, updateBufferBoundary)
 * @param {string} expected - string to match
 * @param {string} errorMsg - description of what is being read (used in error messages)
 * @param {boolean} [caseInsensitive=false]
 */
export function expectMatch(source, expected, errorMsg, caseInsensitive = false) {
  const len = expected.length;
  if (!source.canRead(len)) {
    throw new ParseError(
      `Unexpected end of source reading ${errorMsg}`,
      ErrorCode.UNEXPECTED_END,
      errorPositionOf(source)
    );
  }
  const matched = source.matchAhead(expected, caseInsensitive);
  if (matched !== true) {
    throw new ParseError(
      `Invalid ${errorMsg}`,
      ErrorCode.INVALID_TAG,
      errorPositionOf(source)
    );
  }
  source.updateBufferBoundary(len);
}

/**
 * Assert that the source has at least `n` characters available from the current position.
 * Throws UNEXPECTED_END if not enough data.
 * Does NOT consume any characters.
 *
 * @param {object} source - input source (must have canRead)
 * @param {number} n - number of characters needed
 * @param {string} errorMsg - description of what is being read (used in error message)
 */
export function ensureCanRead(source, n, errorMsg) {
  if (!source.canRead(n)) {
    throw new ParseError(
      `Unexpected end of source reading ${errorMsg}`,
      ErrorCode.UNEXPECTED_END,
      errorPositionOf(source)
    );
  }
}