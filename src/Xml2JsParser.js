import StringSource from './InputSource/StringSource.js';
import BufferSource from './InputSource/BufferSource.js';
import { readTagExp, readClosingTagName, flushAttributes } from './XmlPartReader.js';
import { StopNodeProcessor } from './StopNodeProcessor.js';
import { readComment, readCdata, readPiTag } from './XmlSpecialTagsReader.js';
import { Expression, Matcher } from 'path-expression-matcher';
import EntitiesParser from './EntitiesParser.js';
import ReplaceEntitiesValueParser from './ValueParsers/EntitiesParser.js';
import { readDocType } from './DocTypeReader.js';
import { DANGEROUS_PROPERTY_NAMES, criticalProperties } from './util.js';
import AutoCloseHandler from './AutoCloseHandler.js';
import { ParseError, ErrorCode } from './ParseError.js';

class TagDetail {
  /**
   * @param {string} name  - Tag name
   * @param {number} line  - 1-based line number where the opening tag began
   * @param {number} col   - 1-based column where the opening tag began
   * @param {number} index - Character offset from document start
   */
  constructor(name, line = 0, col = 0, index = 0) {
    this.name = name;
    this.line = line;
    this.col = col;
    this.index = index;
  }
}

export default class Xml2JsParser {
  constructor(options) {
    this.options = options;

    this.currentTagDetail = null;
    this.tagTextData = "";
    this.tagsStack = [];

    const ep = options.entityParseOptions;

    // EntitiesParser is configured entirely from entityParseOptions.
    // It holds all entity tables and enforces security limits.
    this.entityParser = new EntitiesParser(ep);

    this.matcher = new Matcher();

    //create once and reuse
    this.readonlyMatcher = this.matcher.readOnly();

    // AutoClose handler — created once per parser instance, reset on each parse
    this.autoCloseHandler = options.autoClose
      ? new AutoCloseHandler(options.autoClose)
      : null;

    this._unpairedSet = new Set(this.options.tags.unpaired);

    // Pre-compile stopNodes as { expr: Expression, skipEnclosures: [] } objects.
    // OptionsBuilder has already normalized each entry to { expression, skipEnclosures }.
    this.stopNodeExpressions = [];
    for (const entry of this.options.tags.stopNodes) {
      const expr = entry.expression instanceof Expression
        ? entry.expression
        : new Expression(entry.expression);
      this.stopNodeExpressions.push({ expr, skipEnclosures: entry.skipEnclosures });
    }
  }

  initializeParser() {
    this.tagTextData = "";
    this.tagsStack = [];
    this._stopNodeProcessor = null;

    if (!this.matcher) {
      this.matcher = new Matcher();
      this.readonlyMatcher = this.matcher.readOnly();
    }

    this.outputBuilder = this._createOutputBuilder();

    this.root = { root: true, name: "" };
    this.currentTagDetail = this.root;
  }

  /**
   * Create an OutputBuilder instance, injecting the shared entityParser so
   * that 'replaceEntities' in any valueParsers chain resolves correctly and
   * shares the same entity table (including DocType entities collected during parsing).
   */
  _createOutputBuilder() {
    const inst = this.options.OutputBuilder.getInstance(this.options);

    // Register under 'replaceEntities' — the canonical value parser key.
    const vp = new ReplaceEntitiesValueParser(this.entityParser);
    inst.registeredParsers['replaceEntities'] = vp;

    return inst;
  }

  parse(strData) {
    this.source = new StringSource(strData);
    this.entityParser.resetCounters();
    this.initializeParser();
    this._parseAndFinalize();
    return this.outputBuilder.getOutput();
  }

  parseBytesArr(data) {
    this.source = new BufferSource(data);
    this.entityParser.resetCounters();
    this.initializeParser();
    this._parseAndFinalize();
    return this.outputBuilder.getOutput();
  }

