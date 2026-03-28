# Flex XML Parser — Complete Documentation

## Table of Contents
1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Architecture](#architecture)
5. [API Reference](#api-reference)
6. [Options Reference](#options-reference)
7. [Value Parsers](#value-parsers)
8. [Output Builders](#output-builders)
9. [Advanced Usage](#advanced-usage)
10. [Security](#security)
11. [Performance](#performance)

---

## Overview

Flex XML Parser is a flexible, high-performance XML parser for Node.js with:

- **Clean option design** — grouped, purposeful options with sensible defaults
- **Pluggable Output Builders** — `JsObjBuilder`, `JsArrBuilder`, `JsMinArrBuilder`, or your own
- **Value Parser Chain** — composable transformers: `replaceEntities`, `boolean`, `number`, `trim`, `currency`, or custom
- **Integrated Security** — entity expansion limits, prototype-pollution prevention
- **TypeScript Support** — complete type definitions
- **ES Modules** — modern JavaScript with proper imports

---

## Installation

```bash
npm install flex-xml-parser
```

---

## Quick Start

```javascript
import XMLParser from 'flex-xml-parser';

const parser = new XMLParser();
const result = parser.parse('<root><tag>42</tag></root>');
// { root: { tag: 42 } }
```

Parse with attributes:

```javascript
const parser = new XMLParser({ skip: { attributes: false } });
const result = parser.parse('<item id="1">hello</item>');
// { item: { '@_id': 1, '#text': 'hello' } }
```

---

## Architecture

### Core Components

| Component | Role |
|-----------|------|
| `XMLParser` | Public entry point — manages options, entities, exposes all APIs |
| `Xml2JsParser` | Core parsing engine — tokenises XML, drives the OutputBuilder |
| `OutputBuilder` | Assembles the JS result from parse events |
| `ValueParsers` | Chainable transformers: string → typed value |
| `EntitiesParser` | Holds entity tables (built-in, DOCTYPE, external); used by `replaceEntities` ValueParser |
| `DocTypeReader` | Reads DOCTYPE declarations, respects `entityParseOptions` limits |

### Data Flow

```
XML input
  → Xml2JsParser  (tokenise: tags, text, CDATA, comments, PIs, DOCTYPE)
      → DocTypeReader  (always reads DOCTYPE to advance cursor;
                        stores entities only when entityParseOptions.docType: true)
          → OutputBuilder  (assemble JS structure)
              → ValueParsers  ('replaceEntities' expands refs, 'boolean'/'number' coerce types)
                  → result
```

### Entity pipeline — two independent gates

Entity replacement is controlled by two completely independent settings:

```
DOCTYPE block → [entityParseOptions.docType gate] → entity table → ['replaceEntities' gate] → replacement in values
```

| `entityParseOptions.docType` | `'replaceEntities'` in valueParsers | Result |
|---|---|---|
| `false` (default) | yes (default) | DOCTYPE entities discarded; built-in XML entities still replaced |
| `true` | yes | DOCTYPE entities collected AND replaced |
| `true` | no | DOCTYPE entities collected but NOT replaced |
| `false` | no | Nothing replaced at all |

The same two-gate model applies to other entity sources:

- **`entityParseOptions.external`** — gates whether `addEntity()` registrations are applied
- **`entityParseOptions.html`** — gates HTML named entity replacement
- **`entityParseOptions.default`** — gates built-in XML entity replacement (lt/gt/apos/quot/amp)

---

## API Reference

### `new XMLParser(options?)`

Creates a parser instance. All options are optional.

### `parser.parse(xmlData)`

Parse an XML string or `Buffer` to a JS object.

```javascript
parser.parse('<root><n>42</n></root>');  // { root: { n: 42 } }
```

### `parser.parseBytesArr(data)`

Parse a `Uint8Array` or other `ArrayBufferView`.

### `parser.parseStream(readableStream)`

Parse a Node.js `ReadableStream` asynchronously.

```javascript
import fs from 'fs';
const result = await parser.parseStream(fs.createReadStream('data.xml'));
```

### `parser.feed(chunk)` / `parser.end()`

Incremental parsing — feed chunks, call `end()` to get the result.

```javascript
parser.feed('<root>');
parser.feed('<tag>hello</tag>');
const result = parser.end();  // { root: { tag: 'hello' } }
```

### `parser.addEntity(key, value)`

Register a custom external entity (without `&` and `;`).

Entities are always stored regardless of `entityParseOptions.external`. The `external`
flag only controls whether they are applied during replacement — useful for quick
on/off toggling without removing registrations.

```javascript
parser.addEntity('copy', '©');
parser.addEntity('trade', '™');
parser.parse('<root>&copy; &trade;</root>');  // { root: '© ™' }
```

---

## Options Reference

All options are optional. Defaults shown.

---

### `skip` — exclude node types from output

```javascript
skip: {
  attributes:  true,   // Skip all attributes (set false to parse them)
  declaration: false,  // Include <?xml version="1.0"?> in output
  pi:          false,  // Include <?...?> processing instructions
  cdata:       false,  // Include CDATA (merged into text by default)
  comment:     false,  // Include comments (omitted by default — see nameFor)
  nsPrefix:    false,  // Strip namespace prefixes (ns:tag → tag)
  tags:        false,  // (future) tag-level filtering
}
```

**`skip.attributes: false`** is the most commonly changed flag:

```javascript
const parser = new XMLParser({ skip: { attributes: false } });
```

**`skip.nsPrefix`** — strips the `ns:` prefix from tag and attribute names, drops `xmlns:*` attributes:

```javascript
const parser = new XMLParser({ skip: { nsPrefix: true } });
parser.parse('<ns:root><ns:tag>v</ns:tag></ns:root>');
// { root: { tag: 'v' } }
```

**`skip.cdata` vs `nameFor.cdata`** — `skip.cdata: true` drops CDATA entirely. When false (default), `nameFor.cdata` controls whether it's merged into text or stored separately.

**`skip.comment` vs `nameFor.comment`** — same pattern.

---

### `nameFor` — property names for special node types

```javascript
nameFor: {
  text:    '#text',  // Mixed-content text node property name
  cdata:   '',       // '' = merge CDATA into tag text; set e.g. '#cdata' to separate
  comment: '',       // '' = omit comments; set e.g. '#comment' to capture them
}
```

```javascript
// Capture CDATA and comments
const parser = new XMLParser({
  nameFor: { cdata: '#cdata', comment: '#comment' },
});
```

---

### `attributes` — attribute representation

```javascript
attributes: {
  booleanType:  false,                                    // Allow valueless attributes (→ true)
  groupBy:      '',                                       // Group under this key; '' = inline
  prefix:       '@_',                                     // Prepend to attribute names
  suffix:       '',                                       // Append to attribute names
  valueParsers: ['replaceEntities', 'number', 'boolean'],
}
```

```javascript
// No prefix, grouped under '$'
new XMLParser({
  skip: { attributes: false },
  attributes: { prefix: '', groupBy: '$' },
});
```

---

### `tags` — tag value options

```javascript
tags: {
  unpaired:     [],                                      // Self-closing tags (br, img, hr…)
  stopNodes:    [],                                      // Paths captured raw without parsing
  valueParsers: ['replaceEntities', 'boolean', 'number'],
}
```

**`tags.stopNodes`** — tag paths whose inner content is captured as a raw string
rather than being parsed further. Useful for `<script>`, `<style>`, embedded HTML
fragments, and similar.

Each entry is either a **plain string** (converted to an `Expression` internally)
or a pre-compiled **`Expression`** object from `path-expression-matcher`:

```javascript
import { Expression } from 'path-expression-matcher';

// Plain strings — same syntax as before
const parser = new XMLParser({
  tags: { stopNodes: ['root.script', '..style'] },
});

// Pre-compiled Expression — more expressive, zero re-parsing cost
const parser2 = new XMLParser({
  tags: {
    stopNodes: [
      new Expression("..script"),            // anywhere in tree
      new Expression("..style"),
      new Expression("..div[class=code]"),   // attribute condition
      new Expression("root.item:first"),     // position selector
    ],
  },
});

// Mixed arrays are fine too
const parser3 = new XMLParser({
  tags: { stopNodes: ['..script', new Expression("..div[class=raw]")] },
});
```

See [PathExpressionMatcher.md](./PathExpressionMatcher.md) for the full pattern
syntax (`..tag`, `*.tag`, `tag[attr=val]`, `:first`, `:nth(n)`, namespace
matching) and worked examples.

---

### `entityParseOptions` — entity sources and security limits

This is the single place to control all entity behaviour.

```javascript
entityParseOptions: {
  // ── Entity sources ──────────────────────────────────────────────────────
  default:  true,   // Built-in XML entities (lt, gt, apos, quot, amp)
                    //   true      → use built-in set (default)
                    //   false/null → disable entirely
                    //   object    → use this custom map instead

  html:     false,  // HTML named entities (&nbsp;, &copy;, &#169;, &#xA9;, …)
                    //   false/null → disabled (default)
                    //   true      → use built-in HTML set
                    //   object    → use this custom map instead

  external: true,   // Entities registered via addEntity()
                    //   true      → applied (default)
                    //   false/null → stored but not applied

  docType:  false,  // Entities declared in DOCTYPE internal subset
                    //   false/null → DOCTYPE is read (cursor advances) but
                    //                entities are discarded (default)
                    //   true      → entities collected and applied
                    //   Note: 'replaceEntities' must also be in valueParsers

  // ── Declaration-time limits (enforced by DocTypeReader) ─────────────────
  maxEntityCount:     100,     // Max entities declared in a DOCTYPE
  maxEntitySize:      10000,   // Max bytes per entity definition value

  // ── Replacement-time limits (enforced during value parsing) ─────────────
  maxTotalExpansions: 1000,    // Max total entity references expanded per document
  maxExpandedLength:  100000,  // Max total characters added by expansion per document
}
```

#### Common recipes

```javascript
// Enable DOCTYPE entities
new XMLParser({ entityParseOptions: { docType: true } });

// Enable HTML entities
new XMLParser({ entityParseOptions: { html: true } });

// Enable both DOCTYPE and HTML entities
new XMLParser({ entityParseOptions: { docType: true, html: true } });

// Disable built-in XML entity replacement
new XMLParser({ entityParseOptions: { default: false } });

// Disable external entities (addEntity registrations still stored)
new XMLParser({ entityParseOptions: { external: false } });

// Tighten security limits for untrusted input
new XMLParser({
  entityParseOptions: {
    docType: true,
    maxEntityCount:     10,
    maxEntitySize:      200,
    maxTotalExpansions: 50,
    maxExpandedLength:  5000,
  },
});
```

---

### `numberParseOptions`

Passed to the built-in `'number'` ValueParser:

```javascript
numberParseOptions: {
  hex:          true,       // Parse 0x... notation
  leadingZeros: true,       // '007' → 7
  eNotation:    true,       // 1e5, 2.5E-3
  infinity:     'original', // 'original' | 'string' | 'number'
}
```

---

### Security options

| Option | Default | Description |
|--------|---------|-------------|
| `strictReservedNames` | `false` | Throw when a tag/attribute name matches `nameFor.*` or `attributes.groupBy` |
| `onDangerousProperty` | `n => '__' + n` | Custom handler for dangerous (non-critical) property names |

---

## Value Parsers

Value parsers transform string values in sequence. Each receives the output of the previous one.

### Default chains

```
tags.valueParsers:       ['replaceEntities', 'boolean', 'number']
attributes.valueParsers: ['replaceEntities', 'number',  'boolean']
```

No `'trim'` by default — the parser faithfully preserves whitespace. Add `'trim'` explicitly if needed.

### Built-in parsers

| Name | What it does |
|------|-------------|
| `'replaceEntities'` | Expands entity references based on `entityParseOptions` (DOCTYPE, external, built-in XML, HTML) |
| `'entities'` | Alias for `'replaceEntities'` — backwards compatible |
| `'htmlEntities'` | Alias for `'replaceEntities'` — backwards compatible |
| `'boolean'` | `"true"` → `true`, `"false"` → `false` |
| `'number'` | Parses numeric strings to JS numbers (configurable via `numberParseOptions`) |
| `'trim'` | Strips leading/trailing whitespace from strings |
| `'currency'` | Parses currency values (strips symbols, handles locale formatting) |

### Controlling entity replacement

```javascript
// Disable entity replacement entirely
new XMLParser({
  tags:       { valueParsers: ['boolean', 'number'] },
  attributes: { valueParsers: ['number', 'boolean'] },
});

// Raw strings everywhere — no transformation at all
new XMLParser({
  tags:       { valueParsers: [] },
  attributes: { valueParsers: [] },
});

// Enable HTML entities via entityParseOptions (preferred)
new XMLParser({
  entityParseOptions: { html: true },
});

// Add trimming before entity expansion
new XMLParser({
  tags: { valueParsers: ['trim', 'replaceEntities', 'boolean', 'number'] },
});
```

### Context-aware custom parsers

Every parser in the chain receives a `context` object as the second argument:

```javascript
import { ElementType } from 'flex-xml-parser/src/OutputBuilders/BaseOutputBuilder.js';
import { Expression }  from 'path-expression-matcher';

const priceExpr = new Expression("..price");  // compile once

class PriceParser {
  parse(val, context) {
    // Use elementName for the tag/attribute name
    if (context?.elementName === 'price' && typeof val === 'string') {
      return parseFloat(val.replace(/[^0-9.]/g, ''));
    }
    // Or use the matcher for full path-expression power
    if (context?.matcher?.matches(priceExpr) && typeof val === 'string') {
      return parseFloat(val.replace(/[^0-9.]/g, ''));
    }
    return val;
  }
}

const parser = new XMLParser({
  tags: { valueParsers: ['replaceEntities', new PriceParser(), 'boolean', 'number'] },
});
```

**Context shape:**

```typescript
import { ElementType } from 'flex-xml-parser/src/OutputBuilders/BaseOutputBuilder.js';

{
  elementName:  string;              // tag name or attribute name
  elementValue: any;                 // value before this parse call
  elementType:  'TAG' | 'ATTRIBUTE'; // ElementType.TAG or ElementType.ATTRIBUTE
  matcher:      ReadOnlyMatcher;     // inspect current path, attrs, position
  isLeafNode:   boolean | null;      // true=leaf, false=has children, null=unknown
}
```

`matcher` is a read-only proxy of the live path tracker. It exposes
`matches(expr)`, `getCurrentTag()`, `getAttrValue(name)`, `getPosition()`,
`getCounter()`, `getDepth()`, `toString()`, and more. Mutating methods
(`push`, `pop`, `reset`, etc.) throw `TypeError`.

See [PathExpressionMatcher.md](./PathExpressionMatcher.md) for the full
`ReadOnlyMatcher` API and path-based transformation examples.

### Registering named custom parsers

```javascript
const builder = new JsObjOutputBuilder();
builder.registerValueParser('price', new PriceParser());

const parser = new XMLParser({
  OutputBuilder: builder,
  tags: { valueParsers: ['replaceEntities', 'price', 'boolean', 'number'] },
});
```

---

## Output Builders

### `JsObjBuilder` (default)

Produces a plain JS object. Repeated tags become arrays automatically.

```xml
<root><item>a</item><item>b</item></root>
```
```javascript
{ root: { item: ['a', 'b'] } }
```

### `JsArrBuilder`

Preserves full document order. Each node: `{ tagname, child[], ':@'? }`.

```javascript
import JsArrBuilder from 'flex-xml-parser/src/OutputBuilders/JsArrBuilder.js';
const parser = new XMLParser({ OutputBuilder: new JsArrBuilder() });
```


### Custom Output Builder

Extend `BaseOutputBuilder`:

```javascript
import BaseOutputBuilder from 'flex-xml-parser/src/OutputBuilders/BaseOutputBuilder.js';

class EventBuilder extends BaseOutputBuilder {
  constructor() {
    super();
    this.events = [];
  }

  getInstance(parserOptions) {
    const inst = new EventBuilder();
    inst.options = parserOptions;
    inst.registeredValParsers = {};
    return inst;
  }

  addTag(tag)         { this.events.push({ type: 'open',  name: tag.name }); }
  closeTag()          { this.events.push({ type: 'close' }); }
  addValue(text)      { this.events.push({ type: 'text',  value: text }); }
  _addChild(key, val) { this.events.push({ type: 'child', key, val }); }
  getOutput()         { return this.events; }
}

const parser = new XMLParser({ OutputBuilder: new EventBuilder() });
```

---

## Advanced Usage

### Namespace stripping

```javascript
const parser = new XMLParser({ skip: { nsPrefix: true } });
parser.parse('<ns:root xmlns:ns="http://example.com"><ns:tag>v</ns:tag></ns:root>');
// { root: { tag: 'v' } }
```

### Stop nodes — raw content capture

```javascript
import { Expression } from 'path-expression-matcher';

// Simple string syntax
const parser = new XMLParser({
  tags: { stopNodes: ['..script', '..style'] },
});
parser.parse('<root><script>var x = "<tag>";</script></root>');
// { root: { script: 'var x = "<tag>";' } }

// Expression objects — supports attribute conditions, position selectors, etc.
const parser2 = new XMLParser({
  tags: { stopNodes: [new Expression("..div[class=code]")] },
});
parser2.parse('<root><div class="code"><b>raw</b></div></root>');
// { root: { div: { '@_class': 'code', '#text': '<b>raw</b>' } } }
```

### Grouping attributes

```javascript
const parser = new XMLParser({
  skip: { attributes: false },
  attributes: { groupBy: '$', prefix: '' },
});
parser.parse('<item id="1" lang="en">hello</item>');
// { item: { '$': { id: 1, lang: 'en' }, '#text': 'hello' } }
```

### Capturing CDATA and comments

```javascript
const parser = new XMLParser({
  nameFor: { cdata: '#cdata', comment: '#comment' },
});
parser.parse(`
  <root>
    <!--Author: Amit-->
    <script><![CDATA[if (a < b) return true;]]></script>
  </root>
`);
// {
//   root: {
//     '#comment': 'Author: Amit',
//     script: { '#cdata': 'if (a < b) return true;' }
//   }
// }
```

### DOCTYPE entities

```javascript
// Collect and replace entities declared in DOCTYPE internal subset
const parser = new XMLParser({
  entityParseOptions: { docType: true },
});
const result = parser.parse(`
  <!DOCTYPE root [
    <!ENTITY org "Acme Corp">
    <!ENTITY yr  "2024">
  ]>
  <root>
    <company>&org;</company>
    <year>&yr;</year>
  </root>
`);
// { root: { company: 'Acme Corp', year: 2024 } }
```

### External + DOCTYPE entities together

```javascript
const parser = new XMLParser({
  entityParseOptions: { docType: true },
});
parser.addEntity('copy', '©');

const result = parser.parse(`
  <!DOCTYPE root [<!ENTITY brand "Acme">]>
  <root>&brand; &copy; 2024</root>
`);
// { root: 'Acme © 2024' }
```

### HTML entities in content

```javascript
const parser = new XMLParser({
  entityParseOptions: { html: true },
});
const result = parser.parse('<root><copy>&copy; 2024</copy></root>');
// { root: { copy: '© 2024' } }
```

### Incremental / streaming

```javascript
// Node.js stream
const result = await parser.parseStream(fs.createReadStream('large.xml'));

// Manual chunks
parser.feed('<root>');
parser.feed('<tag>hello</tag>');
parser.feed('</root>');
const result = parser.end();
```

---

## Security

### Prototype pollution prevention

**Critical names** (`__proto__`, `constructor`, `prototype`) — always throw on encounter:

```javascript
parser.parse('<__proto__>bad</__proto__>');
// throws: [SECURITY] Invalid name: "__proto__" is a reserved JavaScript keyword...
```

**Dangerous names** (`hasOwnProperty`, `toString`, `valueOf`, etc.) — sanitised with `__` prefix by default:

```javascript
parser.parse('<toString>x</toString>');
// { __toString: 'x' }

// Custom handler
new XMLParser({ onDangerousProperty: (name) => `safe_${name}` });
```

### Option-level name validation

These are validated at construction time:

```javascript
new XMLParser({ nameFor: { text: '__proto__' } });        // throws
new XMLParser({ nameFor: { cdata: '__defineGetter__' } }); // throws
new XMLParser({ attributes: { prefix: 'constructor' } });  // throws
new XMLParser({ attributes: { groupBy: 'prototype' } });   // throws
```

### `strictReservedNames`

When `true`, a tag or attribute name that equals any `nameFor.*` or `attributes.groupBy` value throws:

```javascript
const parser = new XMLParser({
  strictReservedNames: true,
  nameFor: { text: 'content' },
});
parser.parse('<content>text</content>');
// throws: Restricted tag name: content
```

### Entity expansion security

**Disable all entity replacement** by removing `'replaceEntities'` from `valueParsers`:

```javascript
const parser = new XMLParser({
  tags:       { valueParsers: ['boolean', 'number'] },
  attributes: { valueParsers: ['number', 'boolean'] },
});
```

**Disable only DOCTYPE entities** (keep built-in XML entity replacement):

```javascript
// Default behaviour — entityParseOptions.docType is false by default
const parser = new XMLParser();
```

**Tighten limits for untrusted input:**

```javascript
const parser = new XMLParser({
  entityParseOptions: {
    docType:            true,
    maxEntityCount:     10,
    maxEntitySize:      200,
    maxTotalExpansions: 50,
    maxExpandedLength:  5000,
  },
});
```

**Billion Laughs protection** — entity values containing `&` are silently discarded by `DocTypeReader`, preventing recursive entity chains. Flat repetition attacks are caught by `maxTotalExpansions`.

---

## Performance

### Disable unused features

```javascript
const parser = new XMLParser({
  // attributes already skipped by default
  tags: { valueParsers: [] },  // raw strings, no type coercion
  entityParseOptions: { default: false, docType: false },
});
```

### Streams for large files

```javascript
const result = await parser.parseStream(fs.createReadStream('large.xml'));
```

### Feed/end for chunk-based sources

```javascript
const parser = new XMLParser();
socket.on('data', chunk => parser.feed(chunk));
socket.on('end',  ()    => process(parser.end()));
```

---

## Support

- **TypeScript definitions** — `src/index.d.ts`
- **Specs** — `specs/*_spec.js` for working usage examples
- **Path expressions** — [`PathExpressionMatcher.md`](./PathExpressionMatcher.md) — stop-node patterns, matcher in callbacks
- **Value parsers** — [`ValueParsers.md`](./ValueParsers.md) — full pipeline reference and custom parser guide
- **Custom output builders** — [`CustomOutputBuilder.md`](./CustomOutputBuilder.md)

---

## License

MIT — see `LICENSE` for details.
