/**
 * Flex XML Parser — TypeScript Definitions
 */

export interface SkipOptions {
  /** Skip XML declaration `<?xml ... ?>` from output. Default: false */
  declaration?: boolean;
  /** Skip processing instructions (other than declaration) from output. Default: false */
  pi?: boolean;
  /** Skip all attributes from output. Default: true */
  attributes?: boolean;
  /** Exclude CDATA sections entirely from output. Default: false */
  cdata?: boolean;
  /** Exclude comments entirely from output. Default: false */
  comment?: boolean;
  /**
   * Strip namespace prefixes from tag and attribute names.
   * E.g. `ns:tag` → `tag`, `xmlns:*` attributes are dropped.
   * Default: false
   */
  nsPrefix?: boolean;
  /** (future) Tag-level filtering — not yet implemented. Default: false */
  tags?: boolean;
}

export interface NameForOptions {
  /**
   * Property name for mixed text content when a tag contains both text and child elements.
   * Default: '#text'
   */
  text?: string;
  /**
   * Property name for CDATA sections.
   * Empty string (default) merges CDATA content into the tag's text value.
   */
  cdata?: string;
  /**
   * Property name for XML comments.
   * Empty string (default) omits comments from output.
   * Set e.g. '#comment' to capture them.
   */
  comment?: string;
}

export interface AttributeOptions {
  /** Allow boolean (valueless) attributes — treated as `true`. Default: false */
  booleanType?: boolean;
  /** Group all attributes under this property name. Empty string = inline with tag. Default: '' */
  groupBy?: string;
  /** Prefix prepended to attribute names in output. Default: '@_' */
  prefix?: string;
  /** Suffix appended to attribute names in output. Default: '' */
  suffix?: string;
  /**
   * Value parser chain for attribute values.
   * Built-in names: 'replaceEntities', 'number', 'boolean', 'trim', 'currency'.
   * Default: ['replaceEntities', 'number', 'boolean']
   */
  valueParsers?: Array<string | ValueParser>;
}

export interface TagOptions {
  /** Tags that never have a closing tag (e.g. ['br', 'img', 'hr']). Default: [] */
  unpaired?: string[];
  /**
   * Tag paths whose content is captured raw without further parsing.
   * Supports path-expression-matcher syntax. Default: []
   */
  stopNodes?: string[];
  /**
   * Value parser chain for tag text content.
   * Built-in names: 'replaceEntities', 'boolean', 'number', 'trim', 'currency'.
   * Default: ['replaceEntities', 'boolean', 'number']
   * Add 'trim' to strip leading/trailing whitespace (not done by default).
   */
  valueParsers?: Array<string | ValueParser>;
  separateTextProperty?: boolean;
}

/**
 * A custom entity map: keys are entity names (without & and ;),
 * values are replacement strings.
 * @example { 'copy': '©', 'trade': '™' }
 */
export type EntityMap = Record<string, string>;

export interface EntityParseOptions {
  /**
   * Built-in XML entities: lt, gt, apos, quot, amp.
   *   true (default) → use built-in set
   *   false / null   → disable XML entity replacement entirely
   *   EntityMap      → use this custom map instead of the built-in set
   */
  default?: boolean | null | EntityMap;

  /**
   * HTML named entities: &nbsp;, &copy;, &reg;, numeric refs, etc.
   *   false / null (default) → disabled
   *   true                   → use built-in HTML entity set
   *   EntityMap              → use this custom map instead of the built-in set
   */
  html?: boolean | null | EntityMap;

  /**
   * Whether entities registered via `parser.addEntity()` are applied during replacement.
   * Entities are always stored regardless of this flag — it only controls application.
   *   true (default) → applied
   *   false / null   → stored but not applied (easy on/off without removing registrations)
   */
  external?: boolean | null;

  /**
   * Whether entities declared in a DOCTYPE internal subset are collected and applied.
   * The DOCTYPE block is always read to consume it; this flag controls entity storage.
   * Also requires 'replaceEntities' in valueParsers for replacement to happen.
   *   false / null (default) → entities discarded
   *   true                   → entities collected and applied during replacement
   */
  docType?: boolean | null;

  /**
   * Max number of entities that may be declared in a DOCTYPE internal subset.
   * Enforced by DocTypeReader at declaration time.
   * Default: 100
   */
  maxEntityCount?: number;

  /**
   * Max bytes per entity definition value in DOCTYPE.
   * Enforced by DocTypeReader at declaration time.
   * Default: 10000
   */
  maxEntitySize?: number;

  /**
   * Max total entity references expanded per document (across DOCTYPE, external, and built-in).
   * Enforced during value parsing. Protects against Billion Laughs style attacks.
   * Default: 1000
   */
  maxTotalExpansions?: number;

