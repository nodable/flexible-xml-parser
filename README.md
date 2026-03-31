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
    attributes:  true,   // set false to parse attributes (default: true)
    nsPrefix:    false,  // strip ns:tag → tag (default: false)
    declaration: false,
    pi:          false,
    cdata:       false,
    comment:     false,
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
    valueParsers: ['entity', 'number', 'boolean'],
  },

  // Tag value options
  tags: {
    unpaired:     [],     // self-closing tags without / (e.g. ['br', 'img'])
    stopNodes:    [],     // paths whose content is captured raw (see below)
    valueParsers: ['entity', 'number', 'boolean'],
  },

  numberParseOptions: { hex: true, leadingZeros: true, eNotation: true },

  // Entity sources and security limits
  entityParseOptions: {
    default:            true,    // built-in XML entities (lt, gt, amp, …)
    html:               false,   // HTML named entities (&nbsp;, &copy;, …)
    external:           true,    // entities added via parser.addEntity()
    docType:            false,   // entities declared in DOCTYPE internal subset
    maxEntityCount:     100,
    maxEntitySize:      10000,
    maxTotalExpansions: 1000,
    maxExpandedLength:  100000,
  },

  // DoS prevention
  limits: {
    maxNestedTags:       null,   // max tag nesting depth
    maxAttributesPerTag: null,   // max attributes on a single tag
  },

  // Lenient HTML-mode recovery
  autoClose: null,  // null = strict; 'html' = recover from unclosed/mismatched tags

  // Pluggable output builder (default: CompactObjBuilder)
  OutputBuilder: null,
});
```

## Value parsers

Built-in chain names: `'entity'`, `'number'`, `'boolean'`, `'trim'`, `'currency'`.

```javascript
// Disable entity expansion
new XMLParser({ tags: { valueParsers: ['number', 'boolean'] } });

// HTML entities + trim whitespace
new XMLParser({
  tags: { valueParsers: ['entity', 'trim', 'number', 'boolean'] },
  entityParseOptions: { html: true },
});

// All values as raw strings
new XMLParser({ tags: { valueParsers: [] }, attributes: { valueParsers: [] } });
```

Custom parsers receive `(val, context)` where context carries `{ elementName, elementValue, elementType, matcher, isLeafNode }`:

```javascript
class PriceParser {
  parse(val, context) {
    return context.elementName === 'price' ? parseFloat(val) : val;
  }
}

new XMLParser({
  tags: { valueParsers: ['entity', new PriceParser(), 'boolean'] },
});
```

Register a reusable custom parser by name via `CompactObjBuilder`:

```javascript
import { CompactObjBuilder } from 'flexible-xml-parser';

const builder = new CompactObjBuilder();
builder.registerValueParser('price', new PriceParser());

new XMLParser({
  tags:          { valueParsers: ['entity', 'price', 'boolean'] },
  OutputBuilder: builder,
});
```

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
import XMLParser, { CompactObjBuilder, BaseOutputBuilder, ElementType } from 'flexible-xml-parser';

// CompactObjBuilder — default JS object output with extra options
const builder = new CompactObjBuilder({
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
import XMLParser, { ParseError, ErrorCode } from 'flexible-xml-parser';

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
import XMLParser, { X2jOptions, CompactObjBuilder, BaseOutputBuilder, ElementType } from 'flexible-xml-parser';

const options: X2jOptions = {
  skip:    { attributes: false, nsPrefix: true },
  nameFor: { cdata: '#cdata' },
  tags:    { valueParsers: ['entity', 'trim', 'number', 'boolean'] },
  limits:  { maxNestedTags: 100 },
};

const parser = new XMLParser(options);
```

## License

MIT — [Amit Gupta](https://solothought.com)