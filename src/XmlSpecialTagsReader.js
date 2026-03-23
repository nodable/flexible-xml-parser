import { readPiExp, flushAttributes } from './XmlPartReader.js';
import { ParseError, ErrorCode } from './ParseError.js';

export function readCdata(parser) {
  //<![ already consumed up to this point
  let str = parser.source.readStr(6); // "CDATA["
  parser.source.updateBufferBoundary(6);

  if (str !== "CDATA[") throw new ParseError(
    `Invalid CDATA expression at ${parser.source.line}:${parser.source.cols}`,
    ErrorCode.INVALID_TAG,
    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
  );

  let text = parser.source.readUpto("]]>");
  parser.outputBuilder.addCdata(text);
}

export function readPiTag(parser) {
  //<? already consumed
  let tagExp = readPiExp(parser, "?>");
  if (!tagExp) throw new ParseError(
    "Invalid Pi Tag expression.",
    ErrorCode.INVALID_TAG,
    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
  );

  // Flush attributes into the output builder's this.attributes accumulator
  // so addDeclaration() / addPi() pick them up, mirroring what readOpeningTag
  // does for regular tags. PI tags are not pushed onto the matcher, so no
  // updateCurrent() call is needed here.
  if (!parser.options.skip.attributes) {
    flushAttributes(tagExp._attrsExp, parser);
  }

  if (tagExp.tagName === "xml") {
    //TODO: verify it is very first tag else error
    if (!parser.options.skip.declaration) {
      parser.outputBuilder.addDeclaration();
    }
  } else if (!parser.options.skip.pi) {
    parser.outputBuilder.addPi("?" + tagExp.tagName);
  }
}

export function readComment(parser) {
  //<!- already consumed
  let ch = parser.source.readCh();
  if (ch !== "-") throw new ParseError(
    `Invalid comment expression at ${parser.source.line}:${parser.source.cols}`,
    ErrorCode.INVALID_TAG,
    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
  );

  let text = parser.source.readUpto("-->");
  parser.outputBuilder.addComment(text);
}
