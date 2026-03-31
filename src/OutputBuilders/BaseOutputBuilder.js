/**
 * Element type constants passed in the ValueParser context object.
 * These are the only two values `context.elementType` will ever carry.
 *
 * @enum {string}
 */
export const ElementType = Object.freeze({
  ELEMENT: 'ELEMENT',
  ATTRIBUTE: 'ATTRIBUTE',
});

export default class BaseOutputBuilder {

  constructor(readonlyMatcher) {
    this.matcher = readonlyMatcher || null;
  }

  /**
   * Add a parsed attribute to the current element.
   * Only called when skip.attributes is false.
   *
   * @param {string}  name    - processed attribute name (prefix stripped, sanitised)
   * @param {*}       value   - raw attribute value
   * @param {object}  matcher - read-only Matcher proxy from the parser
   */
  addAttribute(name, value, matcher) {
    const prefixed = this.options.attributes.prefix + name + this.options.attributes.suffix;
    const context = {
      elementName: name,
      elementValue: value,
      elementType: ElementType.ATTRIBUTE,
      matcher: matcher,   // read-only proxy — always reflects current path
      isLeafNode: true,      // attributes are always leaf values
    };
    //TODO: sanitize name
    this.attributes[prefixed] = this.parseValue(value, this.options.attributes.valueParsers, context);
  }

  /**
   * Run a value through the registered parser chain.
   *
   * Each parser receives `(currentValue, context)` where context is:
   * ```
   * {
   *   elementName:  string,           // element name or attribute name
   *   elementValue: any,              // original value before this parse call
   *   elementType:  'ELEMENT'|'ATTRIBUTE',
   *   matcher:      ReadOnlyMatcher,  // inspect path, attributes, position
   *   isLeafNode:   boolean|null,     // null when not yet determinable
   * }
   * ```
   *
   * @param {string} val
   * @param {Array<string|object>} valParsers
   * @param {object} [context]
   */
  parseValue(val, valParsers, context) {
    for (let i = 0; i < valParsers.length; i++) {
      let parser = valParsers[i];
      if (typeof parser === 'string') {
        parser = this.registeredValParsers[parser];
      }
      if (parser) {
        val = parser.parse(val, context);
      }
    }
    return val;
  }

  /** Hook for subclasses to append a named child node. */
  _addChild(key, val) { }

  /**
   * Add a comment node.
   * - Dropped entirely when skip.comment is true.
   * - Stored under nameFor.comment when set; '' = omit from output.
   */
  addComment(text) {
    if (this.options.skip.comment) return;
    if (this.options.nameFor.comment) {
      this._addChild(this.options.nameFor.comment, text);
    }
  }

  /**
   * Add a CDATA section.
   * - Dropped entirely when skip.cdata is true.
   * - Stored under nameFor.cdata when set; '' = merge into element text value.
   */
  addLiteral(text) {
    if (this.options.skip.cdata) return;
    if (this.options.nameFor.cdata) {
      this._addChild(this.options.nameFor.cdata, text);
    } else {
      this.addRawValue(text || "");
    }
  }

  /**
   * Add raw text directly to the current element's text value, bypassing any
   * value-parser chain. Used by addLiteral() when CDATA merges into element text.
   * Subclasses that override addValue() will have that override respected here
   * because this is a regular prototype method, not an arrow function.
   */
  addRawValue(text) {
    this.addValue(text);
  }

  /**
   * Receive DOCTYPE entities from the XML parser and forward them to any
   * registered value parser that knows how to handle them.
   *
   * Called once per parse by Xml2JsParser immediately after the DOCTYPE block
   * is read. The default implementation is intentionally generic — it forwards
   * to every registered value parser that exposes an addInputEntities()
   * method, without coupling BaseOutputBuilder to any specific parser type.
   *
   * Subclasses may override this if they need different routing behaviour,
   * but the default forwarding is sufficient for all standard builders.
   *
   * @param {object} entities — raw entity map from DocTypeReader
   */
  addInputEntities(entities) {
    for (const vp of Object.values(this.registeredValParsers)) {
      if (typeof vp.addInputEntities === 'function') {
        vp.addInputEntities(entities);
      }
    }
  }

  /**
   * Handle XML declaration (<?xml ... ?>).
   * Dropped when skip.declaration is true.
   */
  addDeclaration() {
    this.addInstruction("?xml");
  }

  /**
   * Handle a processing instruction.
   * Subclasses override; base clears attributes.
   */
  addInstruction(name) {
  }
}