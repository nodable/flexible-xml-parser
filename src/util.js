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

/**
 * Uniform error-position accessor across all InputSource types.
 *
 * Position reporting is index-only (absolute offset from document start) —
 * no line/column. Every InputSource exposes `startIndex` the same way, so
 * this is a plain passthrough, not a per-source branch.
 */
export function errorPositionOf(source) {
  return { index: source.startIndex };
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