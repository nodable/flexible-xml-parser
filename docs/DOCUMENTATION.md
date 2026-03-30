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
| `XMLParser` | Public entry point — manages options, exposes all APIs |
| `Xml2JsParser` | Core parsing engine — tokenises XML, drives the OutputBuilder |
| `OutputBuilder` | Assembles the JS result from parse events; owns the value parser chain |
| `ValueParsers` | Chainable transformers: string → typed value |
| `EntitiesParser` | Holds entity tables (built-in, DOCTYPE, external); used by `EntitiesValueParser` |
| `EntitiesValueParser` | Value parser that expands entity references; owns external entity registration |
| `DocTypeReader` | Reads DOCTYPE declarations, respects `doctypeOptions` read-time limits |

### Data Flow

```
XML input
  → Xml2JsParser  (tokenise: tags, text, CDATA, comments, PIs, DOCTYPE)
      → DocTypeReader  (always reads DOCTYPE to advance cursor;
                        forwards entities to OutputBuilder only when doctypeOptions.enabled: true)
          → OutputBuilder  (assemble JS structure)
              → ValueParsers  ('replaceEntities' expands refs, 'boolean'/'number' coerce types)
                  → result
```

### Entity pipeline — two independent gates

Entity replacement is controlled by two completely independent settings:

```
DOCTYPE block → [doctypeOptions.enabled gate] → outputBuilder.addDocTypeEntities() → ['replaceEntities' gate] → replacement in values
```

| `doctypeOptions.enabled` | `'replaceEntities'` in valueParsers | Result |
|---|---|---|
| `false` (default) | yes (default) | DOCTYPE entities discarded; built-in XML entities still replaced |
| `true` | yes | DOCTYPE entities collected AND replaced |
| `true` | no | DOCTYPE entities collected but NOT replaced |
| `false` | no | Nothing replaced at all |

The same two-gate model applies to other entity sources, all configured on `EntitiesValueParser`:

- **`external`** — gates whether entities registered via `EntitiesValueParser.addEntity()` are applied
- **`html`** — gates HTML named entity replacement
- **`default`** — gates built-in XML entity replacement (lt/gt/apos/quot/amp)

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
  booleanType:  false,  // Allow valueless attributes (→ true)
  groupBy:      '',     // Group under this key; '' = inline
  prefix:       '@_',   // Prepend to attribute names
  suffix:       '',     // Append to attribute names
}
```

The `valueParsers` chain for attributes is configured on the **output builder**, not
on `XMLParser`. See [Value Parsers](#value-parsers) for details.

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
  unpaired:  [],  // Self-closing tags (br, img, hr…)
  stopNodes: [],  // Paths captured raw without parsing
}
```

