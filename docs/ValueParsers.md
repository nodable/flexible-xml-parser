# Value Parsers

Value parsers are the transformation pipeline applied to every text value that
flex-xml-parser reads — tag text content, CDATA merged into text, and attribute
values. Each parser receives the current value and returns the (possibly
transformed) result. Parsers run left-to-right in the order given in the
`valueParsers` array, so the output of one becomes the input of the next.

---

## Contents

1. [How the pipeline works](#1-how-the-pipeline-works)
2. [Configuring the pipeline](#2-configuring-the-pipeline)
3. [Built-in value parsers](#3-built-in-value-parsers)
   - [replaceEntities](#replaceentities)
   - [boolean](#boolean)
   - [number](#number)
   - [trim](#trim)
   - [currency](#currency)
4. [Using a built-in parser with custom options](#4-using-a-built-in-parser-with-custom-options)
5. [Creating a custom value parser](#5-creating-a-custom-value-parser)
6. [Registering a named custom parser](#6-registering-a-named-custom-parser)
7. [Context object](#7-context-object)
8. [Order matters](#8-order-matters)
9. [Separate attribute and tag pipelines](#9-separate-attribute-and-tag-pipelines)
10. [Quick-reference table](#10-quick-reference-table)

---

## 1. How the pipeline works

After the XML tokeniser extracts a raw string value, `BaseOutputBuilder.parseValue()`
runs it through the configured parser chain:

```
raw string
    │
    ▼
replaceEntities  →  "&lt;hello&gt;"  becomes  "<hello>"
    │
    ▼
boolean          →  "true"  becomes  true
    │
    ▼
number           →  "42"    becomes  42
    │
    ▼
final value stored in output
```

Each step receives the **current value** (which may already be a number or
boolean from a previous step) and may return either a transformed value or the
value unchanged.

---

## 2. Configuring the pipeline

Pipelines are configured per section — one for tag text content and one for
attribute values — through the `tags.valueParsers` and `attributes.valueParsers`
options on the **output builder**, not on `XMLParser`.

```js
import { XMLParser, JsObjBuilder } from 'flex-xml-parser';

const builder = new JsObjBuilder({
  tags: {
    valueParsers: ['entity', 'boolean', 'number'],  // default
  },
  attributes: {
    valueParsers: ['entity', 'number', 'boolean'],  // default
  },
});
const parser = new XMLParser({ OutputBuilder: builder });
```

Each entry can be:

| Entry type | Description |
|---|---|
| `string` | Name of a registered built-in or custom parser |
| Parser instance | Any object with a `parse(val, context?)` method |

To **disable all value transformation** pass an empty array:

```js
const builder = new JsObjBuilder({
  tags: { valueParsers: [] },
  attributes: { valueParsers: [] },
});
const parser = new XMLParser({ OutputBuilder: builder });
// All values come out as raw strings
```

---

## 3. Built-in value parsers

### `replaceEntities`

Expands XML entity references (`&lt;`, `&gt;`, `&amp;`, `&apos;`, `&quot;`),
optional HTML named entities (`&nbsp;`, `&copy;`, etc.), DOCTYPE-declared
entities, and any entities registered via `EntitiesValueParser.addEntity()`.

Which sources are active is controlled by the `EntitiesValueParser` instance
registered under the `'entity'` key on the output builder:

```js
import { EntitiesValueParser, JsObjBuilder } from 'flex-xml-parser';

const evp = new EntitiesValueParser({
  default: true,   // built-in XML entities (default: true)
  html: false,     // HTML named entities  (default: false)
  external: true,  // evp.addEntity()      (default: true)
});
const builder = new JsObjBuilder();
builder.registerValueParser('entity', evp);

const parser = new XMLParser({
  doctypeOptions: { enabled: false }, // DOCTYPE entities (default: false)
  OutputBuilder: builder,
});
```

DOCTYPE entity collection is controlled separately by `doctypeOptions.enabled` on
`XMLParser`, since it happens at read time before value parsing runs.

Remove `'entity'` from the chain to leave all entity references
unexpanded without touching any other option:

```js
const builder = new JsObjBuilder({
  tags: { valueParsers: ['boolean', 'number'] },
});
const parser = new XMLParser({ OutputBuilder: builder });
// &lt; stays as the literal string "&lt;"
```

See [DOCUMENTATION.md](./DOCUMENTATION.md) for the full `EntitiesValueParser`
option reference and security limits (`maxTotalExpansions`, `maxExpandedLength`),
and `doctypeOptions` for read-time limits (`maxEntityCount`, `maxEntitySize`).

---

### `boolean`

Converts the strings `"true"` and `"false"` (case-insensitive) to JavaScript
`true` / `false`. All other values pass through unchanged.

```js
import XMLParser from 'flex-xml-parser';

const parser = new XMLParser();
const result = parser.parse(`<root><flag>true</flag><other>yes</other></root>`);

result.root.flag   // true   (boolean)
result.root.other  // "yes"  (string — not in the default true/false list)
```

The built-in `boolean` parser uses only `["true"]` / `["false"]` as its
default lists. To customise the recognised values, instantiate it directly
(see [section 4](#4-using-a-built-in-parser-with-custom-options)).

---

### `number`

Converts numeric strings to JavaScript numbers using the
[`strnum`](https://www.npmjs.com/package/strnum) library. The conversion is
controlled by the options passed when constructing the `numberParser` instance:

| Option | Type | Default | Description |
|---|---|---|---|
| `hex` | boolean | `true` | Parse `0x…` hex literals |
| `leadingZeros` | boolean | `true` | Parse `007` as `7` |
| `eNotation` | boolean | `true` | Parse `1.5e3` as `1500` |
| `infinity` | string | `"original"` | What to do when a value overflows to Infinity: `"original"` (keep string), `"infinity"` (JS `Infinity`), `"string"` (`"Infinity"`), `"null"` (`null`) |

To customise number parsing, instantiate `numberParser` directly and register it
on the output builder:

```js
import { numberParser, JsObjBuilder } from 'flex-xml-parser';

const builder = new JsObjBuilder();
builder.registerValueParser('number', new numberParser({
  hex:          true,
  leadingZeros: false,  // "007" stays as "007"
  eNotation:    true,
  infinity:     'original', // very large numbers stay as strings
}));

const parser = new XMLParser({ OutputBuilder: builder });
```

Non-numeric strings are passed through unchanged.

---

### `trim`

Trims leading and trailing whitespace from string values. Not in the default
pipeline — add it explicitly when needed:

```js
const parser = new XMLParser({
  tags: { valueParsers: ['trim', 'entity', 'boolean', 'number'] },
});

const result = parser.parse(`<root><tag>  hello  </tag></root>`);
result.root.tag  // "hello"
```

Put `trim` **before** `number` and `boolean` so that `"  42  "` becomes `"42"`
before the number parser sees it.

---

### `currency`

Parses common currency strings into numbers. It recognises `$`, `€`, `£`, `¥`,
`₹` symbols and comma-separated thousands (`1,234.56`).

```js
import CurrencyParser from 'flex-xml-parser/src/ValueParsers/currency.js';

const parser = new XMLParser({
  tags: {
    valueParsers: ['entity', new CurrencyParser(), 'boolean', 'number'],
  },
});
```

`CurrencyParser` accepts an options object:

| Option | Default | Description |
|---|---|---|
| `maxLength` | `200` | Strings longer than this are skipped |
| `locale` | auto-detected | Override the locale used for `Intl.NumberFormat` |

---

## 4. Using a built-in parser with custom options

Every built-in parser can be instantiated directly and inserted into the chain
as a parser **instance** rather than a string name. The instance form takes
precedence over any registered name.

### Custom `boolean` lists

```js
import boolParser from 'flex-xml-parser/src/ValueParsers/booleanParser.js';

const yesNo = new boolParser(
  ['true', 'yes', '1'],   // trueList
  ['false', 'no', '0'],   // falseList
);

const parser = new XMLParser({
  tags: { valueParsers: ['entity', yesNo, 'number'] },
});

const result = parser.parse(`<root><a>yes</a><b>no</b><c>1</c></root>`);
result.root.a  // true
result.root.b  // false
result.root.c  // true  (number parser hasn't run yet when boolParser sees "1")
```

### Custom `number` options

```js
import numParser from 'flex-xml-parser/src/ValueParsers/number.js';

const strictNum = new numParser({ hex: false, leadingZeros: false, eNotation: true });

const parser = new XMLParser({
  tags: { valueParsers: ['entity', 'boolean', strictNum] },
});

const result = parser.parse(`<root><id>007</id><val>0xFF</val><sci>1.5e3</sci></root>`);
result.root.id   // "007"  — leading zeros rejected
result.root.val  // "0xFF" — hex rejected
result.root.sci  // 1500   — e-notation still parsed
```

---

## 5. Creating a custom value parser

A value parser is any object (class instance or plain object) that exposes a
`parse(val, context?)` method. It receives the current value and must return the
(possibly modified) value.

### Minimal example — upper-case all strings

```js
class UpperCaseParser {
  parse(val) {
    return typeof val === 'string' ? val.toUpperCase() : val;
  }
}

const parser = new XMLParser({
  tags: { valueParsers: ['entity', new UpperCaseParser(), 'boolean', 'number'] },
});

const result = parser.parse(`<root><name>alice</name></root>`);
result.root.name  // "ALICE"
```

### Stateful example — collect all parsed tag values for auditing

```js
class AuditCollector {
  constructor() {
    this.log = [];
  }
  parse(val, context) {
    if (context) this.log.push({ tag: context.elementName, val });
    return val;  // pass through unchanged
  }
}

const auditor = new AuditCollector();

const parser = new XMLParser({
  tags: { valueParsers: ['entity', auditor, 'boolean', 'number'] },
});

parser.parse(`<order><id>42</id><total>99.99</total></order>`);
// auditor.log → [{ tag: "id", val: "42" }, { tag: "total", val: "99.99" }]
// (values are raw strings at this point — 'number' runs after)
```

### Conditional example — parse numbers only for specific tags

```js
import numParser  from 'flex-xml-parser/src/ValueParsers/number.js';
import { ElementType } from 'flex-xml-parser/src/OutputBuilders/BaseOutputBuilder.js';

class SelectiveNumParser {
  constructor(numericTags) {
    this.numericTags = new Set(numericTags);
    this.inner = new numParser();
  }
  parse(val, context) {
    if (context?.elementType === ElementType.ATTRIBUTE) return val; // skip attributes
    if (!this.numericTags.has(context?.elementName)) return val;
    return this.inner.parse(val);
  }
}

const parser = new XMLParser({
  tags: {
    valueParsers: [
      'entity',
      'boolean',
      new SelectiveNumParser(['price', 'qty', 'id']),
    ],
  },
});

const result = parser.parse(`<order><id>001</id><note>ref-42</note><price>9.99</price></order>`);
result.order.id     // 1        — numeric tag, converted
result.order.note   // "ref-42" — not in numericTags, stays as string
result.order.price  // 9.99     — numeric tag, converted
```

---

## 6. Registering a named custom parser

To reference a custom parser by name (like the built-ins), register it on the
`OutputBuilder` before passing it to `XMLParser`:

```js
import XMLParser from 'flex-xml-parser';
import JsObjOutputBuilder from 'flex-xml-parser/src/OutputBuilders/JsObjBuilder.js';

class SlugParser {
  parse(val) {
    return typeof val === 'string'
      ? val.toLowerCase().replace(/\s+/g, '-')
      : val;
  }
}

const builder = new JsObjOutputBuilder();
builder.registerValueParser('slug', new SlugParser());

const parser = new XMLParser({
  OutputBuilder: builder,
  tags: { valueParsers: ['entity', 'slug'] },  // use by name
});

const result = parser.parse(`<root><title>Hello World</title></root>`);
result.root.title  // "hello-world"
```

Registered parsers are available by name in any `valueParsers` array for that
parser instance. They persist for the lifetime of the `OutputBuilder` object.

---

## 7. Context object

Every `parse()` call receives an optional `context` object as its second
argument. It carries information about where in the document the value originated
and provides a read-only view of the current parse path:

```ts
import { ElementType } from 'flex-xml-parser/src/OutputBuilders/BaseOutputBuilder.js';

interface ValueParserContext {
  elementName:  string;             // tag name or attribute name
  elementValue: any;                // the value before this parse call
  elementType:  'TAG' | 'ATTRIBUTE'; // use ElementType.TAG / ElementType.ATTRIBUTE
  matcher:      ReadOnlyMatcher;    // inspect path, attributes, position
  isLeafNode:   boolean | null;     // true=leaf, false=has children, null=unknown
}
```

`elementType` is always one of the `ElementType` constants:

| Constant | Value | When set |
|---|---|---|
| `ElementType.TAG` | `'TAG'` | Tag text content |
| `ElementType.ATTRIBUTE` | `'ATTRIBUTE'` | Attribute value |

`isLeafNode` for attributes is always `true`. For tags it is `true` when the tag
contains only text (no child elements), `false` when it has child elements that
also have text content, and `null/undefined` in edge cases where it cannot be
determined at parse time.

Use `context` to apply different logic per path, element type, or position:

```js
import { ElementType } from 'flex-xml-parser/src/OutputBuilders/BaseOutputBuilder.js';
import { Expression }  from 'path-expression-matcher';

const priceExpr = new Expression("..price");

class DebugParser {
  parse(val, context) {
    if (context?.elementType === ElementType.ATTRIBUTE) {
      console.log(`  attr[${context.elementName}] = ${JSON.stringify(val)}`);
    } else {
      console.log(`  <${context?.elementName}> = ${JSON.stringify(val)}`);
    }
    return val;
  }
}

class PathAwareParser {
  parse(val, context) {
    // Use the matcher to make decisions based on current path
    if (context?.matcher?.matches(priceExpr)) {
      return parseFloat(String(val).replace(/[^0-9.]/g, ""));
    }
    return val;
  }
}
```

See [PathExpressionMatcher.md](./PathExpressionMatcher.md) for the full
`ReadOnlyMatcher` API and more examples.

---

## 8. Order matters

The pipeline runs **left to right** and each parser sees the **output** of the
previous one, not the original raw string. This means:

- Put `replaceEntities` first so downstream parsers see clean characters, not
  `&amp;` etc.
- Put `trim` before `boolean` and `number` so `"  true  "` becomes `"true"`
  before the boolean test.
- Put `number` after `boolean` — once `boolean` turns `"true"` into `true`,
  the number parser receives a non-string and passes it through.
- A custom parser placed **after** `number` will receive numbers, not strings,
  for numeric values.

```js
// Recommended default order
['entity', 'trim', 'boolean', 'number']

// If trim is not needed (default):
['entity', 'boolean', 'number']
```

---

## 9. Separate attribute and tag pipelines

Tags and attributes have independent pipelines. This is useful when you want
different type-coercion behaviour for each:

```js
const parser = new XMLParser({
  skip: { attributes: false },
  tags: {
    // Full pipeline for tag text
    valueParsers: ['entity', 'trim', 'boolean', 'number'],
  },
  attributes: {
    // Attributes: entities + numbers only; booleans stay as strings
    valueParsers: ['entity', 'number'],
    prefix: '@_',
  },
});
```

---

## 10. Quick-reference table

| Name | Registered as | Input → Output | Notes |
|---|---|---|---|
| Entity replacement | `'entity'` | `"&lt;"` → `"<"` | Configured via `EntitiesValueParser` options |
| Boolean conversion | `'boolean'` | `"true"` → `true` | Customisable true/false lists |
| Number conversion | `'number'` | `"42"` → `42` | Configure by registering a custom `numberParser` instance |
| Whitespace trim | `'trim'` | `"  hi  "` → `"hi"` | Not in default chain |
| Currency parsing | `'currency'` | `"$1,234.56"` → `1234.56` | Not in default chain |
| Custom (by name) | your string key | depends on parser | Register via `builder.registerValueParser()` |
| Custom (inline) | parser instance | depends on parser | Pass instance directly in array |
