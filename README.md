# Flex XML Parser

A flexible, high-performance XML parser for Node.js with pluggable output builders and a composable value parser chain.

## Features

- ✅ **Clean option design** — grouped options: `skip`, `nameFor`, `attributes`, `tags`, `entityParseOptions`
- ✅ **Entity expansion as a ValueParser** — `'entities'` / `'htmlEntities'` in the chain; remove to disable
- ✅ **No default trimming** — whitespace preserved unless you add `'trim'` to `valueParsers`
- ✅ **Pluggable Output Builders** — `JsObjBuilder`, `JsArrBuilder`, `JsMinArrBuilder`, or your own
- ✅ **Context-aware ValueParsers** — each parser receives `{ tagName, isAttribute, attrName? }`
- ✅ **Security** — entity limits, prototype-pollution prevention, option-level name validation
- ✅ **TypeScript definitions** — complete type support
- ✅ **ES Modules** — modern JavaScript

## Installation

```bash
npm install flex-xml-parser
```

## Quick Start

```javascript
import XMLParser from 'flex-xml-parser';

// Default: type-coerces values, expands entities, skips attributes
const parser = new XMLParser();
const result = parser.parse('<root><n>42</n><flag>true</flag></root>');
// { root: { n: 42, flag: true } }

// Enable attributes
const parser2 = new XMLParser({ skip: { attributes: false } });
parser2.parse('<item id="1">hello</item>');
// { item: { '@_id': 1, '#text': 'hello' } }
```

## Option structure

```javascript
{
  // What to exclude from output
  skip: {
    attributes:  true,   // ← set false to parse attributes
    nsPrefix:    false,  // strip ns: prefixes
    declaration: false,
    pi:          false,
    cdata:       false,
    comment:     false,
    docType:     true,   // always parsed for entities; never emitted
  },

  // Property names for special nodes
  nameFor: {
    text:    '#text',  // mixed-content text
    cdata:   '',       // '' = merge into text; '#cdata' = separate property
    comment: '',       // '' = omit; '#comment' = capture
  },

  // Attribute representation
  attributes: {
    prefix:       '@_',
    suffix:       '',
    groupBy:      '',
    booleanType:  false,
    valueParsers: ['entities', 'number', 'boolean'],
  },

  // Tag value options
  tags: {
    unpaired:     [],
    stopNodes:    [],
    valueParsers: ['entities', 'boolean', 'number'],
    //             ↑ remove 'entities' to disable expansion
    //               add 'trim' to strip whitespace
    //               use 'htmlEntities' for &nbsp; &copy; etc.
  },

  // Entity security limits (DocType declaration phase)
  entityParseOptions: {
    maxCount: 100, maxSize: 10000, maxExpansions: 1000, ...
  },

  numberParseOptions: { hex: true, leadingZeros: true, eNotation: true },

  OutputBuilder: null,  // default: JsObjBuilder
}
```

## Value parsers

Built-in parsers: `'entities'`, `'htmlEntities'`, `'trim'`, `'boolean'`, `'number'`, `'currency'`.

```javascript
// Disable entity expansion
new XMLParser({ tags: { valueParsers: ['boolean', 'number'] } });

// HTML entities + trim
new XMLParser({ tags: { valueParsers: ['htmlEntities', 'trim', 'boolean', 'number'] } });

// All raw strings
new XMLParser({ tags: { valueParsers: [] }, attributes: { valueParsers: [] } });
```

Custom parsers receive `(val, context)` — context contains `{ tagName, isAttribute, attrName? }`:

```javascript
class PriceParser {
  parse(val, { tagName }) {
    return tagName === 'price' ? parseFloat(val) : val;
  }
}

new XMLParser({
  tags: { valueParsers: ['entities', new PriceParser(), 'boolean'] },
});
```

## Security

```javascript
// Limit DocType entities for untrusted XML
new XMLParser({ entityParseOptions: { maxCount: 20, maxSize: 500 } });

// Disable expansion entirely (safest)
new XMLParser({ tags: { valueParsers: ['boolean', 'number'] } });
```

Critical names (`__proto__`, `constructor`, `prototype`) always throw. Dangerous names are sanitised with `__` prefix by default.

## TypeScript

```typescript
import XMLParser, { X2jOptions } from 'flex-xml-parser';

const options: X2jOptions = {
  skip:    { attributes: false, nsPrefix: true },
  nameFor: { cdata: '#cdata' },
  tags:    { valueParsers: ['entities', 'trim', 'boolean', 'number'] },
};
```

## Streaming

```javascript
// Node.js stream
const result = await parser.parseStream(fs.createReadStream('large.xml'));

// Manual chunks
parser.feed('<root>'); parser.feed('<n>1</n>'); parser.feed('</root>');
const result = parser.end();
```

See [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) for the complete reference.

## License

MIT — Author: Amit Gupta
