import JsObjOutputBuilder from './OutputBuilders/CompactObjBuilder.js';
import { Expression } from 'path-expression-matcher';
import { ParseError, ErrorCode } from './ParseError.js';
import { DANGEROUS_PROPERTY_NAMES, criticalProperties } from './util.js';

const defaultOnDangerousProperty = (name) => {
  if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return "__" + name;
  }
  return name;
};

export const defaultOptions = {
  // --- skip group ---
  // Controls which node types are excluded from output
  skip: {
    declaration: false,   // Skip <?xml ... ?> declaration
    pi: false,            // Skip processing instructions (other than declaration)
    attributes: true,     // Skip all attributes
    cdata: false,         // Exclude CDATA sections from output entirely
    comment: false,       // Exclude comments from output entirely
    nsPrefix: false,      // Strip namespace prefixes (e.g. ns:tag → tag)
    tags: false,          // (future) tag-level filtering — not yet implemented
  },

  // --- nameFor group ---
  // Property names used when including special nodes in output.
  nameFor: {
    text: '#text',  // Property for mixed text content
    cdata: '',      // '' = merge CDATA into text value
    comment: '',    // '' = omit comments from output
  },

  // --- attributes group ---
  attributes: {
    booleanType: false,  // Allow valueless attributes (treated as boolean true)
    groupBy: '',         // Group all attributes under this key; '' = inline with tag
    prefix: '@_',        // Prepended to attribute names in output
    suffix: '',          // Appended to attribute names in output
  },

  // --- tags group ---
  tags: {
    unpaired: [],     // Tags that never have a closing tag (e.g. br, img, hr)
    stopNodes: [],    // Tag paths whose content is captured raw without parsing
  },

  // --- security ---
  strictReservedNames: false,
  onDangerousProperty: defaultOnDangerousProperty,

  // --- filtering (path-expression-matcher) ---
  only: [], // for future

  // --- DOCTYPE parsing ---
  // Controls whether DOCTYPE entities are collected and read-time security limits.
  //
  //   enabled         — false (default) → DOCTYPE is read (to consume it) but entities
  //                                        are discarded and never forwarded to output builders
  //                     true → collect DOCTYPE entities and forward them to the output builder
  //                     Note: the output builder must have an EntitiesValueParser registered
  //                     under 'entity' and 'entity' must be in its
  //                     valueParsers chain for replacement to actually happen.
  //
  // Read-time security limits (enforced by DocTypeReader at declaration time):
  //   maxEntityCount  — max entities declared in a DOCTYPE (default: 100)
  //   maxEntitySize   — max bytes per entity definition value (default: 10000)
  //
  // Replacement-time limits (maxTotalExpansions, maxExpandedLength) are configured
  // on EntitiesValueParser directly — they are not part of doctypeOptions.
  doctypeOptions: {
    enabled: false,
    maxEntityCount: 100,
    maxEntitySize: 10000,
  },

  // --- autoClose ---
  // Controls parser behaviour when tags are unclosed or mismatched.
  //
  //   onEof       — what to do when EOF is reached with open tags still on the stack
  //                 'throw'    (default) → throw an error
  //                 'closeAll' → silently close all remaining open tags
  //
  //   onMismatch  — what to do when a closing tag doesn't match the current open tag
  //                 'throw'   (default) → throw an error
  //                 'recover' → pop the stack toward the nearest matching opener;
  //                             if no match is found the tag is discarded
  //                 'discard' → silently ignore the bad closing tag
  //
  //   collectErrors — when true, errors are recorded in result.__parseErrors instead
  //                   of being silently dropped.  Each entry has the shape:
  //                   { type, tag, expected, line, col, index }
  //
  // Shorthand: autoClose: 'html' sets onEof:'closeAll', onMismatch:'discard',
  // collectErrors:true, and adds the standard HTML void elements to tags.unpaired.
  autoClose: null,   // null = feature disabled; throws on any malformed input

  // --- limits (DoS prevention) ---
  // Group structural limits that guard against resource exhaustion.
  //
  //   maxNestedTags     — maximum tag nesting depth; throws when exceeded.
  //                       Prevents stack-overflow attacks via deeply nested XML.
  //                       Default: null (no limit)
  //
  //   maxAttributesPerTag — maximum number of attributes on a single tag.
  //                         Throws when a tag exceeds this count.
  //                         Default: null (no limit)
  //
  limits: {
    maxNestedTags: null,
    maxAttributesPerTag: null,
  },

  // --- feedable (feed/end and parseStream input options) ---
  // Controls buffer behaviour for the FeedableSource and StreamSource.
  //
  //   maxBufferSize  — maximum number of characters allowed in the buffer at
  //                    any one time.  Prevents memory exhaustion when a caller
  //                    feeds data faster than it is consumed.
  //                    Default: 10 MB (10 * 1024 * 1024 characters)
  //
  //   autoFlush      — when true (default), already-processed characters are
  //                    automatically discarded from the front of the buffer
  //                    whenever the processed portion exceeds flushThreshold.
  //                    Keeps memory usage flat for large documents.
  //
  //   flushThreshold — number of processed characters that triggers an auto-
  //                    flush.  Lower values free memory sooner but incur more
  //                    string-slice operations.  Default: 1024 characters (1 KB)
  //
  feedable: {
    maxBufferSize: 10 * 1024 * 1024,
    autoFlush: true,
    flushThreshold: 1024,
  },

  // --- output ---
  OutputBuilder: null, //TODO: accept lower case
};

