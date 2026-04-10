# 01 — Getting Started

## Installation

```bash
npm install @nodable/flexible-xml-parser @nodable/compact-builder
```

Install additional output builders only as needed:

```bash
npm install @nodable/node-tree-builder
npm install @nodable/sequential-builder
```

## Your First Parser

```javascript
import XMLParser from '@nodable/flexible-xml-parser';

const parser = new XMLParser();
const result = parser.parse(`
  <books>
    <book id="1">
      <title>The Great Gatsby</title>
      <year>1925</year>
      <price>10.99</price>
    </book>
  </books>
`);
// { books: { book: { year: 1925, price: 10.99, title: 'The Great Gatsby' } } }
```

Numbers and booleans are automatically coerced. To include attributes, disable the default skip:

```javascript
const parser = new XMLParser({ skip: { attributes: false } });
parser.parse('<book id="1"><title>1984</title></book>');
// { book: { '@_id': 1, title: '1984' } }
```

## Common Patterns

### Parse a config file

```javascript
const parser = new XMLParser();
const config = parser.parse(xmlString);

console.log(config.config.database.host);   // 'localhost'
console.log(config.config.database.port);   // 5432 (number)
console.log(config.config.cache.enabled);   // true (boolean)
```

### Parse an RSS feed

```javascript
const parser = new XMLParser({ skip: { attributes: false } });
const feed = parser.parse(rssFeedXml);

for (const item of feed.rss.channel.item) {
  console.log(item.title, item.link);
}
```

### Keep everything as raw strings

```javascript
import { CompactBuilderFactory } from '@nodable/compact-builder';

const builder = new CompactBuilderFactory({
  tags:       { valueParsers: [] },
  attributes: { valueParsers: [] },
});
const parser = new XMLParser({ OutputBuilder: builder });
// All values come out as strings — no type coercion
```

### Keep leading zeros (e.g. SKUs, zip codes)

```javascript
import { CompactBuilderFactory } from '@nodable/compact-builder';
import { NumberValueParser } from '@nodable/base-output-builder';

const builder = new CompactBuilderFactory({
  tags: {
    valueParsers: ['entity', new NumberValueParser({ leadingZeros: false }), 'boolean'],
  },
});
const parser = new XMLParser({ OutputBuilder: builder });
parser.parse('<item><sku>00123</sku><price>9.99</price></item>');
// { item: { sku: '00123', price: 9.99 } }
```

### Strip namespace prefixes

```javascript
const parser = new XMLParser({ skip: { nsPrefix: true, attributes: false } });
parser.parse('<soap:Envelope><soap:Body><m:Item>Apple</m:Item></soap:Body></soap:Envelope>');
// { Envelope: { Body: { Item: 'Apple' } } }
```

### Parse untrusted XML safely

```javascript
const parser = new XMLParser({
  limits: { maxNestedTags: 50, maxAttributesPerTag: 20 },
  doctypeOptions: { enabled: false },
});

try {
  const result = parser.parse(untrustedXml);
} catch (e) {
  if (e instanceof ParseError) {
    console.error(e.code, e.message);
  }
}
```

### Handle CDATA

```javascript
// Option 1 (default): CDATA merged into text
const parser1 = new XMLParser();
parser1.parse('<html><![CDATA[<div>content</div>]]></html>');
// { html: '<div>content</div>' }

// Option 2: separate CDATA key
const parser2 = new XMLParser({ nameFor: { cdata: '#cdata' } });
parser2.parse('<html><![CDATA[<div>content</div>]]></html>');
// { html: { '#cdata': '<div>content</div>' } }
```

## Quick Reference — Most Used Options

```javascript
new XMLParser({
  skip:      { attributes: false },         // parse attributes
  nameFor:   { cdata: '#cdata' },           // separate CDATA key
  attributes:{ prefix: '@_' },             // attribute key prefix
  tags:      { unpaired: ['br', 'img'] },  // void/self-closing HTML tags
  limits:    { maxNestedTags: 100 },        // DoS guard
});
```

---

➡ Next: [02 — Options Reference](./02-options.md)