  /**
   * Max total characters added to output by entity expansion per document.
   * Enforced during value parsing.
   * Default: 100000
   */
  maxExpandedLength?: number;
}

export interface NumberParseOptions {
  /** Parse 0x... hex notation. Default: true */
  hex?: boolean;
  /** Treat strings with leading zeros as numbers ('007' → 7). Default: true */
  leadingZeros?: boolean;
  /** Parse scientific notation (1e5, 2.5E-3). Default: true */
  eNotation?: boolean;
  /** How to handle Infinity values. Default: 'original' */
  infinity?: 'original' | 'string' | 'number';
}

// ─── Error handling ────────────────────────────────────────────────────────────

/**
 * All error codes thrown by the parser.
 * Use with `instanceof ParseError` and `err.code === ErrorCode.XXX` for
 * precise error handling without string-matching against messages.
 */
export declare const ErrorCode: {
  // Input type errors
  readonly INVALID_INPUT: 'INVALID_INPUT';
  readonly INVALID_STREAM: 'INVALID_STREAM';

  // Streaming / feed API
  readonly ALREADY_STREAMING: 'ALREADY_STREAMING';
  readonly NOT_STREAMING: 'NOT_STREAMING';
  readonly DATA_MUST_BE_STRING: 'DATA_MUST_BE_STRING';

  // Tag structure
  readonly UNEXPECTED_END: 'UNEXPECTED_END';
  readonly UNEXPECTED_CLOSE_TAG: 'UNEXPECTED_CLOSE_TAG';
  readonly MISMATCHED_CLOSE_TAG: 'MISMATCHED_CLOSE_TAG';
  readonly UNEXPECTED_TRAILING_DATA: 'UNEXPECTED_TRAILING_DATA';
  readonly INVALID_TAG: 'INVALID_TAG';
  readonly UNCLOSED_QUOTE: 'UNCLOSED_QUOTE';

  // Namespace
  readonly MULTIPLE_NAMESPACES: 'MULTIPLE_NAMESPACES';

  // Security
  readonly SECURITY_PROTOTYPE_POLLUTION: 'SECURITY_PROTOTYPE_POLLUTION';
  readonly SECURITY_RESERVED_OPTION: 'SECURITY_RESERVED_OPTION';
  readonly SECURITY_RESTRICTED_NAME: 'SECURITY_RESTRICTED_NAME';

  // Limits (DoS prevention)
  readonly LIMIT_MAX_NESTED_TAGS: 'LIMIT_MAX_NESTED_TAGS';
  readonly LIMIT_MAX_ATTRIBUTES: 'LIMIT_MAX_ATTRIBUTES';

  // Entity limits
  readonly ENTITY_MAX_COUNT: 'ENTITY_MAX_COUNT';
  readonly ENTITY_MAX_SIZE: 'ENTITY_MAX_SIZE';
  readonly ENTITY_MAX_EXPANSIONS: 'ENTITY_MAX_EXPANSIONS';
  readonly ENTITY_MAX_EXPANDED_LENGTH: 'ENTITY_MAX_EXPANDED_LENGTH';

  // Entity registration
  readonly ENTITY_INVALID_KEY: 'ENTITY_INVALID_KEY';
  readonly ENTITY_INVALID_VALUE: 'ENTITY_INVALID_VALUE';
};

export type ErrorCodeValue = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Structured error class thrown by all parser error paths.
 *
 * Always catch with `instanceof ParseError` to distinguish library errors
 * from unexpected runtime errors:
 *
 * ```ts
 * try {
 *   parser.parse(xml);
 * } catch (e) {
 *   if (e instanceof ParseError) {
 *     console.error(e.code, e.line, e.col, e.message);
 *   } else {
 *     throw e; // unexpected runtime error
 *   }
 * }
 * ```
 */
export declare class ParseError extends Error {
  readonly name: 'ParseError';

  /** Machine-readable error code. Always one of the `ErrorCode` values. */
  readonly code: ErrorCodeValue;

  /**
   * 1-based line number where the error occurred.
   * `undefined` when position information is not available for this error type.
   */
  readonly line: number | undefined;

  /**
   * 1-based column where the error occurred.
   * `undefined` when position information is not available for this error type.
   */
  readonly col: number | undefined;

  /**
   * 0-based character offset from the start of the document.
   * `undefined` when position information is not available for this error type.
   */
  readonly index: number | undefined;

  constructor(
    message: string,
    code: ErrorCodeValue,
    position?: { line?: number; col?: number; index?: number }
  );

