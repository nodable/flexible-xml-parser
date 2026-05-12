import { readPiExp, flushAttributes } from './XmlPartReader.js';
import { ParseError, ErrorCode } from './ParseError.js';

export function readCdata(parser) {
  // Level-1 inner mark: records where this reader began, used only by flush()
  // as a safe trim boundary. Does NOT overwrite the level-0 outer mark set by
  // parseXml()'s loop before it consumed '<![', which rewindToMark() restores to.
  parser.source.markTokenStart(1);

  //<![ already consumed up to this point
  if (!parser.source.canRead(5)) {
    // Fewer than 6 chars available — chunk boundary inside "CDATA[" preamble.
    // Throw UNEXPECTED_END so feed() rewinds to the level-0 outer mark and
    // retries the full '<![CDATA[' on the next chunk.
    throw new ParseError(
      `Unexpected end of source reading CDATA preamble`,
      ErrorCode.UNEXPECTED_END,
      { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
    );
  }
  let str = parser.source.readStr(6); // "CDATA["
  parser.source.updateBufferBoundary(6);

  if (str !== "CDATA[") throw new ParseError(
    `Invalid CDATA expression at ${parser.source.line}:${parser.source.cols}`,
    ErrorCode.INVALID_TAG,
    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
  );

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
      { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
    )
  } else if (tagExp.tagName === "xml") {
    // Read version from the declaration and store it on the parser for validators.
    const version = tagExp.rawAttributes?.version;
    if (version === '1.1') {
      parser.xmlVersion = 1.1;
    } else {
      parser.xmlVersion = 1.0; // default
    }
  }

  // Flush attributes into the output builder's this.attributes accumulator
  // so addDeclaration() / addInstruction() pick them up, mirroring what readOpeningTag
  // does for regular tags. PI tags are not pushed onto the matcher, so no
  // updateCurrent() call is needed here.
  if (!skipOptions.attributes) {
    flushAttributes(tagExp._attrsExp, parser);
  }

  if (tagExp.tagName === "xml") {
    //TODO: verify it is very first tag else error
    if (!skipOptions.declaration) {
      parser.outputBuilder.addDeclaration("?xml");
    }
  } else if (!skipOptions.pi) {
    parser.outputBuilder.addInstruction("?" + tagExp.tagName);
  }
}

export function readComment(parser) {
  parser.source.markTokenStart(1);
  //<!- already consumed
  if (!parser.source.canRead()) {
    throw new ParseError(
      `Unexpected end of source reading comment`,
      ErrorCode.UNEXPECTED_END,
      { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
    );
  }
  let ch = parser.source.readCh();
  if (ch !== "-") throw new ParseError(
    `Invalid comment expression at ${parser.source.line}:${parser.source.cols}`,
    ErrorCode.INVALID_TAG,
    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
  );

  let text = parser.source.readUpto("-->");
  parser.outputBuilder.addComment(text);
}