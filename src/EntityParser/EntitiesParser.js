// ---------------------------------------------------------------------------
// Built-in entity tables
// ---------------------------------------------------------------------------
import { ParseError, ErrorCode } from '../ParseError.js';

/** Standard XML entities — always replaced last so they cannot be overridden by DOCTYPE. */
const defaultXmlEntities = {
  "apos": { regex: /&(apos|#39|#x27);/g, val: "'" },
  "gt": { regex: /&(gt|#62|#x3E);/g, val: ">" },
  "lt": { regex: /&(lt|#60|#x3C);/g, val: "<" },
  "quot": { regex: /&(quot|#34|#x22);/g, val: "\"" },
};

/** &amp; is always expanded last so it never double-expands other entities. */
const ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" };

/** Built-in HTML named entities (superset of XML defaults). */
const defaultHtmlEntities = {
  "space": { regex: /&(nbsp|#160);/g, val: "\u00a0" },
  "cent": { regex: /&(cent|#162);/g, val: "\u00a2" },
  "pound": { regex: /&(pound|#163);/g, val: "\u00a3" },
  "yen": { regex: /&(yen|#165);/g, val: "\u00a5" },
  "euro": { regex: /&(euro|#8364);/g, val: "\u20ac" },
  "copy": { regex: /&(copy|#169);/g, val: "\u00a9" },
  "reg": { regex: /&(reg|#174);/g, val: "\u00ae" },
  "inr": { regex: /&(inr|#8377);/g, val: "\u20b9" },
  "num_dec": { regex: /&#([0-9]{1,7});/g, val: (_, s) => String.fromCodePoint(Number.parseInt(s, 10)) },
  "num_hex": { regex: /&#x([0-9a-fA-F]{1,6});/g, val: (_, s) => String.fromCodePoint(Number.parseInt(s, 16)) },
};

// ---------------------------------------------------------------------------
// EntitiesParser
// ---------------------------------------------------------------------------

/**
 * Holds all entity tables and performs entity replacement.
 *
 * Controlled entirely by the options passed to the constructor:
 *
 *   default  — true  → use built-in XML entities (lt/gt/apos/quot/amp)
 *              false/null → disable XML entity replacement
 *              object → use this custom map instead of the built-in set
 *
 *   html     — true  → use built-in HTML named entities
 *              false/null → disable HTML entity replacement (default)
 *              object → use this custom map instead of the built-in set
 *
 *   external — true (default) → apply entities added via addExternalEntity()
 *              false/null → entities are stored but NOT applied during replacement
 *
 * Security limits enforced during replaceEntitiesValue():
 *   maxTotalExpansions  — max total entity references expanded per document (0 = unlimited)
 *   maxExpandedLength   — max total characters added by expansion per document (0 = unlimited)
 *
 * Read-time limits (maxEntityCount, maxEntitySize) are enforced by DocTypeReader
 * using doctypeOptions on the XML parser — they are not part of this class.
 */
export default class EntitiesParser {
  constructor(options = {}) {
    // Resolve entity tables
    this.xmlEntities = resolveEntityTable(options.default, defaultXmlEntities);
    this.htmlEntities = resolveEntityTable(options.html, defaultHtmlEntities);
    this.applyExternal = options.external !== false && options.external !== null;

    // Replacement-time security limits (0 = unlimited)
    this.maxTotalExpansions = options.maxTotalExpansions || 0;
    this.maxExpandedLength = options.maxExpandedLength || 0;

    // Per-document counters — reset automatically in addInputEntities()
    this.totalExpansions = 0;
    this.expandedLength = 0;

    // Entity stores — null-prototype maps so entity names cannot shadow Object.prototype
    this.docTypeEntities = Object.create(null);
    this.externalEntities = Object.create(null);
  }

  // -------------------------------------------------------------------------
  // Entity registration
  // -------------------------------------------------------------------------

  addExternalEntities(map) {
    for (const key of Object.keys(map)) {
      this.addExternalEntity(key, map[key]);
    }
  }

  addExternalEntity(key, val) {
    validateEntityName(key);
    if (val.indexOf("&") !== -1) {
      // Silently skip — values containing '&' would cause recursive expansion
      return;
    }
    const escaped = key.replace(/[.\-+*:]/g, '\\$&');
    this.externalEntities[key] = {
      regex: new RegExp("&" + escaped + ";", "g"),
      val,
    };
  }

  /**
   * Store entities collected from DOCTYPE and reset per-document counters.
   *
   * Called by the output builder's addInputEntities() at the start of each
   * parse. Resetting here is intentional — it ties the counter reset directly
   * to the moment new document data arrives, without needing a separate
   * resetCounters() call from the outside.
   *
   * Accepts { regx, val } objects (from DocTypeReader) or plain strings.
   */
  addInputEntities(entities) {
    // Reset per-document counters for the new parse
    this.totalExpansions = 0;
    this.expandedLength = 0;
    this.docTypeEntities = Object.create(null);

    for (const ent of Object.keys(entities)) {
      const raw = entities[ent];
      if (typeof raw === 'object' && raw !== null && raw.val !== undefined) {
        this.docTypeEntities[ent] = { regex: raw.regx, val: raw.val };
      } else {
        const escaped = ent.replace(/[.\-+*:]/g, '\\$&');
        this.docTypeEntities[ent] = {
          regex: new RegExp("&" + escaped + ";", "g"),
          val: raw,
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // Replacement
  // -------------------------------------------------------------------------

  parse(val) {
    return this.replaceEntitiesValue(val);
  }

  /**
   * Replacement order:
   *   1. DOCTYPE entities  (only if docTypeEntities is populated)
   *   2. External entities (only if applyExternal is true)
   *   3. Built-in XML entities (lt/gt/apos/quot) — unless disabled via default: false
   *   4. HTML named entities — if enabled via html: true or custom map
   *   5. &amp; — always last to avoid double-expansion
   */
  replaceEntitiesValue(val) {
    if (typeof val !== 'string' || val.length === 0) return val;
    if (val.indexOf('&') === -1) return val; // fast exit

    // 1. DOCTYPE entities (tracked for security limits)
    if (Object.keys(this.docTypeEntities).length > 0) {
      val = this._applyTable(val, this.docTypeEntities, true);
    }

    // 2. External entities (tracked for security limits)
    if (this.applyExternal) {
      val = this._applyTable(val, this.externalEntities, true);
    }

    // 3. Built-in XML entities
    if (this.xmlEntities) {
      val = this._applyTable(val, this.xmlEntities, false);
    }

    // 4. HTML entities
    if (this.htmlEntities) {
      val = this._applyTable(val, this.htmlEntities, false);
    }

    // 5. &amp; always last
    val = val.replace(ampEntity.regex, ampEntity.val);

    return val;
  }

  /**
   * Apply one entity table to val.
   * @param {string}  val
   * @param {object}  table            — map of { name: { regex, val } }
   * @param {boolean} trackExpansions  — enforce security counters for this table
   */
  _applyTable(val, table, trackExpansions) {
    for (const name of Object.keys(table)) {
      if (val.indexOf('&') === -1) break; // fast exit

      const entity = table[name];

      if (trackExpansions && (this.maxTotalExpansions || this.maxExpandedLength)) {
        const matches = val.match(entity.regex);
        if (matches) {
          // Check expansion count
          this.totalExpansions += matches.length;
          if (this.maxTotalExpansions && this.totalExpansions > this.maxTotalExpansions) {
            throw new ParseError(
              `Entity expansion limit exceeded: ${this.totalExpansions} > ${this.maxTotalExpansions}`,
              ErrorCode.ENTITY_MAX_EXPANSIONS
            );
          }

          // Check expanded length
          if (this.maxExpandedLength) {
            const before = val.length;
            val = val.replace(entity.regex, entity.val);
            this.expandedLength += Math.max(0, val.length - before);
            if (this.expandedLength > this.maxExpandedLength) {
              throw new ParseError(
                `Total expanded content length exceeded: ${this.expandedLength} > ${this.maxExpandedLength}`,
                ErrorCode.ENTITY_MAX_EXPANDED_LENGTH
              );
            }
            continue; // already replaced above
          }
        }
      }

      val = val.replace(entity.regex, entity.val);
    }
    return val;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an entity table option value:
 *   undefined/true  → use the built-in default table
 *   false/null      → disabled (returns null)
 *   object          → use as the table directly
 */
function resolveEntityTable(option, builtIn, defaultEnabled) {
  if (option === false || option === null) return null;
  if (option === true) return builtIn;
  if (option === undefined) return defaultEnabled ? builtIn : null; // respects per-option default
  return option;
}

// Entity names must not contain regex special characters
const specialChar = "!?\\\\/[]$%{}^&*()<>|+";

function validateEntityName(name) {
  for (let i = 0; i < specialChar.length; i++) {
    const ch = specialChar[i];
    if (name.indexOf(ch) !== -1) {
      throw new ParseError(`Invalid character '${ch}' in entity name`, ErrorCode.ENTITY_INVALID_KEY);
    }
  }
  return name;
}

export { defaultXmlEntities, defaultHtmlEntities };