  /** Returns a formatted string: `ParseError [CODE] at line N, col M: message` */
  toString(): string;
}

// ─── Limits ────────────────────────────────────────────────────────────────────

/**
 * Structural limits that guard against resource-exhaustion and DoS attacks.
 * All properties default to `null` (no limit enforced).
 *
 * Errors thrown when limits are exceeded are always `ParseError` instances
 * with codes `LIMIT_MAX_NESTED_TAGS` or `LIMIT_MAX_ATTRIBUTES` respectively,
 * and carry `line`, `col`, and `index` position information.
 */
export interface LimitsOptions {
  /**
   * Maximum tag nesting depth.
   *
   * Throws `ParseError` with code `LIMIT_MAX_NESTED_TAGS` when a tag would
   * open at a depth greater than this value.
   *
   * Prevents stack-overflow attacks via pathologically deep XML such as
   * `<a><a><a>...</a></a></a>` (1 million levels deep).
   *
   * Must be a positive integer (`>= 1`) or `null`.
   * Default: `null` (unlimited)
   *
   * @example
   * // Reject XML deeper than 100 tags
   * new XMLParser({ limits: { maxNestedTags: 100 } });
   */
  maxNestedTags?: number | null;

  /**
   * Maximum number of attributes allowed on a single tag.
   *
   * Throws `ParseError` with code `LIMIT_MAX_ATTRIBUTES` when a tag has
   * more attributes than this value. Only enforced when `skip.attributes`
   * is `false` (attributes are being parsed).
   *
   * Prevents attacks that use thousands of attributes to exhaust memory or
   * CPU during attribute parsing.
   *
   * Must be a non-negative integer (`>= 0`) or `null`.
   * `0` means no attributes are permitted on any tag.
   * Default: `null` (unlimited)
   *
   * @example
   * // Reject any tag with more than 50 attributes
   * new XMLParser({ skip: { attributes: false }, limits: { maxAttributesPerTag: 50 } });
   */
  maxAttributesPerTag?: number | null;
}

/**
 * A value parser transforms a value in the parsing chain.
 * Receives the current value and an optional context object.
 */
export interface ValueParser {
  /**
   * @param val     Current value (string initially; may already be typed if earlier parsers ran)
   * @param context { tagName, isAttribute, attrName? }
   */
  parse(val: any, context?: { tagName: string; isAttribute: boolean; attrName?: string }): any;
}

/**
 * Buffer options for the feed()/end() and parseStream() input APIs.
 * Passed as `feedable` inside XMLParser options.
 */
export interface FeedableOptions {
  /**
   * Maximum number of characters allowed in the buffer at any one time.
   * Prevents memory exhaustion when data is fed faster than it is consumed.
   * Default: 10485760 (10 MB)
   */
  maxBufferSize?: number;

  /**
   * When true (default), already-processed characters are automatically
   * discarded from the buffer once the processed portion exceeds
   * flushThreshold.  Keeps memory usage flat for large documents.
   * Default: true
   */
  autoFlush?: boolean;

  /**
   * Number of processed characters that triggers an automatic flush.
   * Lower values free memory sooner at the cost of more string-slice
   * operations.  Default: 1024 (1 KB)
   */
  flushThreshold?: number;
}

export interface X2jOptions {
  // --- node-type controls ---
  /** Fine-grained control over which node types appear in output */
  skip?: SkipOptions;

  // --- property name mapping ---
  /** Property names used for special nodes in output */
  nameFor?: NameForOptions;

  // --- attribute controls ---
  /** Attribute parsing and representation options */
  attributes?: AttributeOptions;

  // --- tag controls ---
  /** Tag parsing options including stop nodes and value parser chain */
  tags?: TagOptions;

  // --- entity parsing ---
  /**
   * Controls which entity sources are active and security limits.
   * Entity replacement only happens when 'replaceEntities' is in the valueParsers chain.
   */
  entityParseOptions?: EntityParseOptions;

  // --- security ---
  /** Throw when a tag/attribute name collides with a nameFor.* or attributes.groupBy value. Default: false */
  strictReservedNames?: boolean;
  /** Custom handler for dangerous (non-critical) property names. Default: prefix with '__' */
  onDangerousProperty?: (name: string) => string;

  // --- filtering (path-expression-matcher) ---
  select?: string[];
  only?: string[];

  // --- number parsing ---
  numberParseOptions?: NumberParseOptions;

  // --- limits (DoS prevention) ---
  /**
   * Structural limits that guard against resource-exhaustion attacks.
   * All properties default to `null` (no limit enforced).
   *
   * ```ts
   * new XMLParser({
   *   limits: {
   *     maxNestedTags: 100,      // reject XML deeper than 100 levels
   *     maxAttributesPerTag: 50, // reject any tag with > 50 attributes
   *   }
   * });
   * ```
   */
  limits?: LimitsOptions | null;

