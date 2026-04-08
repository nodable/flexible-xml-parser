'use strict';
import { ParseError, ErrorCode } from './ParseError.js';

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

// Module-level regex. Stateless between calls because getAllMatches() always
// resets lastIndex to 0 before iterating — see getAllMatches() below.
const attrsRegx = new RegExp('([^\\s=]+)\\s*(=\\s*([\'"])([\\s\\S]*?)\\3)?', 'gm');

/**
 * Pass 1: extract raw (unparsed) attribute values into rawAttributes.
 *
 * @param {string} attrStr      - raw attribute expression substring
 * @param {object} parser       - Xml2JsParser instance (for processAttrName)
 * @param {object} tagExp - tagExp object to populate rawAttributes (Object.create(null))
 */
export function collectRawAttributes(attrStr, parser, tagExp) {

  if (!attrStr || attrStr.length === 0) return;
  const matches = getAllMatches(attrStr, attrsRegx);
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
  const matches = getAllMatches(attrStr, attrsRegx);
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

/**
 * Run the regex against the string and return all capture groups.
 * lastIndex is always reset to 0 before iterating so the module-level
 * stateful regex is safe to share across calls.
 *
 * @param {string} string
 * @param {RegExp} regex
 * @returns {Array}
 */
function getAllMatches(string, regex) {
  regex.lastIndex = 0;
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