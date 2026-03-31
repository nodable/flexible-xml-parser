import EntitiesParser from './EntitiesParser.js';
import { ParseError, ErrorCode } from '../ParseError.js';

/**
 * EntitiesValueParser — value parser that expands entity references.
 *
 * Register an instance under the key 'entity' on an output builder
 * to enable entity expansion:
 *
 *   const evp = new EntitiesValueParser({ default: true, html: false });
 *   myBuilder.registerValueParser('entity', evp);
 *
 * External (custom) entities are registered directly on this instance:
 *
 *   evp.addEntity('copy', '©');
 *   evp.addEntity('trade', '™');
 *
 * DOCTYPE entities are delivered automatically by the output builder when the
 * XML parser calls outputBuilder.addInputEntities(). No manual wiring needed.
 *
 * Constructor options (all optional):
 *
 *   default             — true (default) → built-in XML entities (lt/gt/apos/quot/amp)
 *                         false/null → disable XML entity replacement
 *                         object → custom entity map replacing the built-in set
 *
 *   html                — false (default) → HTML named entities disabled
 *                         true → built-in HTML entity set (&nbsp;, &copy;, etc.)
 *                         object → custom HTML entity map
 *
 *   external            — true (default) → apply entities registered via addEntity()
 *                         false/null → stored but not applied
 *
 *   maxTotalExpansions  — max entity references expanded per document (0 = unlimited)
 *   maxExpandedLength   — max characters added by expansion per document (0 = unlimited)
 *
 *   entities            — initial external entity map, e.g. { copy: '©', trade: '™' }
 */
export default class EntitiesValueParser {
  constructor(options = {}) {
    this._parser = new EntitiesParser(options);

    // Load any entities provided at construction time
    if (options.entities && typeof options.entities === 'object') {
      this._parser.addExternalEntities(options.entities);
    }
  }

  // -------------------------------------------------------------------------
  // External entity registration
  // -------------------------------------------------------------------------

  /**
   * Register a custom entity for replacement.
   * Provide the name without '&' and ';' — e.g. 'copy' for &copy;
   * The value must not contain '&' (to prevent recursive expansion).
   *
   * @param {string} key   — entity name, e.g. 'copy'
   * @param {string} value — replacement string, e.g. '©'
   */
  addEntity(key, value) {
    if (typeof key !== 'string' || key.includes('&') || key.includes(';')) {
      throw new ParseError(
        "Entity key must not contain '&' or ';'. E.g. use 'copy' for '&copy;'",
        ErrorCode.ENTITY_INVALID_KEY
      );
    }
    if (typeof value !== 'string' || value.includes('&')) {
      throw new ParseError(
        "Entity value must be a string and must not contain '&'",
        ErrorCode.ENTITY_INVALID_VALUE
      );
    }
    this._parser.addExternalEntity(key, value);
  }

  // -------------------------------------------------------------------------
  // DOCTYPE integration
  // -------------------------------------------------------------------------

  /**
   * Receive DOCTYPE entities from the output builder.
   *
   * Called automatically by BaseOutputBuilder.addInputEntities() once per
   * parse, immediately after the XML parser has read the DOCTYPE block.
   * Internally resets per-document expansion counters before loading the
   * new entity set — no separate reset step is required.
   *
   * @param {object} entities — raw entity map from DocTypeReader
   */
  addInputEntities(entities) {
    this._parser.addInputEntities(entities);
  }

  // -------------------------------------------------------------------------
  // ValueParser interface
  // -------------------------------------------------------------------------

  /**
   * @param {string} val
   * @param {object} [context] — { elementName, elementValue, elementType, matcher, isLeafNode }
   */
  parse(val, context) {
    if (typeof val !== 'string') return val;
    return this._parser.replaceEntitiesValue(val);
  }
}