  // --- feedable (feed/end and parseStream buffer options) ---
  /**
   * Buffer behaviour for the FeedableSource (feed/end API) and StreamSource
   * (parseStream API).  All properties have sensible defaults and only need
   * to be set when processing very large documents or operating under tight
   * memory constraints.
   */
  feedable?: FeedableOptions;

  // --- output builder ---
  /** Pluggable output builder instance. Default: JsObjBuilder */
  OutputBuilder?: OutputBuilderFactory | null;
}

export interface OutputBuilderFactory {
  getInstance(parserOptions: X2jOptions): OutputBuilderInstance;
  registerValueParser(name: string, parser: ValueParser): void;
}

export interface OutputBuilderInstance {
  addTag(tag: { name: string }, matcher: any): void;
  closeTag(matcher: any): void;
  addValue(text: string, matcher: any): void;
  addAttribute(name: string, value: any): void;
  addComment(text: string): void;
  addCdata(text: string): void;
  addDeclaration(): void;
  addPi(name: string): void;
  getOutput(): any;
  registeredParsers: Record<string, ValueParser>;
}

export default class XMLParser {
  /**
   * Create a new XMLParser.
   * @throws {ParseError} with code `INVALID_INPUT` or `SECURITY_RESERVED_OPTION`
   *   if any option value is invalid or contains a reserved property name.
   */
  constructor(options?: X2jOptions);

  /**
   * Parse an XML string or Buffer to a JavaScript object.
   * @throws {ParseError} on any well-formedness or limit violation.
   */
  parse(xmlData: string | Buffer): any;

  /**
   * Parse a Uint8Array / byte array to a JavaScript object.
   * @throws {ParseError} on any well-formedness or limit violation.
   */
  parseBytesArr(xmlData: Uint8Array | ArrayBufferView): any;

  /**
   * Parse an XML Node.js Readable stream and return a Promise that resolves
   * with the parsed JS object.
   *
   * Chunks are processed incrementally as they arrive — already-consumed input
   * is freed immediately, so memory stays proportional to the largest single
   * token rather than the total document size.
   *
   * @throws {ParseError} with code `INVALID_STREAM` if the argument is not a
   *   Node.js Readable stream.
   */
  parseStream(readable: NodeJS.ReadableStream): Promise<any>;

  /**
   * Feed an XML data chunk for incremental parsing.
   * Call `end()` when all chunks have been fed.
   * @throws {ParseError} with code `DATA_MUST_BE_STRING` if data is not a string or Buffer.
   */
  feed(data: string | Buffer): this;

  /**
   * Signal end of input and return the parsed result.
   * @throws {ParseError} with code `NOT_STREAMING` if called before any `feed()`.
   * @throws {ParseError} on any well-formedness or limit violation in the accumulated input.
   */
  end(): any;

  /**
   * Register a custom entity for replacement (without `&` and `;`).
   * Entities are always stored regardless of `entityParseOptions.external`.
   * The `external` flag controls whether they are applied during replacement.
   * @throws {ParseError} with code `ENTITY_INVALID_KEY` or `ENTITY_INVALID_VALUE`.
   * @example parser.addEntity('copy', '©');
   */
  addEntity(key: string, value: string): void;

  /**
   * Return structural errors collected during the last parse call.
   * Only populated when `autoClose.collectErrors` is `true`.
   * Each entry: `{ type, tag, expected, line, col, index }`
   */
  getParseErrors(): Array<{
    type: 'unclosed-eof' | 'mismatched-close' | 'phantom-close' | 'partial-tag';
    tag: string;
    expected?: string;
    line?: number;
    col?: number;
    index?: number;
  }>;
}

export { XMLParser };

export class JsObjBuilder implements OutputBuilderFactory {
  constructor(options?: Partial<X2jOptions>);
  getInstance(parserOptions: X2jOptions): OutputBuilderInstance;
  registerValueParser(name: string, parser: ValueParser): void;
}

export class JsArrBuilder implements OutputBuilderFactory {
  constructor(options?: Partial<X2jOptions>);
  getInstance(parserOptions: X2jOptions): OutputBuilderInstance;
  registerValueParser(name: string, parser: ValueParser): void;
}

export class JsMinArrBuilder implements OutputBuilderFactory {
  constructor(options?: Partial<X2jOptions>);
  getInstance(parserOptions: X2jOptions): OutputBuilderInstance;
  registerValueParser(name: string, parser: ValueParser): void;
}
