'use strict';
import { ParseError, ErrorCode } from './ParseError.js';
import { collectRawAttributes } from './AttributeProcessor.js';
import { isName } from "./util.js"
// Re-export flushAttributes so Xml2JsParser and XmlSpecialTagsReader can
// continue to import it from here without changing their import lines.
export { flushAttributes } from './AttributeProcessor.js';

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
  let i = 0;
  const start = source.startIndex;
  while (source.canRead()) {
    const ch = source.readCh();
    if (ch === ">") {
      const str = source.readStr(i, start);
      if (str) return str.trimEnd();
      else return "";
    } else i++;
  }

  const text = source.readStr(i, start);
  source.updateBufferBoundary(i);
  throw new ParseError(`Unexpected end of source reading closing tag '</${text}'`, ErrorCode.UNEXPECTED_END);
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
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let i;
  let EOE = false;

  for (i = 0; parser.source.canRead(i); i++) {
    const char = parser.source.readChAt(i);

    if (char === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
    } else if (char === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
    } else if (char === '>' && !inSingleQuotes && !inDoubleQuotes) {
      EOE = true;
      break;
    }
  }

  if (!EOE) {
    // Buffer exhausted before '>' — chunk boundary mid-tag. Throw UNEXPECTED_END
    // so feed()/parseStream() rewinds to the level-0 outer mark and retries.
    throw new ParseError("Unexpected closing of source waiting for '>'", ErrorCode.UNEXPECTED_END);
  } else if (inSingleQuotes || inDoubleQuotes) {
    // '>' found but a quote was never closed — real syntax error.
    throw new ParseError("Invalid attribute expression. Quote is not properly closed", ErrorCode.UNCLOSED_QUOTE);
  }

  const exp = parser.source.readStr(i);
  parser.source.updateBufferBoundary(i + 1);
  return buildTagExpObj(exp, parser);
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

  if (!parser.options.skip.attributes) {
    //TODO: use regex to verify attributes if not set to ignore
  }

  const exp = parser.source.readStr(i);
  parser.source.updateBufferBoundary(i + 2);
  return buildTagExpObj(exp, parser);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Parse a raw tag expression string into a structured tag descriptor.
 *
 * @param {string} exp    - everything between '<' and '>' (exclusive)
 * @param {object} parser
 * @returns {{ tagName, selfClosing, rawAttributes, _attrsExp }}
 */
function buildTagExpObj(exp, parser) {
  const tagExp = {
    tagName: "",
    selfClosing: false,
    rawAttributes: Object.create(null),
    _attrsExp: "", // stored for two-pass attribute flushing in readOpeningTag
  };

  const expLen = exp.length;

  if (exp[expLen - 1] === "/") {
    tagExp.selfClosing = true;
    exp = exp.slice(0, -1); // Remove the trailing slash
  }

  // Separate tag name from attribute expression
  let attrsExp = "";
  let i = 0;

  for (; i < expLen; i++) {
    if (exp[i] === " ") {
      tagExp.tagName = exp.substring(0, i);
      attrsExp = exp.substring(i + 1);
      break;
    }
  }
  //only tag
  if (tagExp.tagName.length === 0 && i === expLen) tagExp.tagName = exp;
  tagExp.tagName = tagExp.tagName.trimEnd();
  tagExp._attrsExp = attrsExp;

  if (!isName(tagExp.tagName)) {
    throw new ParseError("Invalid tag name", ErrorCode.INVALID_TAG_NAME);
  }

  // Pass 1: collect raw attribute values for matcher.updateCurrent().
  // Pass 2 (flushAttributes) runs later in readOpeningTag, after updateCurrent().
  if (!parser.options.skip.attributes && attrsExp.length > 0) {
    collectRawAttributes(attrsExp, parser, tagExp);
  }

  return tagExp;
}