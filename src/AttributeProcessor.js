'use strict';
import { ParseError, ErrorCode } from './ParseError.js';
import { isSpaceCode } from "./util.js"

/**
 * AttributeProcessor — owns all attribute parsing logic.
 *
 * Two-pass attribute processing:
 *
 *   Pass 1 — collectRawAttributes()
 *     Populates the rawAttributes map from the raw attribute expression string.
 *     Called inside buildTagExpObj() (via XmlPartReader) so rawAttributes is
 *     ready before readOpeningTag() calls matcher.updateCurrent(rawAttributes).
 *     The matcher must reflect all raw attribute values before any value-parser
 *     runs so that attribute-based path expressions (e.g. "div[class=code]")
 *     resolve correctly during pass 2.
 *
 *   Pass 2 — flushAttributes()
 *     Calls outputBuilder.addAttribute() for each attribute, running the full
 *     value-parser chain. Called from readOpeningTag() AFTER
 *     matcher.updateCurrent(), so the read-only matcher already carries the
 *     complete attribute context when value parsers execute.
 */

// Module-level regex kept for reference only — no longer called from this
// module. parseAttributes() below replaces it with an O(n) linear scanner
// that is immune to catastrophic backtracking and stack overflow.
// const attrsRegx = new RegExp('([^\\s=]+)\\s*(=\\s*([\'"])([\\s\\S]*?)\\3)?', 'gm');

/**
 * Parse an attribute expression string into an array of match tuples.
 *
 * Each element has the same shape the old getAllMatches() returned so that
 * callers are unchanged:
 *   [fullMatch, name, '=value' | undefined, quote | undefined, value | undefined]
 *
 * The implementation is a single O(n) pass over char codes with no regex and
 * no recursion, making it safe for arbitrarily long attribute strings.
 *
 * State machine:
 *   SEEK_NAME  — skipping whitespace looking for the start of an attr name
 *   IN_NAME    — accumulating a name token until whitespace or '='
 *   SEEK_VALUE — saw name + optional whitespace, now expecting '=' or next name
 *   IN_VALUE   — inside a quoted value, accumulating until the closing quote
 *
 * @param {string} attrStr
 * @returns {Array}  array of match tuples (see shape above)
 */
function parseAttributes(attrStr) {
  const results = [];
  const len = attrStr.length;
  let i = 0;

  while (i < len) {
    // Skip whitespace between attributes
    while (i < len && isSpaceCode(attrStr.charCodeAt(i))) i++;
    if (i >= len) break;

    // Read name
    const nameStart = i;
    while (i < len && attrStr.charCodeAt(i) !== 61 && !isSpaceCode(attrStr.charCodeAt(i))) i++;
    const name = attrStr.substring(nameStart, i);

    // Skip whitespace before '='
    while (i < len && isSpaceCode(attrStr.charCodeAt(i))) i++;

    if (i >= len || attrStr.charCodeAt(i) !== 61) {
      // Boolean attribute — no '='
      const m = [name, name, undefined, undefined, undefined];
      m.startIndex = nameStart;
      results.push(m);
      continue;
    }

    i++; // skip '='

    // Skip whitespace after '='
    while (i < len && isSpaceCode(attrStr.charCodeAt(i))) i++;

    // Read quoted value
    const quote = attrStr.charCodeAt(i);
    if (quote === 34 || quote === 39) { // " or '
      i++; // skip opening quote
      const valueStart = i;
      let value = '';
      let segStart = i;
      while (i < len && attrStr.charCodeAt(i) !== quote) {
        const c = attrStr.charCodeAt(i);
        if (c === 10 || c === 13) { // \n or \r → space per XML §3.3.3
          value += attrStr.substring(segStart, i) + ' ';
          segStart = i + 1;
        }
        i++;
      }
      value += attrStr.substring(segStart, i);
      i++; // skip closing quote
      const quoteChar = String.fromCharCode(quote);
      const m = [name + '=' + quoteChar + value + quoteChar, name, '=' + quoteChar + value + quoteChar, quoteChar, value];
      m.startIndex = nameStart;
      results.push(m);
    }
  }

  return results;
}

/**
 * Pass 1: extract raw (unparsed) attribute values into rawAttributes.
 *
 * @param {string} attrStr      - raw attribute expression substring
 * @param {object} parser       - Xml2JsParser instance (for processAttrName)
 * @param {object} tagExp - tagExp object to populate rawAttributes (Object.create(null))
 */
export function collectRawAttributes(attrStr, parser, tagExp) {
  if (!attrStr || attrStr.length === 0) return;

  const matches = parseAttributes(attrStr);
  const len = matches.length;
  let count = 0;
  for (let i = 0; i < len; i++) {
    const attrName = parser.processAttrName(matches[i][1]);
    if (attrName === false) continue;
    count++;
    const rawVal = matches[i][4];
    tagExp.rawAttributes[matches[i][1]] = rawVal !== undefined ? rawVal : true;
  }
  tagExp.rawAttributesLen = count;
}

/**
 * Pass 2: run value parsers and push each attribute to the output builder.
 *
 * @param {string} attrStr - raw attribute expression substring
 * @param {object} parser  - Xml2JsParser instance
 */
export function flushAttributes(attrStr, parser) {
  if (!attrStr || attrStr.length === 0) return;
  const matches = parseAttributes(attrStr);
  const len = matches.length;

  const maxAttrs = parser.options.limits?.maxAttributesPerTag;
  if (maxAttrs !== undefined && maxAttrs !== null && len > maxAttrs) {
    const tagName = parser.currentTagDetail?.name ?? '(unknown)';
    throw new ParseError(
      `Tag '${tagName}' has ${len} attributes, exceeding limit of ${maxAttrs}`,
      ErrorCode.LIMIT_MAX_ATTRIBUTES,
      { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
    );
  }

  for (let i = 0; i < len; i++) {
    const attrName = parser.processAttrName(matches[i][1]);
    if (attrName === false) continue;

    const rawVal = matches[i][4];
    const attrVal = rawVal !== undefined ? rawVal : true;

    parser.outputBuilder.addAttribute(attrName, attrVal, parser.readonlyMatcher);
  }
}