import { BaseOutputBuilderFactory } from "@nodable/base-output-builder"

/**
 * Flex XML Parser — TypeScript Definitions
 */

/**
 * Object form of a skip-tag entry — allows per-node control of nested depth
 * tracking and enclosure skipping when scanning for the closing tag.
 *
 * ```ts
 * import { xmlEnclosures } from '@nodable/flexible-xml-parser';
 *
 * const parser = new XMLParser({
 *   skip: {
 *     tags: [
 *       "..secret",
 *       { expression: "root.internal", nested: true, skipEnclosures: [...xmlEnclosures] },
 *     ]
 *   }
 * });
 * ```
 */
export interface SkipTagEntry {
  /** Path expression (same syntax as string skip-tag entries). */
  expression: string;
  /**
   * When true, nested same-name open tags are tracked and the skip ends only
   * when the outermost closing tag is found. Default: false.
   */
  nested?: boolean;
  /**
   * Enclosure pairs to skip while scanning for the closing tag.
   * Checked in array order — first open match wins.
   * Defaults to `[]` (plain first-match, no enclosure awareness).
   */
  skipEnclosures?: Enclosure[];
}

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
  /**
   * Tag paths whose entire subtree is silently dropped from output.
   * The parser advances past the closing tag using the same raw-collection
   * mechanism as stop nodes, then discards the content without calling
   * any output builder methods.
   *
   * Each entry is either:
   *   - A plain string path expression — equivalent to `{ expression, nested: false, skipEnclosures: [] }`.
   *     The very first `</tagName>` ends collection.
   *   - A `SkipTagEntry` object with optional `nested` and `skipEnclosures`.
   *
   * Supports path-expression-matcher syntax. Default: []
   *
   * @example
   * import { xmlEnclosures } from '@nodable/flexible-xml-parser';
   *
   * skip: {
   *   tags: [
   *     "..secret",
   *     { expression: "root.internal", nested: true, skipEnclosures: [...xmlEnclosures] },
   *   ]
   * }
   */
  tags?: Array<string | SkipTagEntry>;
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
}

/**
 * An open/close pair that defines a region the stop-node processor should skip
 * when scanning for the closing tag. Anything between `open` and `close` is
 * treated as opaque text — closing-tag detection and depth tracking are
 * suspended until `close` is found.
 *
 * @example
 * { open: '<!--', close: '-->' }   // XML comment
 * { open: '"',    close: '"'  }    // double-quoted string
 */
export interface Enclosure {
  open: string;
  close: string;
}

/**
 * Object form of a stop-node entry — allows per-node control of which
 * enclosures the processor should skip when scanning for the closing tag.
 *
 * ```ts
 * import { xmlEnclosures, quoteEnclosures } from '@nodable/flexible-xml-parser';
 *
 * const parser = new XMLParser({
 *   tags: {
 *     stopNodes: [
 *       "..script",                                              // plain — no enclosures
 *       { expression: "body..pre",   skipEnclosures: [...xmlEnclosures] },
 *       { expression: "head..style", skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] },
 *     ]
 *   }
 * });
 * ```
 */
export interface StopNodeEntry {
  /** Path expression (same syntax as string stop-node entries). */
  expression: string;
  /**
   * When true, nested same-name open tags are tracked and the stop node ends
   * only when the outermost closing tag is found. Default: false.
   */
  nested?: boolean;
  /**
   * Enclosure pairs to skip while scanning for the closing tag.
   * Checked in array order — first open match wins.
   * Defaults to `[]` (plain first-match, no depth tracking).
   */
  skipEnclosures: Enclosure[];
}

export interface TagOptions {
  /** Tags that never have a closing tag (e.g. ['br', 'img', 'hr']). Default: [] */
  unpaired?: string[];
  /**
   * Tag paths whose content is captured raw without further XML parsing.
   *
   * Each entry is either:
   *   - A plain string path expression — equivalent to `{ expression, skipEnclosures: [] }`.
   *     The very first `</tagName>` ends collection (no depth tracking, no enclosure skipping).
   *   - A `StopNodeEntry` object with an explicit `skipEnclosures` array.
   *     When `skipEnclosures` is non-empty, depth tracking is enabled and anything
   *     between an enclosure's open/close markers is skipped (so false closing tags
   *     inside comments, CDATA, string literals, etc. are ignored).
   *
   * Supports path-expression-matcher syntax. Default: []
   *
   * @example
   * import { xmlEnclosures, quoteEnclosures } from '@nodable/flexible-xml-parser';
   *
   * stopNodes: [
   *   "..script",                                              // plain
   *   { expression: "body..pre",   skipEnclosures: [...xmlEnclosures] },
   *   { expression: "head..style", skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] },
   * ]
   */
  stopNodes?: Array<string | StopNodeEntry>;
}

