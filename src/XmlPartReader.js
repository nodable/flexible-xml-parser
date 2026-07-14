'use strict';
import { ParseError, ErrorCode } from './ParseError.js';
import { collectRawAttributes } from './AttributeProcessor.js';
import { isSpace, absolutePosition } from "./util.js"
// Re-export flushAttributes so Xml2JsParser and XmlSpecialTagsReader can
// continue to import it from here without changing their import lines.
export { flushAttributes } from './AttributeProcessor.js';

export class TagExp {
  constructor() {
    this.tagName = "";
    this.selfClosing = false;
    // rawAttributes= Object.create(null),
    this.rawAttributes = {};
    this._attrsExp = "" // stored for two-pass attribute flushing in readOpeningTag
    this._attrsExpStart = undefined; // absolute document offset of _attrsExp's first char
    this._rawAttrMatchCount = 0;
    this._parsedAttrs = [];
  }
}

/**
 * Try to match an upcoming closing tag against the name we already expect
 * (the tag sitting on top of the stack) without reading it into a string
 * first. Peeks character-by-character (no consumption) — a mismatch, or
 * running out of buffered data, costs nothing to undo since nothing was
 * consumed. Caller falls back to the normal read+validate+compare path in
 * either case, so this never needs its own error handling or chunk-boundary
 * logic.
 *
 * On success, only whitespace is allowed between the name and '>' — matches
 * XML's own grammar for ETag (`</tag ... >`, no attributes permitted).
 *
 * @param {Source} source
 * @param {string} expectedRawName - the raw (pre namespace-stripped) name
 *   the currently-open tag was written with
 * @returns {number} characters to consume (name + whitespace + '>'), or -1
 *   if this isn't a match (or not enough data yet to tell)
 */
export function tryMatchClosingTagName(source, expectedRawName) {
  // false (mismatch) and null (not enough buffered data yet) both fall back
  // to the same slow path below, so both collapse to -1 here.
  if (source.matchAhead(expectedRawName) !== true) return -1;
  let i = expectedRawName.length;
  let c = source.readChAt(i);
  if (c === '>') return i + 1;
  while (isSpace(c)) {
    i++;
    c = source.readChAt(i);
    if (c === '>') return i + 1;
  }
  if (c !== '>') return -1;
  return i + 1;
}

/**
 * Read closing tag name.
 *
 * Uses level-1 (inner) mark so flush() knows the safe trim boundary while
 * this reader is in progress. Does NOT overwrite the level-0 outer mark set
 * by parseXml()'s loop, which rewindToMark() always restores to.
 *
 * @param {Source} source
 * @returns {string} tag name
 */
export function readClosingTagName(source) {
  source.markTokenStart(1);
  // Closing tags never carry attributes, so unlike an opening tag's
  // expression there is no quoting to worry about — the very first '>' is
  // always the real end. That means the whole name can be found with one
  // direct scan of whatever is already buffered (readUptoChar), instead of
  // asking "is there more data yet?" before every single character.
  const start = source.startIndex;
  try {
    const str = source.readUptoChar(">");
    return str.trimEnd();
  } catch (err) {
    // Buffer ran out before '>' showed up — the retryable chunk-boundary
    // case (readUptoChar didn't consume anything on failure). Re-throw with
    // whatever was buffered so far in the message so autoClose's truncation
    // recovery (which reads it back out of the message) can still report a
    // useful partial tag name.
    const partial = source.readStr(Number.MAX_SAFE_INTEGER, start);
    throw new ParseError(`Unexpected end of source reading closing tag '</${partial}'`, ErrorCode.UNEXPECTED_END);
  }
}

/**
 * Read an XML opening tag expression and return a tag descriptor.
 *
 * Handles normal tags — not comments, CDATA, or DOCTYPE.
 * Example input (from source, after '<'): `tag attr='some"' attr2=">" bool>`
 *
 * Uses level-1 (inner) mark — see readClosingTagName for rationale.
 *
 * @param {object} parser - Xml2JsParser instance
 * @returns {{ tagName, selfClosing, rawAttributes, _attrsExp }}
 */
export function readTagExp(parser) {
  parser.source.markTokenStart(1);
  // Absolute document offset where `exp` (tag name onward, right after '<')
  // begins — captured before any reads so buildTagExpObj can compute each
  // attribute's absolute document position from its offset within attrsExp.
  const expStart = absolutePosition(parser.source);

  // Pick the scan variant once — scanTagExpEnd records quote positions for
  // AttributeProcessor to reuse; scanTagExpEndFast skips that bookkeeping
  // entirely when attributes are being skipped (nobody reads _quotePairs).
  // No flag is passed into the loop; the decision is made here, once.
  const collectQuotes = !parser.options.skip.attributes;
  const relEnd = collectQuotes
    ? parser.source.scanTagExpEnd()
    : parser.source.scanTagExpEndFast();

  if (relEnd === -1) {
    // Buffer exhausted before an unquoted '>' was found — chunk boundary
    // mid-tag. Throw UNEXPECTED_END so feed()/parseStream() rewinds to the
    // level-0 outer mark and retries. (Note: scanTagExpEnd() only returns a
    // non-negative index once both quote flags are already balanced-closed —
    // by construction, not by a separate post-scan check — so there is no
    // longer a distinct "unclosed quote but '>' was found" case to detect;
    // the old UNCLOSED_QUOTE branch here was checking the same two flags
    // immediately after the only code path that requires them both false,
    // making it permanently unreachable.)
    throw new ParseError("Unexpected closing of source waiting for '>'", ErrorCode.UNEXPECTED_END);
  }

  const exp = parser.source.readStr(relEnd);
  parser.source.updateBufferBoundary(relEnd + 1);

  // Quote positions the scan above already found while looking for '>' —
  // handed to AttributeProcessor so it doesn't re-scan for quotes itself.
  // Only usable when this source's offsets are guaranteed to line up 1:1
  // with characters in the decoded `exp` string — false for BufferSource
  // reading UTF-8, where a byte offset can land mid-character (see
  // BufferSource._quotePairsUsable doc). Consumed synchronously by
  // buildTagExpObj below, before any other tag scan can touch the array
  // again, so no staleness risk. `_quotePairs` is a fixed-capacity reusable
  // typed array — `_quotePairsLen` says how many of its slots are valid for
  // this tag (not `_quotePairs.length`, which is always the full capacity).
  const usableQuotes = collectQuotes && parser.source._quotePairsUsable !== false;
  const quotePairs = usableQuotes ? parser.source._quotePairs : undefined;
  const quotePairsLen = usableQuotes ? parser.source._quotePairsLen : 0;

  return buildTagExpObj(exp, parser, expStart, false, quotePairs, quotePairsLen);
}