The `valueParsers` chain for tag text is configured on the **output builder**, not
on `XMLParser`. See [Value Parsers](#value-parsers) for details.
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

### `doctypeOptions` — DOCTYPE reading and read-time security limits

Controls whether DOCTYPE entities are collected and enforces limits at **read time**
(inside `DocTypeReader`). Replacement behaviour — which entity tables are active,
expansion limits — is configured on `EntitiesValueParser` directly.

```javascript
doctypeOptions: {
  enabled:        false,  // Collect DOCTYPE entities and forward to output builder
                          //   false (default) → DOCTYPE is read (cursor advances) but
                          //                     entities are discarded
                          //   true            → entities collected and forwarded
                          //   Note: 'replaceEntities' must also be in the output
                          //         builder's valueParsers chain for replacement to happen

  // ── Read-time limits (enforced by DocTypeReader at declaration time) ──────
  maxEntityCount: 100,    // Max entities declared in a DOCTYPE
  maxEntitySize:  10000,  // Max bytes per entity definition value
}
```

#### Common recipes

```javascript
// Enable DOCTYPE entities
new XMLParser({ doctypeOptions: { enabled: true } });

// Tighten read-time limits for untrusted input
new XMLParser({
  doctypeOptions: {
    enabled:        true,
    maxEntityCount: 10,
    maxEntitySize:  200,
  },
});
```

---

### `EntitiesValueParser` — entity sources and replacement-time security limits

Entity source flags and replacement-time limits are configured on `EntitiesValueParser`,
which is registered on the output builder — not on `XMLParser`.

```javascript
import { EntitiesValueParser, JsObjBuilder } from 'flex-xml-parser';

const evp = new EntitiesValueParser({
  // ── Entity sources ───────────────────────────────────────────────────────
  default:  true,   // Built-in XML entities (lt, gt, apos, quot, amp)
                    //   true      → use built-in set (default)
                    //   false/null → disable entirely
                    //   object    → use this custom map instead

  html:     false,  // HTML named entities (&nbsp;, &copy;, &#169;, &#xA9;, …)
                    //   false/null → disabled (default)
                    //   true      → use built-in HTML set
                    //   object    → use this custom map instead

  external: true,   // Entities registered via evp.addEntity()
                    //   true      → applied (default)
                    //   false/null → stored but not applied

  // ── Replacement-time limits ──────────────────────────────────────────────
  maxTotalExpansions: 1000,    // Max total entity references expanded per document
  maxExpandedLength:  100000,  // Max total characters added by expansion per document
});

const builder = new JsObjBuilder();
builder.registerValueParser('replaceEntities', evp);
const parser = new XMLParser({ OutputBuilder: builder });
```

#### External entities

Register custom entities directly on `EntitiesValueParser`:

```javascript
const evp = new EntitiesValueParser({ default: true });
evp.addEntity('copy', '©');
evp.addEntity('trade', '™');
const builder = new JsObjBuilder();
builder.registerValueParser('replaceEntities', evp);
const parser = new XMLParser({ OutputBuilder: builder });
parser.parse('<root>&copy; &trade;</root>');  // { root: '© ™' }
```

#### Common recipes

```javascript
// Enable HTML entities
const evp = new EntitiesValueParser({ default: true, html: true });

// Disable built-in XML entity replacement
const evp = new EntitiesValueParser({ default: false });

// Disable external entities (addEntity registrations still stored)
const evp = new EntitiesValueParser({ default: true, external: false });

// Tighten replacement-time limits
const evp = new EntitiesValueParser({
  default: true,
  maxTotalExpansions: 50,
  maxExpandedLength:  5000,
});
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

The default chains are set by the output builder (`JsObjBuilder`, `JsArrBuilder`, etc.):

```
tags.valueParsers:       ['replaceEntities', 'boolean', 'number']
attributes.valueParsers: ['replaceEntities', 'number',  'boolean']
```

These can be overridden per output builder instance. No `'trim'` by default — the parser
faithfully preserves whitespace. Add `'trim'` explicitly if needed.

### Built-in parsers

| Name | What it does |
|------|-------------|
| `'replaceEntities'` | Expands entity references. Configured via `EntitiesValueParser` options (DOCTYPE, external, built-in XML, HTML) |
| `'boolean'` | `"true"` → `true`, `"false"` → `false` |
| `'number'` | Parses numeric strings to JS numbers (configurable by registering a custom `numberParser` instance) |
| `'trim'` | Strips leading/trailing whitespace from strings |
| `'currency'` | Parses currency values (strips symbols, handles locale formatting) |

### Controlling entity replacement

```javascript
// Disable entity replacement entirely — remove 'replaceEntities' from chain
const builder = new JsObjBuilder({
  tags:       { valueParsers: ['boolean', 'number'] },
  attributes: { valueParsers: ['number', 'boolean'] },
});
const parser = new XMLParser({ OutputBuilder: builder });

// Raw strings everywhere — no transformation at all
const builder2 = new JsObjBuilder({
  tags:       { valueParsers: [] },
  attributes: { valueParsers: [] },
});

// Enable HTML entities
import { EntitiesValueParser, JsObjBuilder } from 'flex-xml-parser';
const evp = new EntitiesValueParser({ default: true, html: true });
const builder3 = new JsObjBuilder();
builder3.registerValueParser('replaceEntities', evp);

// Add trimming before entity expansion
const builder4 = new JsObjBuilder({
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
import { XMLParser, EntitiesValueParser, JsObjBuilder } from 'flex-xml-parser';

const evp = new EntitiesValueParser({ default: true });
const builder = new JsObjBuilder();
builder.registerValueParser('replaceEntities', evp);

const parser = new XMLParser({
  doctypeOptions: { enabled: true },
  OutputBuilder: builder,
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
const evp = new EntitiesValueParser({ default: true });
evp.addEntity('copy', '©');
const builder = new JsObjBuilder();
builder.registerValueParser('replaceEntities', evp);

const parser = new XMLParser({
  doctypeOptions: { enabled: true },
  OutputBuilder: builder,
});
const result = parser.parse(`
  <!DOCTYPE root [<!ENTITY brand "Acme">]>
  <root>&brand; &copy; 2024</root>
`);
// { root: 'Acme © 2024' }
```

### HTML entities in content

```javascript
const evp = new EntitiesValueParser({ default: true, html: true });
const builder = new JsObjBuilder();
builder.registerValueParser('replaceEntities', evp);

const parser = new XMLParser({ OutputBuilder: builder });
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

**Disable all entity replacement** by removing `'replaceEntities'` from the output builder's chain:

```javascript
const builder = new JsObjBuilder({
  tags:       { valueParsers: ['boolean', 'number'] },
  attributes: { valueParsers: ['number', 'boolean'] },
});
const parser = new XMLParser({ OutputBuilder: builder });
```

**Disable only DOCTYPE entities** (keep built-in XML entity replacement):

```javascript
// Default behaviour — doctypeOptions.enabled is false by default
const parser = new XMLParser();
```

**Tighten limits for untrusted input:**

```javascript
import { EntitiesValueParser, JsObjBuilder } from 'flex-xml-parser';

const evp = new EntitiesValueParser({
  default:            true,
  maxTotalExpansions: 50,
  maxExpandedLength:  5000,
});
const builder = new JsObjBuilder();
builder.registerValueParser('replaceEntities', evp);

const parser = new XMLParser({
  doctypeOptions: {
    enabled:        true,
    maxEntityCount: 10,
    maxEntitySize:  200,
  },
  OutputBuilder: builder,
});
```

**Billion Laughs protection** — entity values containing `&` are silently discarded by `DocTypeReader`, preventing recursive entity chains. Flat repetition attacks are caught by `maxTotalExpansions` on `EntitiesValueParser`.

---

## Performance

### Disable unused features

```javascript
const builder = new JsObjBuilder({ tags: { valueParsers: [] } }); // raw strings, no type coercion
const parser = new XMLParser({ OutputBuilder: builder });
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
