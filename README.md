# Flexible XML Parser

A flexible, high-performance XML parser for Node.js with pluggable output builders, a composable value parser chain, and multiple input modes.

## Features

- **Multiple input modes** — string, Buffer, Uint8Array, Node.js streams, and incremental feed/end API. More can be created easily.
- **Pluggable output builders** — swap `CompactObjBuilder` for `NodeTreeBuilder`, `OrderedKeyValueBuilder`, or your own subclass of `BaseOutputBuilder`
- **Composable value parser chain** — built-in parsers for entities, numbers, booleans, trim, and currency; custom parsers receive full context
- **Path-expression stop nodes** — capture raw content inside matched tags (e.g. `<script>`, `<style>`) without further XML parsing; configurable enclosure skipping for nested quotes and comments
- **Entity expansion control** — built-in XML entities, optional HTML entities, external/registered entities, DocType-declared entities; all with DoS-prevention limits
- **Auto-close for lenient HTML parsing** — configurable recovery from unclosed tags and mismatched close tags; collect parse errors without throwing
- **DoS protection** — configurable limits on nesting depth, attributes per tag, entity count, entity size, and total expansion length
- **Security** — prototype-pollution prevention; reserved names throw; dangerous names are sanitised by default
- **TypeScript definitions** — complete dual-mode types (`fxp.d.ts` for ESM, `fxp.d.cts` for CJS)
- **ES Modules + CommonJS** — `"type": "module"` source with a bundled CJS output

## Installation

```bash
npm install flexible-xml-parser
```

## Quick Start

```javascript
import XMLParser from 'flexible-xml-parser';

const parser = new XMLParser();
const result = parser.parse('<root><count>3</count><active>true</active></root>');
// { root: { count: 3, active: true } }

// Enable attributes
const parser2 = new XMLParser({ skip: { attributes: false } });
parser2.parse('<item id="1">hello</item>');
// { item: { '@_id': 1, '#text': 'hello' } }
```

## Input modes

```javascript
// String or Buffer
parser.parse('<root/>');
parser.parse(Buffer.from('<root/>'));

// Typed array
parser.parseBytesArr(new Uint8Array([...]));

// Node.js Readable stream — memory stays proportional to the largest token,
// not the total document size
const result = await parser.parseStream(fs.createReadStream('large.xml'));

// Incremental feed — useful for WebSocket / chunked HTTP
parser.feed('<root>');
parser.feed('<item>1</item>');
const result = parser.end();
```

## Options

```javascript
new XMLParser({
  // What to exclude from output
  skip: {
    declaration: false,   // Skip <?xml ... ?> declaration
    pi: false,            // Skip processing instructions (other than declaration)
    attributes: true,     // Skip all attributes
    cdata: false,         // Exclude CDATA sections from output entirely
    comment: false,       // Exclude comments from output entirely
    nsPrefix: false,      // Strip namespace prefixes (e.g. ns:tag → tag)
    tags: [],             // Tag paths to skip entirely — content is silently dropped from output
  },

  // Property names for special nodes
  nameFor: {
    text:    '#text',  // mixed-content text property
    cdata:   '',       // '' = merge CDATA into text; '#cdata' = separate key
    comment: '',       // '' = omit; '#comment' = capture
  },

  // Attribute representation
  attributes: {
    prefix:       '@_',
    suffix:       '',
    groupBy:      '',     // group all attributes under this key; '' = inline
    booleanType:  false,  // allow valueless attributes (treated as true)
  },

  // Tag value options
  tags: {
    unpaired:     [],     // self-closing tags without / (e.g. ['br', 'img'])
    stopNodes:    [],     // paths whose content is captured raw (see below)
  },


  // DoS prevention
  limits: {
    maxNestedTags:       null,   // max tag nesting depth
    maxAttributesPerTag: null,   // max attributes on a single tag
  },

  doctypeOptions: {
    enabled: false,
    maxEntityCount: 100,
    maxEntitySize: 10000,
  },

// --- security ---
  strictReservedNames: false,
  onDangerousProperty: defaultOnDangerousProperty,

exitIf: null,

  feedable: {
    maxBufferSize: 10 * 1024 * 1024,
    autoFlush: true,
    flushThreshold: 1024,
  },

  // Lenient HTML-mode recovery
  autoClose: null,  // null = strict; 'html' = recover from unclosed/mismatched tags

  // Pluggable output builder (default: CompactBuilder)
  OutputBuilder: null,
});
```