// All names that should never appear as property keys
const ALL_RESERVED = new Set([...criticalProperties, ...DANGEROUS_PROPERTY_NAMES]);
export { ALL_RESERVED as RESERVED_JS_NAMES };

function validatePropertyName(value, optionName) {
  if (typeof value !== 'string' || value === '') return;
  if (ALL_RESERVED.has(value)) {
    throw new ParseError(
      `SECURITY: '${value}' is a reserved JavaScript keyword and cannot be used as ${optionName}`,
      ErrorCode.SECURITY_RESERVED_OPTION
    );
  }
}

export const buildOptions = function (options) {
  // Validate security-sensitive option values BEFORE merging
  if (options) {
    if (options.nameFor?.text) validatePropertyName(options.nameFor.text, 'nameFor.text');
    if (options.nameFor?.cdata) validatePropertyName(options.nameFor.cdata, 'nameFor.cdata');
    if (options.nameFor?.comment) validatePropertyName(options.nameFor.comment, 'nameFor.comment');
    if (options.attributes?.prefix) validatePropertyName(options.attributes.prefix, 'attributes.prefix');
    if (options.attributes?.groupBy) validatePropertyName(options.attributes.groupBy, 'attributes.groupBy');

    // Validate limits option
    if (options.limits !== undefined && options.limits !== null) {
      if (typeof options.limits !== 'object') {
        throw new ParseError(`'limits' must be an object, got ${typeof options.limits}`, ErrorCode.INVALID_INPUT);
      }
      const { maxNestedTags, maxAttributesPerTag } = options.limits;
      if (maxNestedTags !== undefined && maxNestedTags !== null &&
        (typeof maxNestedTags !== 'number' || !Number.isInteger(maxNestedTags) || maxNestedTags < 1)) {
        throw new ParseError(`'limits.maxNestedTags' must be a positive integer, got ${maxNestedTags}`, ErrorCode.INVALID_INPUT);
      }
      if (maxAttributesPerTag !== undefined && maxAttributesPerTag !== null &&
        (typeof maxAttributesPerTag !== 'number' || !Number.isInteger(maxAttributesPerTag) || maxAttributesPerTag < 0)) {
        throw new ParseError(`'limits.maxAttributesPerTag' must be a non-negative integer, got ${maxAttributesPerTag}`, ErrorCode.INVALID_INPUT);
      }
    }
  }

  const finalOptions = deepClone(defaultOptions);

  if (options) {
    copyProperties(finalOptions, options);
  }

  if (!finalOptions.OutputBuilder) {
    finalOptions.OutputBuilder = new JsObjOutputBuilder();
  }

  // Normalize stopNodes entries into { expression, nested, skipEnclosures } objects.
  //
  // Accepted forms:
  //   "..script"
  //     → { expression: "..script", nested: false, skipEnclosures: [] }
  //
  //   Expression instance
  //     → { expression: Expression, nested: false, skipEnclosures: [] }
  //
  //   { expression: "..script", nested?: boolean, skipEnclosures?: [] }
  //     → { expression: "..script", nested: boolean, skipEnclosures: [...] }
  //
  //   { expression: Expression, nested?: boolean, skipEnclosures?: [] }
  //     → { expression: Expression, nested: boolean, skipEnclosures: [...] }
  //
  // `nested` defaults to false; `skipEnclosures` defaults to [].
  // The two flags are fully independent — any combination is valid.
  if (Array.isArray(finalOptions.tags?.stopNodes)) {
    finalOptions.tags.stopNodes = finalOptions.tags.stopNodes.map((entry) => {
      // Case 1: plain string shorthand
      if (typeof entry === 'string') {
        return { expression: entry, nested: false, skipEnclosures: [] };
      }

      // Case 2: object form
      if (entry && typeof entry === 'object') {
        // Case 2a: bare Expression instance — no extra options
        if (entry instanceof Expression) {
          return { expression: entry, nested: false, skipEnclosures: [] };
        }

        // Case 2b: config object { expression, nested?, skipEnclosures? }
        if (entry.expression !== undefined) {
          return {
            expression: entry.expression,
            nested: entry.nested === true,
            skipEnclosures: Array.isArray(entry.skipEnclosures) ? entry.skipEnclosures : [],
          };
        }

        throw new ParseError(
          "Each stopNodes object entry must have an 'expression' property or be an Expression instance.",
          ErrorCode.INVALID_INPUT,
        );
      }

      throw new ParseError(
        `Invalid stopNodes entry: expected a string, Expression, or { expression, nested?, skipEnclosures? } object.`,
        ErrorCode.INVALID_INPUT,
      );
    });
  }

  if (finalOptions.onDangerousProperty === null) {
    finalOptions.onDangerousProperty = defaultOnDangerousProperty;
  }

  // Resolve autoClose: expand the 'html' preset and normalise to an object
  finalOptions.autoClose = resolveAutoClose(finalOptions.autoClose, finalOptions);

  return finalOptions;
};