  /**
   * Advance the parser state machine as far as the source buffer allows.
   * Stops naturally when canRead() returns false — no EOF handling here.
   * Call finalizeXml() once all input is consumed to validate end-of-document.
   *
   * parseStream() and feed()/end() call this per chunk; _parseAndFinalize()
   * (used by parse() / parseBytesArr()) calls it then finalizeXml() immediately.
   */
  parseXml() {
    while (this.source.canRead()) {
      // Level-0 outer mark: set before consuming any character so that if a
      // '<' dispatch throws UNEXPECTED_END (chunk boundary mid-tag), feed()
      // rewinds to here and the full token — including '<', '![', '</' etc. —
      // is re-read on the next chunk. Inner reader functions use level-1 marks
      // which never overwrite this position.
      this.source.markTokenStart(0);

      const ch = this.source.readCh();
      if (ch === undefined || ch === '') break;

      if (ch === '<') {
        const nextChar = this.source.readChAt(0);
        if (nextChar === '') throw new ParseError(
          "Unexpected end of source after '<'",
          ErrorCode.UNEXPECTED_END,
          { line: this.source.line, col: this.source.cols, index: this.source.startIndex }
        );

        if (nextChar === '!' || nextChar === '?') {
          this.source.updateBufferBoundary();
          this.addTextNode();
          this.readSpecialTag(nextChar);
        } else if (nextChar === '/') {
          this.source.updateBufferBoundary();
          this.readClosingTag();
        } else {
          this.readOpeningTag();
        }
      } else {
        this.tagTextData += ch;
      }
    }
  }

  /**
   * Validate end-of-document state and apply autoClose recovery if configured.
   * Must be called exactly once after all input has been consumed.
   */
  finalizeXml() {
    const hasOpenTags = this.tagsStack.length > 0 ||
      (this.currentTagDetail && !this.currentTagDetail.root);

    const hasTrailingText =
      !hasOpenTags &&
      this.tagTextData !== undefined &&
      this.tagTextData.trimEnd().length > 0;

    if (hasOpenTags || hasTrailingText) {
      if (this.autoCloseHandler && hasOpenTags && !hasTrailingText) {
        this.autoCloseHandler.handleEof(this._parserState());
      } else {
        throw new ParseError('Unexpected data in the end of document', ErrorCode.UNEXPECTED_TRAILING_DATA);
      }
    }
  }

  /**
   * One-shot helper used by parse() and parseBytesArr().
   * Runs parseXml() with autoClose partial-tag recovery, then finalizeXml().
   * @private
   */
  _parseAndFinalize() {
    let partialTagError = null;
    if (this.autoCloseHandler) this.autoCloseHandler.reset();

    try {
      this.parseXml();
    } catch (err) {
      if (this.autoCloseHandler && isSourceExhaustedError(err)) {
        partialTagError = err;
      } else {
        throw err;
      }
    }

    if (partialTagError) {
      this.autoCloseHandler.handlePartialTag(partialTagError, this._parserState());
      return;
    }

    this.finalizeXml();
  }

  readClosingTag() {
    const tagName = this.processTagName(readClosingTagName(this.source));

    if (this.isUnpaired(tagName) || this.isStopNode()) {
      throw new ParseError(`Unexpected closing tag '${tagName}'`, ErrorCode.UNEXPECTED_CLOSE_TAG, { line: this.source.line, col: this.source.cols, index: this.source.startIndex });
    }

    if (tagName !== this.currentTagDetail.name) {
      if (!this.autoCloseHandler) {
        throw new ParseError(
          `Unexpected closing tag '${tagName}' expecting '${this.currentTagDetail.name}'`,
          ErrorCode.MISMATCHED_CLOSE_TAG,
          { line: this.source.line, col: this.source.cols, index: this.source.startIndex }
        );
      }

      const decision = this.autoCloseHandler.handleMismatch(tagName, this._parserState());

      if (decision.action === 'discard') return;
      // 'close-matched': handler updated currentTagDetail; fall through to normal close
    }

    if (!this.currentTagDetail.root) this.addTextNode();
    this.popTag();
  }

