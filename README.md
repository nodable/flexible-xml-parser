# @nodable/flexible-xml-parser

A high-performance, flexible XML parser in pure javascript for Node.js and browsers with pluggable output builders, composable value parsers, and multiple input modes.

> From the creater of fast-xml-parser

## Benefits over fast-xml-parser?

| Feature | fast-xml-parser | flexible-xml-parser |
|---|---|---|
| Output format | Fixed JS object | Pluggable (compact, sequential, node-tree, custom) |
| Value parsing | Inline options | Separate, composable pipeline per output builder |
| Value parsers for tags vs attrs | Single config | Independent chains |
| Input modes | String / Buffer | String, Buffer, Uint8Array, Stream, Feed/End |
| Stop node enclosures | Limited | Per-node `skipEnclosures` control |
| Exit | After complete processing  | Allow partial parsing |
| Lenient HTML mode | No | `autoClose` with error collection |
| Custom output | No | Extend `BaseOutputBuilder` |

The core parser is intentionally minimal. Options like `transformTagName`, `alwaysArray`, `forceTextNode`, and value parser configuration live in the **output builder**, not in `XMLParser`. This keeps the parser lean and lets you mix builders without changing your parsing code.

### Performance

fast-xml-parser doesn't support streams, while flexible-xml-parser does. This makes flexible-xml-parser more memory efficient for large XML files.

Additionally, flexible-xml-parser is considerably faster than fast-xml-parser. Checkout [benchmarks](https://github.com/nodable/flexible-xml-parser) for more details.

## Package Ecosystem

`@nodable/flexible-xml-parser` is the core parser. Output builders are published separately so you only install what you need:

| Package | Description |
|---|---|
| `@nodable/flexible-xml-parser` | Core parser (this package) |
| `@nodable/base-output-builder` | Base class + value parsers (`ElementType`, entity parsers) |
| `@nodable/compact-builder` | Default JS-object output (like fast-xml-parser) |
| `@nodable/sequential-builder` | Ordered key-value array output |
| `@nodable/sequential-stream-builder` | Sequential builder with streaming output |
| `@nodable/node-tree-builder` | Uniform AST-style node tree |

## Installation

```bash
npm install @nodable/flexible-xml-parser @nodable/compact-builder
```

Install additional builders only as needed.

## Quick Start

```javascript
import XMLParser from '@nodable/flexible-xml-parser';
import { CompactBuilderFactory } from '@nodable/compact-builder';

// Default output (uses CompactBuilder internally)
const parser = new XMLParser();
const result = parser.parse('<root><count>3</count><active>true</active></root>');
// { root: { count: 3, active: true } }

// With attributes
const parser2 = new XMLParser({ skip: { attributes: false } });
parser2.parse('<item id="1">hello</item>');
// { item: { '@_id': 1, '#text': 'hello' } }
```

## Options

All options are optional. Pass only what you need.

```javascript
new XMLParser({
  // What to skip
  skip: {
    attributes:  true,   // Skip all attributes
    declaration: false,  // Skip <?xml ...?> declaration
    pi:          false,  // Skip <?...?> processing instructions
    cdata:       false,  // Exclude CDATA from output entirely
    comment:     false,  // Exclude comments from output entirely
    nsPrefix:    false,  // Strip namespace prefixes (ns:tag → tag)
    tags:        [],     // Tag paths to drop silently from output
  },

  // Property names for special nodes
  nameFor: {
    text:    '#text',  // mixed-content text property
    cdata:   '',       // '' = merge into text; '#cdata' = separate key
    comment: '',       // '' = omit; '#comment' = capture
  },

  // Attribute representation
  attributes: {
    prefix:      '@_',
    suffix:      '',
    groupBy:     '',     // group all attributes under this key; '' = inline
    booleanType: false,  // allow valueless attributes (treated as true)
  },

  // Tag options
  tags: {
    unpaired:  [],  // self-closing tags without / (e.g. ['br', 'img'])
    stopNodes: [],  // paths whose content is captured raw (see docs/04-stop-nodes.md)
  },

  // DoS prevention
  limits: {
    maxNestedTags:       null,
    maxAttributesPerTag: null,
  },

  // DOCTYPE entity expansion
  doctypeOptions: {
    enabled:        false,
    maxEntityCount: 100,
    maxEntitySize:  10000,
  },

  // Security
  strictReservedNames:   false,
  onDangerousProperty:   defaultOnDangerousProperty,

  // Stop parsing early based on a condition
  exitIf: null,

  // Buffer settings for feed/stream modes
  feedable: {
    maxBufferSize:  10 * 1024 * 1024,
    autoFlush:      true,
    flushThreshold: 1024,
  },

  // Lenient HTML-mode recovery
  autoClose: null,  // null = strict; 'html' = recover from unclosed/mismatched tags

  // Pluggable output builder
  OutputBuilder: null,  // default: CompactBuilder
});
```

## Value Parsers

Value parsers are configured on the **output builder**, not on `XMLParser`. This lets you set independent pipelines for tag text and attribute values.

Built-in parsers: `'entity'`, `'number'`, `'boolean'`, `'trim'`, `'currency'`.

```javascript
import { CompactBuilderFactory } from '@nodable/compact-builder';

const builder = new CompactBuilderFactory({
  tags:       { valueParsers: ['entity', 'boolean', 'number'] },
  attributes: { valueParsers: ['entity', 'number', 'boolean'] },
});

const parser = new XMLParser({ OutputBuilder: builder });
```

See [`docs/03-value-parsers.md`](./docs/03-value-parsers.md) for the full pipeline reference and custom parser guide.

## Input Modes

```javascript
// String or Buffer
parser.parse('<root/>');
parser.parse(Buffer.from('<root/>'));

// Typed array
parser.parseBytesArr(new Uint8Array([...]));

// Node.js Readable stream
const result = await parser.parseStream(fs.createReadStream('large.xml'));

// Incremental feed (WebSocket, chunked HTTP, etc.)
parser.feed('<root>');
parser.feed('<item>1</item>');
const result = parser.end();
```

## Possible Usage

- Parse XML config files, SOAP responses, RSS/Atom feeds
- Stream-parse large XML files with bounded memory
- Build custom AST-style output with `NodeTreeBuilder`
- Lenient HTML-fragment parsing with `autoClose`
- Stop-node capture for `<script>`, `<style>`, embedded HTML
- Extend `BaseOutputBuilder` to write parsed data directly to a database

## Documentation

| File | Topic |
|---|---|
| [`docs/01-getting-started.md`](./docs/01-getting-started.md) | Installation, quick start, common patterns |
| [`docs/02-options.md`](./docs/02-options.md) | Full options reference |
| [`docs/03-value-parsers.md`](./docs/03-value-parsers.md) | Value parser pipeline, built-ins, custom parsers |
| [`docs/04-stop-nodes.md`](./docs/04-stop-nodes.md) | Stop nodes and skip tags |
| [`docs/05-output-builders.md`](./docs/05-output-builders.md) | Built-in and custom output builders |
| [`docs/06-streaming.md`](./docs/06-streaming.md) | Stream, feed/end, and memory characteristics |
| [`docs/07-auto-close.md`](./docs/07-auto-close.md) | Lenient HTML parsing and error collection |
| [`docs/08-security.md`](./docs/08-security.md) | Security, DoS limits, prototype pollution |
| [`docs/09-path-expressions.md`](./docs/09-path-expressions.md) | Path expression syntax for stop nodes, skip, exitIf |
| [`docs/10-typescript.md`](./docs/10-typescript.md) | TypeScript usage and type definitions |

## License

MIT — [Amit Gupta](https://solothought.com)