/**
 * Options for DOCTYPE reading — controls whether entities are collected
 * and enforces read-time security limits.
 */
export interface DoctypeOptions {
  /**
   * Whether to collect entities declared in the DOCTYPE internal subset and
   * forward them to the output builder for replacement.
   * The DOCTYPE block is always read to consume it; this flag controls forwarding.
   */
  enabled?: boolean;

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

  // --- DOCTYPE parsing ---
  /**
   * Controls whether DOCTYPE entities are collected and read-time security limits.
   * Once collected will be passed to Output builder to take any decision
   */
  doctypeOptions?: DoctypeOptions;

  // --- security ---
  /** Throw when a tag/attribute name collides with a nameFor.* or attributes.groupBy value. Default: false */
  strictReservedNames?: boolean;
  /** Custom handler for dangerous (non-critical) property names. Default: prefix with '__' */
  onDangerousProperty?: (name: string) => string;

  // --- filtering (path-expression-matcher) ---
  select?: string[];
  only?: string[];

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
  /** Pluggable output builder instance. Default: CompactObjBuilder */
  OutputBuilder?: BaseOutputBuilderFactory;

  /**
   * Callback fired by `NodeTreeBuilder` and `CompactObjBuilder` whenever a stop node
   * is fully collected, before the raw content is added to the output tree.
   *
   * Receive the tag detail, the raw unparsed content, and a read-only path
   * matcher. Useful for side-channel analysis (e.g. extracting script content
   * from HTML) without having to post-process the output tree.
   *
   * The callback is informational — return value is ignored. To suppress the
   * node from output, use a custom OutputBuilder subclass instead.
   *
   * @param tagDetail  - `{ name, line, col, index }` of the stop-node opening tag.
   * @param rawContent - Raw text content between the opening and closing tags.
   * @param matcher    - Read-only path matcher positioned at the stop node.
   *
   * @example
   * const scripts: string[] = [];
   * const parser = new XMLParser({
   *   tags: { stopNodes: ["..script"] },
   *   onStopNode(tagDetail, rawContent, matcher) {
   *     scripts.push(rawContent);
   *   }
   * });
   */
  onStopNode?: (
    tagDetail: { name: string; line: number; col: number; index: number },
    rawContent: string,
    matcher: any,
  ) => void;

  /**
   * Predicate evaluated after each non-self-closing, non-stop, non-skip opening
   * tag is pushed onto the parser stack.  When the function returns `true` the
   * parser immediately stops reading further input and returns a partial-but-
   * consistent output object.
   *
   * At the moment of evaluation the read-only `matcher` is positioned at the
   * tag that triggered the exit.  All tags that were open before it are cleanly
   * closed (innermost first) so the output builder can finalise its tree.
   * The output builder's `onExit()` method is then called with the exit context.
   *
   * No error is thrown — the normal return value of `parse()` / `feed()+end()`
   * / `parseStream()` is returned as usual.
   *
   * Must be a function.  Passing any other truthy value raises a `ParseError`
   * with code `INVALID_INPUT` at construction time.
   *
   * @param matcher - Read-only path matcher positioned at the triggering tag.
   * @returns `true` to stop parsing now; any other value to continue.
   *
   * @example
   * // Stop after the first <item> whose @id attribute equals 'stop-here'
   * const parser = new XMLParser({
   *   skip: { attributes: false },
   *   exitIf(matcher) {
   *     return matcher.getTagName() === 'item' &&
   *            matcher.getAttribute('@_id') === 'stop-here';
   *   },
   * });
   */
  exitIf?: ((matcher: any) => boolean) | null;
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

  /**
   * Returns `true` if the last parse call was terminated early by `exitIf`.
   * Returns `false` when `exitIf` never fired or the feature is not configured.
   */
  wasExited: boolean;
}

export { XMLParser };


// ─── Stop-node utilities ───────────────────────────────────────────────────────

/**
 * XML structural enclosures — comments, CDATA sections, processing instructions.
 *
 * Use in `skipEnclosures` to prevent false closing-tag matches inside these
 * XML constructs:
 *
 * ```ts
 * { expression: "body..pre", skipEnclosures: [...xmlEnclosures] }
 * ```
 */
export declare const xmlEnclosures: ReadonlyArray<Enclosure>;

/**
 * String-literal enclosures — single-quote, double-quote, and template literals.
 *
 * Use in `skipEnclosures` for stop nodes that contain JS or CSS source code
 * where closing tags might appear inside string literals:
 *
 * ```ts
 * { expression: "head..style", skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] }
 * ```
 */
export declare const quoteEnclosures: ReadonlyArray<Enclosure>;