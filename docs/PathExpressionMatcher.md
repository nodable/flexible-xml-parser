# Path Expression Matcher Integration

flex-xml-parser integrates [`path-expression-matcher`](https://github.com/NaturalIntelligence/path-expression-matcher)
(≥ 1.2.0) as a first-class dependency for all path-based features:
`stopNodes`, value-parser context, and custom OutputBuilder callbacks.

---

## Contents

1. [Overview](#1-overview)
2. [stopNodes with Expressions](#2-stopnodes-with-expressions)
   - [String syntax (unchanged)](#string-syntax-unchanged)
   - [Pre-compiled Expression objects](#pre-compiled-expression-objects)
   - [Pattern syntax quick-reference](#pattern-syntax-quick-reference)
3. [The ReadOnlyMatcher](#3-the-readonlymatcher)
4. [Matcher in value parser context](#4-matcher-in-value-parser-context)
5. [Matcher in custom OutputBuilder callbacks](#5-matcher-in-custom-outputbuilder-callbacks)
6. [Two-pass attribute handling](#6-two-pass-attribute-handling)
7. [ElementType constants](#7-elementtype-constants)
8. [Performance tips](#8-performance-tips)

---

## 1. Overview

Every time the parser opens a tag, it calls `matcher.push(tagName, rawAttrs)`.
Every time it closes a tag, it calls `matcher.pop()`. This means at any point
during parsing the `Matcher` holds the exact current path — including tag names,
namespace, sibling position, and attribute values for the current node.

A **`ReadOnlyMatcher`** (a proxy that delegates all read methods but throws on
any write attempt) is created once per parse run and passed to every user-facing
callback. This lets you inspect the path safely without the risk of accidentally
mutating the parser's state.

---

## 2. stopNodes with Expressions

### String syntax (unchanged)

Plain strings continue to work exactly as before. They are internally converted
to `Expression` objects at parser-construction time:

```js
const parser = new XMLParser({
  tags: {
    stopNodes: ["root.script", "root.style"],
  },
});
```

### Pre-compiled Expression objects

Pass `Expression` instances directly for more expressive patterns and to avoid
re-parsing the same pattern on every parse call:

```js
import { Expression } from 'path-expression-matcher';
import XMLParser from 'flex-xml-parser';

const scriptExpr = new Expression("..script");  // compiled once
const styleExpr  = new Expression("..style");

const parser = new XMLParser({
  tags: { stopNodes: [scriptExpr, styleExpr] },
});

// Reuse the same parser and expressions for many documents:
const result1 = parser.parse(html1);
const result2 = parser.parse(html2);
```

You can mix strings and Expression objects freely in the same array.

### Pattern syntax quick-reference

| Pattern | What it matches |
|---|---|
| `"root.script"` | Exact path `root > script` |
| `"*.script"` | `script` with exactly one parent (any name) |
| `"..script"` | `script` anywhere in the tree |
| `"root..script"` | `script` anywhere under `root` |
| `"..div[class=code]"` | `div` with attribute `class="code"`, anywhere |
| `"root.item:first"` | First `item` under `root` (counter = 0) |
| `"root.item:nth(2)"` | Third `item` under `root` (counter = 2) |
| `"soap::Envelope"` | `Envelope` with namespace `soap` |

Attribute conditions work because the parser calls `matcher.updateCurrent(rawAttrs)`
**before** the stop-node check runs — see [section 6](#6-two-pass-attribute-handling).

### Attribute-condition stop node example

```js
const parser = new XMLParser({
  skip: { attributes: false },
  tags: {
    stopNodes: [new Expression("..div[class=code]")],
  },
});

const result = parser.parse(`
  <root>
    <div class="code"><pre>raw content</pre></div>
    <div class="text"><p>parsed normally</p></div>
  </root>`);

// div.code → stop node, content is raw string
console.log(typeof result.root.div[0]["#text"]); // "string"
console.log(result.root.div[0]["#text"]);         // "<pre>raw content</pre>"

// div.text → parsed normally
console.log(result.root.div[1].p);               // "parsed normally"
```

---

## 3. The ReadOnlyMatcher

The parser creates **one** `ReadOnlyMatcher` per parse run by calling
`matcher.readOnly()` (available since `path-expression-matcher` 1.2.0).
This single instance is reused for every callback — it is not re-created per
tag. Because it delegates to the live `Matcher`, it always reflects the current
path without any copying overhead.

**Allowed methods** (all read-only queries):

| Method | Returns |
|---|---|
| `matches(expression)` | `boolean` — does current path match? |
| `getCurrentTag()` | `string` — current tag name |
| `getCurrentNamespace()` | `string \| undefined` |
| `getAttrValue(name)` | attribute value on current node |
| `hasAttr(name)` | `boolean` |
| `getPosition()` | child index of current node |
| `getCounter()` | occurrence count of this tag name at this level |
| `getDepth()` | nesting depth |
| `toString()` | dot-separated path string, e.g. `"root.users.user"` |
| `toArray()` | array of tag names |
| `snapshot()` | state snapshot (use with `matcher.restore()` externally) |

**Blocked methods** (throw `TypeError`):
`push()`, `pop()`, `updateCurrent()`, `reset()`, `restore()`

---

## 4. Matcher in value parser context

Every call to a value parser's `parse(val, context)` method includes a `matcher`
field on the context object:

```ts
interface ValueParserContext {
  elementName:  string;             // tag name or attribute name
  elementValue: any;                // value before this parse call
  elementType:  'TAG' | 'ATTRIBUTE';
  matcher:      ReadOnlyMatcher;    // current path context
  isLeafNode:   boolean | null;     // true = leaf, false = has children, null = unknown
}
```

### Path-based selective transformation

```js
import { Expression } from 'path-expression-matcher';

const priceExpr = new Expression("..price");

class CurrencyParser {
  parse(val, context) {
    if (typeof val !== "string") return val;
    if (!context?.matcher?.matches(priceExpr)) return val;
    // Strip currency symbol and parse
    return parseFloat(val.replace(/[$€£¥₹,]/g, ""));
  }
}

const parser = new XMLParser({
  tags: { valueParsers: [new CurrencyParser()] },
});

const result = parser.parse(`
  <order>
    <ref>ORD-001</ref>
    <price>$19.99</price>
    <note>fragile</note>
  </order>`);

result.order.ref   // "ORD-001"  — not a price, untouched
result.order.price // 19.99      — parsed
result.order.note  // "fragile"  — not a price, untouched
```

### Attribute-aware processing

```js
const adminExpr = new Expression("..user[role=admin]");

class AdminFormatter {
  parse(val, context) {
    if (context?.elementType !== 'TAG') return val;
    if (context?.matcher?.matches(adminExpr)) {
      return `[ADMIN] ${val}`;
    }
    return val;
  }
}
```

### isLeafNode

`isLeafNode` tells you whether the current tag is a simple text-only node:

- `true` — the tag has no child elements (pure text value or empty)
- `false` — the tag contains child elements (may also have text)
- `null/undefined` — not determinable at the time the parser runs (rare)
- Always `true` for attributes

```js
class LeafOnlyParser {
  parse(val, context) {
    // Only transform leaf tag values, not mixed-content parents
    if (context?.isLeafNode !== true) return val;
    return typeof val === "string" ? val.toUpperCase() : val;
  }
}
```

---

## 5. Matcher in custom OutputBuilder callbacks

`addTag(tag, matcher)` and `closeTag(matcher)` both receive the `ReadOnlyMatcher`.
Use it to make structural decisions based on path:

```js
import { Expression } from 'path-expression-matcher';
import JsObjOutputBuilder, { JsObjBuilder } from 'flex-xml-parser/src/OutputBuilders/JsObjBuilder.js';

const legacyExpr = new Expression("root.legacyField");

class MigrationBuilder extends JsObjBuilder {
  addTag(tag, matcher) {
    // Rename a legacy tag on the fly
    if (matcher.matches(legacyExpr)) {
      tag = { ...tag, name: "modernField" };
    }
    super.addTag(tag, matcher);
  }
}

const factory = {
  getInstance(parserOptions) {
    const base = new JsObjOutputBuilder();
    return new MigrationBuilder(parserOptions, base.options, { ...base.registeredValParsers });
  },
  registerValueParser(name, p) {},
};

const parser = new XMLParser({ OutputBuilder: factory });
```

### Skipping a subtree

To drop a node entirely, suppress both `addTag` **and** `closeTag` together.
Suppressing only one desynchronises the builder's internal stack:

```js
const skipExpr = new Expression("root.internal");

class FilterBuilder extends JsObjBuilder {
  constructor(...args) {
    super(...args);
    this._skipDepth = 0;
  }
  addTag(tag, matcher) {
    if (matcher.matches(skipExpr)) { this._skipDepth++; return; }
    if (this._skipDepth > 0)      { this._skipDepth++; return; }
    super.addTag(tag, matcher);
  }
  closeTag(matcher) {
    if (this._skipDepth > 0) { this._skipDepth--; return; }
    super.closeTag(matcher);
  }
}
```

---

## 6. Two-pass attribute handling

Attribute processing uses two passes to ensure attribute-based expressions
(e.g. `..div[class=code]`) work correctly in **all** contexts:

```
readTagExp()
  └─ Pass 1: collect all raw attribute values into rawAttributes{}
             (no value parsers run yet)

readOpeningTag()
  ├─ matcher.push(tagName, {})
  ├─ matcher.updateCurrent(rawAttributes)   ← full attr context now in matcher
  ├─ flushAttributes()                      ← Pass 2: value parsers run here
  │    └─ addAttribute(name, val, readonlyMatcher)
  │         └─ parseValue(val, attrValueParsers, { ..., matcher })
  └─ isStopNode()  ← checked AFTER attrs set, so [attr=val] conditions work
```

This means:
- Stop-node expressions with attribute conditions are evaluated with all
  attributes already populated
- Attribute value parsers see the complete path context including sibling
  attributes on the same tag

---

## 7. ElementType constants

Import from `BaseOutputBuilder` when you need to check `context.elementType`
without using raw strings:

```js
import { ElementType } from 'flex-xml-parser/src/OutputBuilders/BaseOutputBuilder.js';

class TypeAwareParser {
  parse(val, context) {
    if (context?.elementType === ElementType.ATTRIBUTE) {
      // attribute value
    } else if (context?.elementType === ElementType.TAG) {
      // tag text value
    }
    return val;
  }
}
```

| Constant | Value |
|---|---|
| `ElementType.TAG` | `'TAG'` |
| `ElementType.ATTRIBUTE` | `'ATTRIBUTE'` |

---

## 8. Performance tips

**Pre-compile expressions once** — `Expression` parsing is a one-time cost.
Create expressions at module load time, not inside parse callbacks:

```js
// ✅ Module level — parsed once
const adminExpr  = new Expression("..user[role=admin]");
const scriptExpr = new Expression("..script");

const parser = new XMLParser({
  tags: { stopNodes: [scriptExpr] },
});

// ✅ Reuse across many documents
for (const doc of documents) {
  parser.parse(doc);
}
```

```js
// ❌ Avoid — re-parses the expression on every value callback
class BadParser {
  parse(val, context) {
    if (context?.matcher?.matches(new Expression("..user"))) { ... }
  }
}
```

**The ReadOnlyMatcher is free** — `matcher.readOnly()` returns a cached proxy
created once per parse. Calling any query method on it (like `matches()`,
`getCurrentTag()`) is as fast as calling it directly on the underlying `Matcher`.
There is no overhead from the proxy wrapper.
