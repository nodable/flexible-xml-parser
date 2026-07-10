import { readPiExp, flushAttributes } from './XmlPartReader.js';
import { expectMatch, errorPositionOf } from './util.js';
import { ParseError, ErrorCode } from './ParseError.js';

export function readCdata(parser) {
  // Level-1 inner mark: records where this reader began, used only by flush()
  // as a safe trim boundary. Does NOT overwrite the level-0 outer mark set by
  // parseXml()'s loop before it consumed '<![', which rewindToMark() restores to.
  parser.source.markTokenStart(1);

  //<![ already consumed up to this point
  expectMatch(parser.source, "CDATA[", "CDATA preamble");

  let text = parser.source.readUpto("]]>");
  parser.outputBuilder.addLiteral(text);
}

export function readPiTag(parser) {
  const skipOptions = parser.options.skip;
  parser.source.markTokenStart(1);
  //<? already consumed
  let tagExp = readPiExp(parser, "?>");
  if (!tagExp) {
    throw new ParseError(
      "Invalid Pi Tag expression.",
      ErrorCode.INVALID_TAG,
      errorPositionOf(parser.source)
    )
  } else if (tagExp.tagName === "xml") {
    // Read version from the declaration and store it on the parser for validators.
    const version = tagExp.rawAttributes?.version;
    if (version === '1.1') {
      parser.xmlDec.version = 1.1;
    }
    parser.xmlDec.encoding = tagExp.rawAttributes?.encoding;
    parser.xmlDec.standalone = tagExp.rawAttributes?.standalone;

    // BUG FIX: getNameValidator('qName') was already called (and memoized)
    // above the moment this PI tag's own name ("xml") got validated — before
    // xmlDec.version was known, so it was always cached with the '1.0'
    // default. Every subsequent tag/attribute name in the document —
    // including the root element — would silently be checked against XML
    // 1.0 rules even for a document declaring version="1.1". Reset the
    // cache now that the real version is known; this runs at most once per
    // document (a <?xml?> declaration can only appear once), so the cost is
    // negligible.
    // parser._nameValidators = Object.create(null);
    parser._nameValidators = {};
  }

  // Flush attributes into the output builder's this.attributes accumulator
  // so addDeclaration() / addInstruction() pick them up, mirroring what readOpeningTag
  // does for regular tags. PI tags are not pushed onto the matcher, so no
  // updateCurrent() call is needed here.
  if (!skipOptions.attributes) {
    flushAttributes(tagExp._parsedAttrs, parser, tagExp._attrsExpStart, tagExp._rawAttrMatchCount);
  }

  if (tagExp.tagName === "xml") {
    //TODO: verify it is very first tag else error
    if (!skipOptions.declaration) { //TODO: unnecessary. builder can ommit it from response if not needed
      parser.outputBuilder.addDeclaration("?xml", parser.xmlDec);
    }
  } else if (!skipOptions.pi) { //TODO: unnecessary. builder can ommit it from response if not needed
    parser.outputBuilder.addInstruction("?" + tagExp.tagName);
  }
}

export function readComment(parser) {
  parser.source.markTokenStart(1);
  //<!- already consumed
  expectMatch(parser.source, "-", "comment second dash");
  let text = parser.source.readUpto("-->");
  parser.outputBuilder.addComment(text);
}