## Value parsers

Value parsers let you control parsing of values of elements and attributes. This can be configured in output builders

Built-in chain names: `'entity'`, `'number'`, `'boolean'`, `'trim'`, `'currency'`.

```javascript
// Disable entity expansion
const builderConfig = { tags: { valueParsers: ['number', 'boolean'] } }
new XMLParser({
  OutputBuilder: new CompactObjBuilderFactory(builderConfig)
});
```

Benfits of this approach:
- You may keep any value parser of your need.
- You can separate parseing logic separate for tags and attributes.
- You can create your own value parsers.


## Stop nodes

Stop nodes capture raw content without further XML parsing — useful for `<script>`, `<style>`, or embedded HTML fragments.

```javascript
import { xmlEnclosures, quoteEnclosures } from 'flexible-xml-parser';

new XMLParser({
  tags: {
    stopNodes: [
      '..script',                          // plain — first </script> ends collection
      { expression: 'body..pre',   skipEnclosures: [...xmlEnclosures] },
      { expression: 'head..style', skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] },
    ],
  },
  onStopNode(tagDetail, rawContent, matcher) {
    console.log(tagDetail.name, rawContent);
  },
});
```

`xmlEnclosures` covers XML comments and CDATA; `quoteEnclosures` covers single-quote, double-quote, and template literals.

## Pluggable output builders

```javascript
import { BaseOutputBuilder, ElementType } from '@nodable/base-output-builder';
import { CompactBuilderFactory } from '@nodable/compact-builder';

// CompactBuilderFactory — default JS object output with extra options
const builder = new CompactBuilderFactory({
  alwaysArray:   ['item'],           // tag names or path expressions always wrapped in []
  forceArray:    (matcher) => ...,   // function-based array forcing
  forceTextNode: false,              // always emit nameFor.text even for text-only tags
  textJoint:     '',                 // join string when text spans multiple text nodes
});

new XMLParser({ OutputBuilder: builder });

// Custom builder by extending BaseOutputBuilder
class MyBuilder extends BaseOutputBuilder {
  addElement(tag, matcher)    { /* … */ }
  closeElement(matcher)       { /* … */ }
  addValue(text, matcher) { /* … */ }
  getOutput()             { return this.result; }
}
```

## Auto-close (lenient HTML parsing)

```javascript
// 'html' preset: recover from unclosed tags and mismatched close tags
const parser = new XMLParser({ autoClose: 'html' });
const result = parser.parse('<div><p>text<br></div>');

const errors = parser.getParseErrors();
// [{ type: 'unclosed-eof', tag: 'p', line: 1, col: … }, …]
```

Fine-grained control:

```javascript
new XMLParser({
  autoClose: {
    onEof:         'closeAll',  // 'throw' | 'closeAll'
    onMismatch:    'recover',   // 'throw' | 'recover' | 'discard'
    collectErrors: true,
  },
});
```

## Error handling

```javascript
import XMLParser, { ParseError, ErrorCode } from '@nodable/flexible-xml-parser';

try {
  parser.parse(xml);
} catch (e) {
  if (e instanceof ParseError) {
    console.error(e.code, e.line, e.col, e.message);
    // e.g. 'MISMATCHED_CLOSE_TAG' 4 12 'Expected </div>, got </span>'
  } else {
    throw e;
  }
}
```

All error codes are available on the `ErrorCode` constant for exhaustive matching without string literals.

## Custom entities

```javascript
parser.addEntity('copy', '©');
parser.addEntity('trade', '™');
// requires entityParseOptions.external: true (default)
```

## TypeScript

```typescript
import XMLParser, { X2jOptions, CompactObjBuilder, BaseOutputBuilder, ElementType } from '@nodable/flexible-xml-parser';

const options: X2jOptions = {
  skip:    { attributes: false, nsPrefix: true },
  nameFor: { cdata: '#cdata' },
  limits:  { maxNestedTags: 100 },
};

const parser = new XMLParser(options);
```

## License

MIT — [Amit Gupta](https://solothought.com)