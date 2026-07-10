'use strict';
import { ParseError, ErrorCode } from './ParseError.js';
import { isSpaceCode, errorPositionOf } from "./util.js"

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
 * Each element is `{ name, value, startIndex }` — `value` is `undefined` for
 * a boolean attribute (no `=`). Earlier versions of this function also built
 * a full-match string and an `'=value'` string per attribute (matching an
 * old regex-based getAllMatches() return shape) — neither was ever read by
 * collectRawAttributes()/flushAttributes() (only `name`, `value`, and
 * `.startIndex` are), so building them was pure wasted string concatenation
 * on every attribute, on every tag. Dropped.
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
 * @param {Array<number>} [quotePairs] - flat [openIdx, closeIdx, ...] list from
 *   scanTagExpEnd(), offsets relative to the *tag expression* (not attrStr).
 *   When a value's opening quote lines up with the next expected pair, the
 *   closing quote's position is taken directly instead of re-scanning for
 *   it — the per-character `!== quote` comparison is skipped entirely for
 *   that value. Falls back to the old per-character scan (undefined, or a
 *   mismatch — belt-and-braces, should never trigger given how the pairs
 *   are produced, but costs nothing to check once per value) so correctness
 *   never depends on the fast path succeeding.
 * @param {number} [attrsOffset] - offset of attrStr's first character within
 *   the coordinate system quotePairs is expressed in — required whenever
 *   quotePairs is passed.
 * @param {number} [quotePairsLen=0] - how many entries in `quotePairs` are
 *   valid — it's a reused fixed-capacity typed array, not sized to this tag,
 *   so `quotePairs.length` itself is not the right bound to loop against.
 * @returns {Array<{name: string, value: string|undefined, startIndex: number}>}
 */
function parseAttributes(attrStr, quotePairs, attrsOffset, quotePairsLen = 0) {
  const results = [];
  const len = attrStr.length;
  let i = 0;
  const usePairs = quotePairs !== undefined && quotePairsLen > 0;
  let pairIdx = 0;

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
      results.push({ name, value: undefined, startIndex: nameStart });
      continue;
    }

    i++; // skip '='

    // Skip whitespace after '='
    while (i < len && isSpaceCode(attrStr.charCodeAt(i))) i++;

    // Read quoted value
    const quote = attrStr.charCodeAt(i);
    if (quote === 34 || quote === 39) { // " or '
      // Fast path: the tag-end scanner already found this exact quote pair
      // while looking for '>' — reuse its closing-quote position instead of
      // re-scanning character-by-character for it.
      let closeLocal = -1;
      if (usePairs && pairIdx + 1 < quotePairsLen && quotePairs[pairIdx] === i + attrsOffset) {
        closeLocal = quotePairs[pairIdx + 1] - attrsOffset;
        pairIdx += 2;
      }

      i++; // skip opening quote
      let value = '';
      let segStart = i;
      if (closeLocal >= 0) {
        while (i < closeLocal) {
          const c = attrStr.charCodeAt(i);
          if (c === 10 || c === 13) { // \n or \r → space per XML §3.3.3
            value += attrStr.substring(segStart, i) + ' ';
            segStart = i + 1;
          }
          i++;
        }
        value += attrStr.substring(segStart, i);
        i++; // skip closing quote
      } else {
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
      }
      results.push({ name, value, startIndex: nameStart });
    }
  }

  return results;
}