  readOpeningTag() {
    this.addTextNode();

    // ── Stop-node resume ─────────────────────────────────────────────────────
    // When a chunk boundary fell inside StopNodeProcessor.collect(), feed() caught
    // UNEXPECTED_END and rewound the source to the '<' of the stop node's
    // opening tag. On the next feed() we re-enter here with the processor active.
    // Re-consume the opening tag (source was rewound to its '<'), then resume
    // collection — the processor remembers all accumulated content and depth.
    if (this._stopNodeProcessor && this._stopNodeProcessor.isActive()) {
      const { tagDetail } = this._stopNodeProcessorMeta;
      this._stopNodeProcessor.resumeAfterOpenTag();
      readTagExp(this); // re-consume the opening tag from the rewound source
      const content = this._stopNodeProcessor.collect(this.source);
      this.outputBuilder.addTag(tagDetail, this.readonlyMatcher);
      this.outputBuilder.onStopNode?.(tagDetail, content, this.readonlyMatcher);
      this.outputBuilder.addValue(content, this.readonlyMatcher);
      this.outputBuilder.closeTag(this.readonlyMatcher);
      this.matcher.pop();
      this._stopNodeProcessor = null;
      this._stopNodeProcessorMeta = null;
      return;
    }

    let tagExp = readTagExp(this);
    const processedTagName = this.processTagName(tagExp.tagName);
    const tagDetail = new TagDetail(
      processedTagName,
      this.source.line,
      this.source.cols,
      this.source.startIndex,
    );

    // ── Limit: maxNestedTags ─────────────────────────────────────────────────
    const maxNested = this.options.limits?.maxNestedTags;
    if (maxNested !== undefined && maxNested !== null) {
      const depth = this.tagsStack.length + 1;
      if (depth > maxNested) {
        throw new ParseError(
          `Nesting depth ${depth} exceeds limit of ${maxNested} (tag: '${processedTagName}')`,
          ErrorCode.LIMIT_MAX_NESTED_TAGS,
          { line: tagDetail.line, col: tagDetail.col, index: tagDetail.index }
        );
      }
    }

    // ── Two-pass attribute handling ──────────────────────────────────────────
    const rawAttributes = tagExp.rawAttributes || {};

    this.matcher.push(processedTagName, {});
    if (Object.keys(rawAttributes).length > 0) {
      this.matcher.updateCurrent(rawAttributes);
    }

    if (!this.options.skip.attributes) {
      flushAttributes(tagExp._attrsExp, this);
    }

    // Stop-node check AFTER attributes are set so attribute conditions work.
    const stopNodeConfig = this.isStopNode();

    if (this.isUnpaired(processedTagName)) {
      this.outputBuilder.addTag(tagDetail, this.readonlyMatcher);
      this.outputBuilder.closeTag(this.readonlyMatcher);
      this.matcher.pop();
    } else if (tagExp.selfClosing) {
      this.outputBuilder.addTag(tagDetail, this.readonlyMatcher);
      this.outputBuilder.closeTag(this.readonlyMatcher);
      this.matcher.pop();
    } else if (stopNodeConfig) {
      // First encounter: create a fresh processor with the matching skipEnclosures.
      this._stopNodeProcessor = new StopNodeProcessor(processedTagName, stopNodeConfig.skipEnclosures);
      this._stopNodeProcessorMeta = { tagDetail };
      this._stopNodeProcessor.activate();
      const content = this._stopNodeProcessor.collect(this.source);
      this.outputBuilder.addTag(tagDetail, this.readonlyMatcher);
      this.outputBuilder.onStopNode?.(tagDetail, content, this.readonlyMatcher);
      this.outputBuilder.addValue(content, this.readonlyMatcher);
      this.outputBuilder.closeTag(this.readonlyMatcher);
      this.matcher.pop();
      this._stopNodeProcessor = null;
      this._stopNodeProcessorMeta = null;
    } else {
      this.pushTag(tagDetail);
    }
  }

  /**
   * Push a tag onto the parser stack and notify the output builder.
   * This is the single point of entry for opening a non-self-closing tag —
   * both the parser-side stack (currentTagDetail / tagsStack) and the
   * output builder are updated together, keeping them in sync.
   *
   * Custom OutputBuilder implementations that maintain their own tag stack
   * should override addTag() rather than calling pushTag() directly.
   *
   * @param {TagDetail} tagDetail
   */
  pushTag(tagDetail) {
    this.tagsStack.push(this.currentTagDetail);
    this.outputBuilder.addTag(tagDetail, this.readonlyMatcher);
    this.currentTagDetail = tagDetail;
  }

  /**
   * Pop the current tag from the parser stack and notify the output builder.
   * This is the single point of exit for closing a tag — both stacks are
   * updated together.
   */
  popTag() {
    this.outputBuilder.closeTag(this.readonlyMatcher);
    this.matcher.pop();
    this.currentTagDetail = this.tagsStack.pop();
  }