/**
 * Read a processing-instruction tag expression (<?name attrs?>).
 *
 * Uses level-1 (inner) mark — see readClosingTagName for rationale.
 *
 * @param {object} parser
 * @returns {{ tagName, selfClosing, rawAttributes, _attrsExp }}
 */
export function readPiExp(parser) {
  parser.source.markTokenStart(1);
  const expStart = absolutePosition(parser.source);
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let i;
  let EOE = false;

  for (i = 0; parser.source.canRead(i); i++) {
    const currentChar = parser.source.readChAt(i);
    const nextChar = parser.source.readChAt(i + 1);

    if (currentChar === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
    } else if (currentChar === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
    }

    if (!inSingleQuotes && !inDoubleQuotes) {
      if (currentChar === '?' && nextChar === '>') {
        EOE = true;
        break;
      }
    }
  }

  if (!EOE) {
    // Buffer exhausted before '?>' — chunk boundary mid-PI-tag.
    throw new ParseError("Unexpected closing of source waiting for '?>'", ErrorCode.UNEXPECTED_END);
  } else if (inSingleQuotes || inDoubleQuotes) {
    // '?>' found but a quote was never closed — real syntax error.
    throw new ParseError("Invalid attribute expression. Quote is not properly closed in PI tag expression", ErrorCode.UNCLOSED_QUOTE);
  }

  // if (!parser.options.skip.attributes) {
  //   //TODO: use regex to verify attributes if not set to ignore
  // }

  const exp = parser.source.readStr(i);
  parser.source.updateBufferBoundary(i + 2);
  return buildTagExpObj(exp, parser, expStart, true);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Parse a raw tag expression string into a structured tag descriptor.
 *
 * @param {string} exp      - everything between '<' and '>' (exclusive)
 * @param {object} parser
 * @param {number} [expStart] - absolute document offset where `exp` begins
 *   (i.e. right after '<' or '<?'). Used to compute each attribute's absolute
 *   document position (tagExp._attrsExpStart) for addAttribute()'s meta arg.
 *   Optional so callers that don't have/need it can omit it — attribute
 *   position metadata is simply unavailable in that case, not an error.
 * @param {Array<number>} [quotePairs] - flat [openIdx, closeIdx, ...] list
 *   from scanTagExpEnd(), offsets relative to `exp`'s start. Passed through
 *   to collectRawAttributes so parseAttributes() can skip re-scanning for
 *   quotes. Undefined when unavailable/unsafe for this source or call site
 *   (readPiExp never supplies one) — collectRawAttributes falls back to its
 *   own scan in that case.
 * @param {number} [quotePairsLen=0] - how many entries in `quotePairs` are
 *   valid (it's a reused fixed-capacity array, not sized to this tag).
 * @returns {{ tagName, selfClosing, rawAttributes, _attrsExp, _attrsExpStart }}
 */
function buildTagExpObj(exp, parser, expStart, forceToReadAttrs = false, quotePairs = undefined, quotePairsLen = 0) {
  const tagExp = new TagExp();

  const expLen = exp.length;

  if (exp[expLen - 1] === "/") {
    tagExp.selfClosing = true;
    exp = exp.slice(0, -1); // Remove the trailing slash
  }

  // Separate tag name from attribute expression
  let attrsExp = "";
  let i = 0;
  let attrsLocalOffset; // exp-relative offset where attrsExp begins — rebases quotePairs

  for (; i < exp.length; i++) {
    const c = exp[i];
    if (isSpace(c)) {
      tagExp.tagName = exp.substring(0, i);
      attrsExp = exp.substring(i + 1);
      attrsLocalOffset = i + 1;
      if (expStart !== undefined) tagExp._attrsExpStart = expStart + i + 1;
      break;
    }
  }
  //only tag
  if (tagExp.tagName.length === 0 && i === exp.length) tagExp.tagName = exp;
  tagExp.tagName = tagExp.tagName.trimEnd();
  tagExp._attrsExp = attrsExp;

  if (!parser.isValidQName(tagExp.tagName)) {
    throw new ParseError("Invalid tag name", ErrorCode.INVALID_TAG_NAME);
  }

  // Pass 1: collect raw attribute values for matcher.updateCurrent().
  // Pass 2 (flushAttributes) runs later in readOpeningTag, after updateCurrent().
  if (forceToReadAttrs || !parser.options.skip.attributes && attrsExp.length > 0) {
    collectRawAttributes(attrsExp, parser, tagExp, quotePairs, attrsLocalOffset, quotePairsLen);
  }
  // console.log(tagExp)
  return tagExp;
}

