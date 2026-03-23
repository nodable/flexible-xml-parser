/**
 * replaceEntities — built-in ValueParser that expands entity references.
 *
 * Add 'replaceEntities' to valueParsers to enable entity expansion (default).
 * Remove it to disable expansion entirely without touching any other option.
 *
 * Which entities are expanded is controlled entirely by `entityParseOptions`
 * on the parser — see EntitiesParser for the full option reference.
 *
 * The EntitiesParser instance is created by Xml2JsParser and injected into
 * the OutputBuilder's registeredParsers map under the key 'replaceEntities'.
 * This sharing ensures DocType entities collected during parsing are available
 * to the value parser chain.
 */
export default class ReplaceEntitiesValueParser {
  constructor(entityParser) {
    this.entityParser = entityParser;
  }

  /**
   * @param {string} val
   * @param {object} [context] - { tagName, isAttribute, attrName? }
   */
  parse(val, context) {
    if (typeof val !== 'string') return val;
    return this.entityParser.replaceEntitiesValue(val);
  }
}