  readSpecialTag(startCh) {
    if (startCh === "!") {
      let nextChar = this.source.readCh();
      if (nextChar === null || nextChar === undefined) throw new ParseError("Unexpected end of source after '<!'", ErrorCode.UNEXPECTED_END, { line: this.source.line, col: this.source.cols, index: this.source.startIndex });

      if (nextChar === "-") {
        readComment(this);
      } else if (nextChar === "[") {
        readCdata(this);
      } else if (nextChar === "D") {
        // DOCTYPE is always read to consume its content and advance the cursor.
        // Entities are stored only when entityParseOptions.docType is true.
        const docTypeEntities = readDocType(this);
        if (this.options.entityParseOptions.docType &&
          docTypeEntities &&
          Object.keys(docTypeEntities).length > 0) {
          this.entityParser.addDocTypeEntities(docTypeEntities);
        }
      }
    } else if (startCh === "?") {
      readPiTag(this);
    } else {
      throw new ParseError(`Invalid tag '<${startCh}'`, ErrorCode.INVALID_TAG, { line: this.source.line, col: this.source.cols, index: this.source.startIndex });
    }
  }

  addTextNode() {
    if (this.tagTextData !== undefined && this.tagTextData !== "") {
      if (this.tagTextData.trim().length > 0) {
        // Pass raw text — entity expansion is handled by 'entities' ValueParser in the chain
        this.outputBuilder.addValue(this.tagTextData, this.readonlyMatcher);
      }
      this.tagTextData = "";
    }
  }

  processAttrName(attrName) {
    attrName = resolveNsPrefix(attrName, this.options.skip.nsPrefix);
    attrName = sanitizeName(attrName, this.options.onDangerousProperty);
    if (this.options.strictReservedNames && attrName === this.options.attributes.groupBy) {
      throw new ParseError(`Restricted attribute name: ${attrName}`, ErrorCode.SECURITY_RESTRICTED_NAME);
    }
    return attrName;
  }

  processTagName(tagName) {
    tagName = resolveNsPrefix(tagName, this.options.skip.nsPrefix);
    tagName = sanitizeName(tagName, this.options.onDangerousProperty);
    if (this.options.strictReservedNames && (
      tagName === this.options.nameFor.comment ||
      tagName === this.options.nameFor.cdata ||
      tagName === this.options.nameFor.text
    )) {
      throw new ParseError(`Restricted tag name: ${tagName}`, ErrorCode.SECURITY_RESTRICTED_NAME);
    }
    return tagName;
  }

  isUnpaired(tagName) {
    return this._unpairedSet.has(tagName);
  }

  /**
   * Returns the matched stop-node config `{ expr, skipEnclosures }` if the
   * current matcher position matches any stop-node expression, or `null` if not.
   */
  isStopNode() {
    for (const config of this.stopNodeExpressions) {
      if (this.matcher.matches(config.expr)) return config;
    }
    return null;
  }

  /**
   * Snapshot of mutable parser state passed to AutoCloseHandler.
   * Returns a live object — properties read from it reflect current state.
   */
  _parserState() {
    const self = this;
    return {
      get tagsStack() { return self.tagsStack; },
      get currentTagDetail() { return self.currentTagDetail; },
      set currentTagDetail(v) { self.currentTagDetail = v; },
      get outputBuilder() { return self.outputBuilder; },
      get readonlyMatcher() { return self.readonlyMatcher; },
      get matcher() { return self.matcher; },
      get source() { return self.source; },
      get tagTextData() { return self.tagTextData; },
      set tagTextData(v) { self.tagTextData = v; },
      addTextNode: self.addTextNode.bind(self),
      popTag: self.popTag.bind(self),
    };
  }
}

function resolveNsPrefix(name, skipNsPrefix) {
  if (skipNsPrefix) {
    const parts = name.split(':');
    if (parts.length === 2) {
      if (parts[0] === 'xmlns') return false; // drop xmlns declarations
      return parts[1];
    } else if (parts.length > 2) {
      throw new ParseError(`Multiple namespaces in name: ${name}`, ErrorCode.MULTIPLE_NAMESPACES);
    }
  }
  return name;
}

function sanitizeName(name, onDangerousProperty) {
  if (criticalProperties.includes(name)) {
    throw new ParseError(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`, ErrorCode.SECURITY_PROTOTYPE_POLLUTION);
  } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return onDangerousProperty(name);
  }
  return name;
}

/**
 * Returns true for errors thrown by read functions when the source ran out
 * mid-token — i.e. the document was truncated inside a tag.
 * These are the only errors we intercept for autoClose recovery.
 * Syntax errors (unclosed quotes) are NOT intercepted — they rethrow.
 */
function isSourceExhaustedError(err) {
  // Accept both ParseError (with codes) and plain Error from lower-level readers
  if (err instanceof ParseError) {
    return err.code === ErrorCode.UNEXPECTED_END;
  }
  return (
    err.message.startsWith('Unexpected end of source') ||
    err.message.startsWith('Unexpected closing of source')
  );
}