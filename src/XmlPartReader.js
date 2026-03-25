'use strict';
import { ParseError, ErrorCode } from './ParseError.js';

/**
 * find paired tag for a stop node
 * @param {string} xmlDoc
 * @param {string} tagName
 * @param {number} i : start index
 */
export function readStopNode(xmlDoc, tagName, i) {
  const startIndex = i;
  // Starting at 1 since we already have an open tag
  let openTagCount = 1;

  for (; i < xmlDoc.length; i++) {
    if (xmlDoc[i] === "<") {
      if (xmlDoc[i + 1] === "/") {//close tag
        const closeIndex = findSubStrIndex(xmlDoc, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlDoc.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlDoc.substring(startIndex, i),
              i: closeIndex
            }
          }
        }
        i = closeIndex;
      } else if (xmlDoc[i + 1] === '?') {
        const closeIndex = findSubStrIndex(xmlDoc, "?>", i + 1, "StopNode is not closed.")
        i = closeIndex;
      } else if (xmlDoc.substr(i + 1, 3) === '!--') {
        const closeIndex = findSubStrIndex(xmlDoc, "-->", i + 3, "StopNode is not closed.")
        i = closeIndex;
      } else if (xmlDoc.substr(i + 1, 2) === '![') {
        const closeIndex = findSubStrIndex(xmlDoc, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlDoc, i, '>')

        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }//end for loop
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
  let text = "";
  while (source.canRead()) {
    let ch = source.readCh();
    if (ch === ">") return text.trimEnd();
    else text += ch;
  }
  throw new ParseError(`Unexpected end of source reading closing tag '</${text}'`, ErrorCode.UNEXPECTED_END);
}

/**
 * Read XML tag and build attributes map.
 * This function can be used to read normal tag, pi tag.
 * This function can't be used to read comment, CDATA, DOCTYPE.
 * Eg <tag attr = ' some"' attr= ">" bool>
 *
 * Uses level-1 (inner) mark — see readClosingTagName for rationale.
 *
 * @param {object} parser
 * @returns tag expression includes tag name & attribute string
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
    // Buffer exhausted before '>' was found. If we were inside a quoted value,
    // this is a chunk boundary mid-attribute (e.g. id="hello| |world") — not a
    // syntax error. Throw UNEXPECTED_END so feed()/parseStream() rewinds to the
    // level-0 outer mark and retries the full tag on the next chunk.
    // UNCLOSED_QUOTE is only correct when '>' was found while quotes were still
    // open, which is a genuine XML syntax error.
    throw new ParseError("Unexpected closing of source waiting for '>'", ErrorCode.UNEXPECTED_END);
  } else if (inSingleQuotes || inDoubleQuotes) {
    // '>' found but a quote was never closed — real syntax error.
    throw new ParseError("Invalid attribute expression. Quote is not properly closed", ErrorCode.UNCLOSED_QUOTE);
  }

  const exp = parser.source.readStr(i);
  parser.source.updateBufferBoundary(i + 1);
  return buildTagExpObj(exp, parser)
}

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
  parser.source.updateBufferBoundary(i + 1);
  return buildTagExpObj(exp, parser)
}

function buildTagExpObj(exp, parser) {
  const tagExp = {
    tagName: "",
    selfClosing: false,
    rawAttributes: Object.create(null),
    _attrsExp: "", // stored for two-pass attribute flushing in readOpeningTag
  };
  let attrsExp = "";

  // Check for self-closing tag before setting the name
  if (exp[exp.length - 1] === "/") {
    tagExp.selfClosing = true;
    exp = exp.slice(0, -1); // Remove the trailing slash
  }

  //separate tag name
  let i = 0;
  for (; i < exp.length; i++) {
    const char = exp[i];
    if (char === " ") {
      tagExp.tagName = exp.substring(0, i);
      attrsExp = exp.substring(i + 1);
      break;
    }
  }
  //only tag
  if (tagExp.tagName.length === 0 && i === exp.length) tagExp.tagName = exp;

  tagExp.tagName = tagExp.tagName.trimEnd();

  tagExp._attrsExp = attrsExp;  // save for pass 2 (flushAttributes)

  if (!parser.options.skip.attributes && attrsExp.length > 0) {
    parseAttributesExp(attrsExp, parser, tagExp.rawAttributes);
  }

  return tagExp;
}

const attrsRegx = new RegExp('([^\\s=]+)\\s*(=\\s*([\'"])([\\s\\S]*?)\\3)?', 'gm');

/**
 * parseAttributesExp — two-pass attribute processing.
 *
 * Pass 1 (collectRawAttributes): populate rawAttributes map only.
 *   Called inside buildTagExpObj so rawAttributes is ready before
 *   readOpeningTag calls matcher.updateCurrent(rawAttributes).
 *
 * Pass 2 (flushAttributes): call outputBuilder.addAttribute for each attribute.
 *   Called from readOpeningTag AFTER matcher.updateCurrent(), so the read-only
 *   matcher already reflects the full attribute context when value parsers run.
 */
function collectRawAttributes(attrStr, parser, rawAttributes) {
  const matches = getAllMatches(attrStr, attrsRegx);
  const len = matches.length;
  for (let i = 0; i < len; i++) {
    let attrName = parser.processAttrName(matches[i][1]);
    if (attrName === false) continue;

    const rawVal = matches[i][4];
    const attrVal = rawVal !== undefined ? rawVal : true;

    rawAttributes[matches[i][1]] = attrVal;
  }
}

/**
 * Flush attributes to output builder.
 * @param {string} attrStr
 * @param {XMLParser} parser
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
    let attrName = parser.processAttrName(matches[i][1]);
    if (attrName === false) continue;

    const rawVal = matches[i][4];
    const attrVal = rawVal !== undefined ? rawVal : true;

    parser.outputBuilder.addAttribute(attrName, attrVal, parser.readonlyMatcher);
  }
}

function parseAttributesExp(attrStr, parser, rawAttributes) {
  collectRawAttributes(attrStr, parser, rawAttributes);
}

const getAllMatches = function (string, regex) {
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
};