/**
 * Pass 1: extract raw (unparsed) attribute values into rawAttributes, AND
 * build tagExp._parsedAttrs — the processed-name/value list pass 2 will
 * consume directly.
 *
 * Previously, pass 2 (flushAttributes) re-ran parseAttributes() from scratch
 * on the same attrStr, and re-ran parser.processAttrName() (ns-prefix
 * resolution + name validation + sanitizeName + reserved-name check) on
 * every attribute a second time — full re-tokenization plus full re-validation
 * of work already done here. processAttrName() is a pure function of
 * (rawName, options) — nothing between pass 1 and pass 2 (matcher.push,
 * stop/skip resolution) can change its result — so it's safe to compute once
 * and cache. The matcher still gets the *raw* (pre-resolveNsPrefix/sanitize)
 * name as its rawAttributes key, unchanged, since PEM's attribute-condition
 * matching (`div[class=code]`) matches against attribute names as written.
 *
 * @param {string} attrStr      - raw attribute expression substring
 * @param {object} parser       - Xml2JsParser instance (for processAttrName)
 * @param {object} tagExp - tagExp object to populate rawAttributes
 * @param {Array<number>} [quotePairs] - see parseAttributes() doc.
 * @param {number} [attrsOffset] - see parseAttributes() doc.
 * @param {number} [quotePairsLen] - see parseAttributes() doc.
 */
export function collectRawAttributes(attrStr, parser, tagExp, quotePairs, attrsOffset, quotePairsLen) {
  if (!attrStr || attrStr.length === 0) return;

  const matches = parseAttributes(attrStr, quotePairs, attrsOffset, quotePairsLen);
  const len = matches.length;
  tagExp._rawAttrMatchCount = len; // total parsed attrs, incl. dropped (xmlns:) ones — for maxAttributesPerTag parity with old behavior
  const parsedAttrs = [];
  let count = 0;
  for (let i = 0; i < len; i++) {
    const m = matches[i];
    const attrName = parser.processAttrName(m.name);
    if (attrName === false) continue;
    count++;
    const rawVal = m.value;
    const attrVal = rawVal !== undefined ? rawVal : true;
    tagExp.rawAttributes[m.name] = attrVal;
    parsedAttrs.push({ name: attrName, value: attrVal, index: m.startIndex });
  }
  tagExp.rawAttributesLen = count;
  tagExp._parsedAttrs = parsedAttrs;
}

/**
 * Pass 2: push each attribute (already parsed + name-processed by pass 1,
 * see tagExp._parsedAttrs) to the output builder. No re-parsing, no
 * re-running processAttrName — this is now a plain loop over cached data.
 *
 * @param {Array<{name: string, value: *, index: number}>} parsedAttrs - tagExp._parsedAttrs from collectRawAttributes
 * @param {object} parser  - Xml2JsParser instance
 * @param {number} [attrsExpStart] - absolute document offset where the
 *   attribute expression began (tagExp._attrsExpStart). When provided, each
 *   attribute's absolute document index is computed and passed to
 *   addAttribute() as a 4th argument: { index }. Line/col are intentionally
 *   NOT computed here — doing so would require re-scanning attrStr for
 *   newlines on every call, for a field most builders won't use; callers
 *   that need it can derive line/col from `index` plus the document text.
 * @param {number} rawAttrMatchCount - tagExp._rawAttrMatchCount, used for the
 *   maxAttributesPerTag limit check (counts all parsed attrs, including any
 *   dropped by processAttrName, matching the limit's pre-existing semantics).
 */
export function flushAttributes(parsedAttrs, parser, attrsExpStart, rawAttrMatchCount) {
  if (!parsedAttrs || parsedAttrs.length === 0) return;

  const maxAttrs = parser.options.limits?.maxAttributesPerTag;
  if (maxAttrs !== undefined && maxAttrs !== null && rawAttrMatchCount > maxAttrs) {
    const tagName = parser.currentTagDetail?.name ?? '(unknown)';
    throw new ParseError(
      `Tag '${tagName}' has ${rawAttrMatchCount} attributes, exceeding limit of ${maxAttrs}`,
      ErrorCode.LIMIT_MAX_ATTRIBUTES,
      errorPositionOf(parser.source)
    );
  }

  const len = parsedAttrs.length;
  for (let i = 0; i < len; i++) {
    const a = parsedAttrs[i];
    const attrMeta = attrsExpStart !== undefined
      ? { index: attrsExpStart + a.index }
      : undefined;
    parser.outputBuilder.addAttribute(a.name, a.value, parser.readonlyMatcher, attrMeta);
  }
}