/** Standard HTML void elements — never have a closing tag. */
const HTML_VOID_ELEMENTS = [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
];

/**
 * Normalise the raw `autoClose` option value into either null (disabled)
 * or a fully-resolved options object.
 *
 * @param {null|string|object} raw   - Value supplied by the user
 * @param {object}             opts  - The already-merged final options (mutated for html preset)
 * @returns {null|object}
 */
function resolveAutoClose(raw, opts) {
  if (!raw) return null;

  if (raw === 'html') {
    // Apply HTML-specific tag defaults
    const existingUnpaired = opts.tags.unpaired || [];
    const merged = [...new Set([...existingUnpaired, ...HTML_VOID_ELEMENTS])];
    opts.tags = { ...opts.tags, unpaired: merged };

    return {
      onEof: 'closeAll',
      onMismatch: 'discard',
      collectErrors: true,
    };
  }

  if (typeof raw === 'string') {
    // e.g. autoClose: 'closeAll' — treat as shorthand for onEof
    return {
      onEof: raw,
      onMismatch: 'throw',
      collectErrors: false,
    };
  }

  if (typeof raw === 'object') {
    return {
      onEof: raw.onEof || 'throw',
      onMismatch: raw.onMismatch || 'throw',
      collectErrors: raw.collectErrors || false,
    };
  }

  return null;
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  if (obj instanceof RegExp) return obj;   // ← guard
  const clone = {};
  for (const key of Object.keys(obj)) {
    clone[key] = typeof obj[key] === 'function' ? obj[key] : deepClone(obj[key]);
  }
  return clone;
}

function copyProperties(target, source) {
  for (const key of Object.keys(source)) {
    // Guard against prototype pollution via option keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    if (key === 'OutputBuilder') {
      target[key] = source[key];
    } else if (typeof source[key] === 'function') {
      target[key] = source[key];
    } else if (source[key] instanceof RegExp) {   // ← guard, before the generic object check
      target[key] = source[key];
    } else if (Array.isArray(source[key])) {
      target[key] = source[key];
    } else if (typeof source[key] === 'object' && source[key] !== null) {
      if (typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      copyProperties(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}