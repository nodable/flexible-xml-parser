# Security Guide

flex-xml-parser provides multiple layers of defence against malicious or
pathological XML input. This document describes each protection, the attack
it targets, and how to configure it.

---

## Table of contents

1. [Error handling — ParseError](#1-error-handling--parseerror)
2. [Structural limits — DoS prevention](#2-structural-limits--dos-prevention)
   - [maxNestedTags](#maxnestedtags)
   - [maxAttributesPerTag](#maxattributespertag)
3. [Entity expansion limits — Billion Laughs / XML bomb](#3-entity-expansion-limits--billion-laughs--xml-bomb)
4. [Prototype pollution prevention](#4-prototype-pollution-prevention)
5. [Recommended configuration for untrusted input](#5-recommended-configuration-for-untrusted-input)

---

## 1. Error handling — ParseError

Every error thrown by the parser is an instance of `ParseError`, a subclass
of `Error`. This lets you distinguish library errors from unexpected runtime
errors with a single `instanceof` check.

```js
import { XMLParser, ParseError, ErrorCode } from 'flex-xml-parser';

const parser = new XMLParser({ limits: { maxNestedTags: 100 } });

try {
  parser.parse(xmlInput);
} catch (e) {
  if (e instanceof ParseError) {
    // Structured library error — always has a code and (usually) a position
    console.error(`Parse failed [${e.code}] at line ${e.line}, col ${e.col}: ${e.message}`);
  } else {
    // Unexpected runtime bug — rethrow
    throw e;
  }
}
```

### ParseError properties

| Property  | Type                  | Description                                              |
|-----------|-----------------------|----------------------------------------------------------|
| `message` | `string`              | Human-readable description                              |
| `code`    | `ErrorCodeValue`      | Machine-readable code (see `ErrorCode` enum)            |
| `line`    | `number \| undefined` | 1-based line number (available for most parse errors)   |
| `col`     | `number \| undefined` | 1-based column (available for most parse errors)        |
| `index`   | `number \| undefined` | 0-based character offset from document start            |

### ErrorCode values

```js
import { ErrorCode } from 'flex-xml-parser';

ErrorCode.LIMIT_MAX_NESTED_TAGS   // structural limits
ErrorCode.LIMIT_MAX_ATTRIBUTES
ErrorCode.ENTITY_MAX_COUNT        // entity expansion limits
ErrorCode.ENTITY_MAX_SIZE
ErrorCode.ENTITY_MAX_EXPANSIONS
ErrorCode.ENTITY_MAX_EXPANDED_LENGTH
ErrorCode.SECURITY_PROTOTYPE_POLLUTION  // prototype pollution
ErrorCode.SECURITY_RESERVED_OPTION
ErrorCode.SECURITY_RESTRICTED_NAME
// … and more — see src/ParseError.js for the full list
```

---

## 2. Structural limits — DoS prevention

The `limits` option group controls structural constraints on the XML document.
These protect against attacks that craft XML specifically to exhaust CPU, memory,
or the call stack.

```js
const parser = new XMLParser({
  limits: {
    maxNestedTags:     100,  // max tag nesting depth
    maxAttributesPerTag: 50, // max attributes on any single tag
  }
});
```

Both properties default to `null` (no limit enforced) to preserve backwards
compatibility. **For untrusted input, always set both.**

Option validation happens at construction time — invalid values (floats,
negative numbers, wrong type) throw `ParseError` with code `INVALID_INPUT`
before any XML is parsed.

### maxNestedTags

**Attack:** A document with pathological nesting depth (e.g. a million
`<a>` tags each inside the previous one) can exhaust the call stack or heap:

```xml
<a><a><a><a><!-- … 1,000,000 levels … --></a></a></a></a>
```

**Protection:** `maxNestedTags` limits the number of open tags that may
be on the stack at any one time (the nesting depth). When a new opening tag
would push the depth beyond the limit, `ParseError` is thrown immediately
with code `LIMIT_MAX_NESTED_TAGS` and the position of the offending tag.

```js
const parser = new XMLParser({ limits: { maxNestedTags: 100 } });

parser.parse('<a><b><c>ok</c></b></a>');  // depth 3 — OK

// depth 101 — throws ParseError [LIMIT_MAX_NESTED_TAGS] at line 1, col …
parser.parse(/* 101-level deep XML */);
```

**What counts as depth?** Each opening tag that is not self-closing and
not an unpaired (void) tag increments the depth counter. Self-closing tags
(`<br/>`) and unpaired tags (configured via `tags.unpaired`) do not
contribute to depth.

**Recommended value:** 100–200 for typical document structures. Use a
higher value only if your documents genuinely require deep nesting.

### maxAttributesPerTag

**Attack:** A tag with thousands of attributes can consume large amounts of
memory and CPU during attribute parsing:

```xml
<root a0="v" a1="v" a2="v" … a100000="v"/>
```

**Protection:** `maxAttributesPerTag` limits the number of attributes
per tag. The check fires after all attributes have been lexed but before
value parsers run — at the point where the full count is known. Throws
`ParseError` with code `LIMIT_MAX_ATTRIBUTES`.

```js
const parser = new XMLParser({
  skip: { attributes: false },   // attributes must be enabled
  limits: { maxAttributesPerTag: 50 },
});

parser.parse('<root a="1" b="2"/>');  // 2 attrs — OK
parser.parse('<root a0="v" … a50="v"/>');  // 51 attrs — throws
```

> **Note:** This limit is only enforced when `skip.attributes` is `false`.
> When attributes are skipped (the default), no attribute parsing occurs,
> so the limit has no effect.

**Recommended value:** 20–100 depending on your schema. HTML documents
rarely need more than 30 attributes on a single element.

---

## 3. Entity expansion limits — Billion Laughs / XML bomb

The [Billion Laughs attack](https://en.wikipedia.org/wiki/Billion_laughs_attack)
uses recursive entity references to produce exponentially large output from
a small document:

```xml
<!DOCTYPE bomb [
  <!ENTITY a "AAAA…">
  <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
  <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
]>
<root>&c;</root>
```

The parser is protected by limits split across two places:

**`doctypeOptions` on `XMLParser`** — enforced by `DocTypeReader` at declaration time:

| Option               | Default    | Description                                              |
|----------------------|------------|----------------------------------------------------------|
| `maxEntityCount`     | `100`      | Max entities declared in a single DOCTYPE               |
| `maxEntitySize`      | `10 000`   | Max bytes per entity definition value                   |

**`EntitiesValueParser`** — enforced during value parsing (replacement time):

| Option               | Default | Description                                              |
|----------------------|---------|----------------------------------------------------------|
| `maxTotalExpansions` | `0`     | Max total entity reference expansions per document (0 = unlimited) |
| `maxExpandedLength`  | `0`     | Max total characters added by entity expansion (0 = unlimited)     |

DOCTYPE entity expansion is **disabled by default** (`doctypeOptions.enabled: false`).
To enable it — which you should only do for trusted input — set `enabled: true` and
consider tightening the limits above:

```js
import { XMLParser, EntitiesValueParser, JsObjBuilder } from 'flex-xml-parser';

const evp = new EntitiesValueParser({
  default:            true,
  maxTotalExpansions: 200,
  maxExpandedLength:  10000,
});
const builder = new JsObjBuilder();
builder.registerValueParser('replaceEntities', evp);

const parser = new XMLParser({
  doctypeOptions: {
    enabled:        true,   // enable DOCTYPE entity expansion (trusted input only)
    maxEntityCount: 20,
    maxEntitySize:  1000,
  },
  OutputBuilder: builder,
});
```

Errors thrown when limits are exceeded are `ParseError` instances with
codes `ENTITY_MAX_COUNT`, `ENTITY_MAX_SIZE`, `ENTITY_MAX_EXPANSIONS`, or
`ENTITY_MAX_EXPANDED_LENGTH`.

---

## 4. Prototype pollution prevention

Property names that could corrupt the JavaScript object prototype (`__proto__`,
`constructor`, `prototype`) are **always rejected** — they throw `ParseError`
with code `SECURITY_PROTOTYPE_POLLUTION` regardless of options.

Property names that are dangerous but non-critical (`hasOwnProperty`,
`toString`, `valueOf`, etc.) are sanitised by default: the name is prefixed
with `__` in the output. This behaviour can be customised via the
`onDangerousProperty` option.

Option values that would place reserved names into output keys (`nameFor.text`,
`attributes.groupBy`, `attributes.prefix`) are rejected at construction time
with code `SECURITY_RESERVED_OPTION`.

When `strictReservedNames: true`, tag or attribute names that collide with
any configured `nameFor.*` or `attributes.groupBy` value throw
`ParseError` with code `SECURITY_RESTRICTED_NAME`.

---

## 5. Recommended configuration for untrusted input

```js
import { XMLParser, ParseError, ErrorCode, EntitiesValueParser, JsObjBuilder } from 'flex-xml-parser';

// Configure EntitiesValueParser with replacement-time limits
const evp = new EntitiesValueParser({
  default:            true,
  maxTotalExpansions: 500,
  maxExpandedLength:  50000,
});
const builder = new JsObjBuilder();
builder.registerValueParser('replaceEntities', evp);

const parser = new XMLParser({
  // ── Structural limits ────────────────────────────────
  limits: {
    maxNestedTags:       100,  // prevent stack overflow via deep nesting
    maxAttributesPerTag:  50,  // prevent attribute flood
  },

  // ── DOCTYPE reading ──────────────────────────────────
  doctypeOptions: {
    enabled: false,  // never expand DOCTYPE entities from untrusted input
  },

  // ── Attribute parsing ────────────────────────────────
  skip: { attributes: false },  // enable if you need attributes

  // ── Name sanitisation ────────────────────────────────
  strictReservedNames: true,    // throw on name collisions rather than silently sanitise

  OutputBuilder: builder,
});

try {
  const result = parser.parse(untrustedXml);
  // … use result
} catch (e) {
  if (e instanceof ParseError) {
    // Log structured info for your monitoring / alerting
    console.warn('XML rejected', {
      code:    e.code,
      message: e.message,
      line:    e.line,
      col:     e.col,
    });
  } else {
    throw e;
  }
}
```

### Quick reference: codes to watch for in production

| ErrorCode                      | Likely cause                                     |
|-------------------------------|--------------------------------------------------|
| `LIMIT_MAX_NESTED_TAGS`       | Deeply nested or recursive XML                   |
| `LIMIT_MAX_ATTRIBUTES`        | Attribute-flood attack                           |
| `ENTITY_MAX_COUNT`            | DOCTYPE with excessive entity declarations       |
| `ENTITY_MAX_EXPANSIONS`       | Billion Laughs / XML bomb                        |
| `ENTITY_MAX_EXPANDED_LENGTH`  | Large entity expansion output                    |
| `SECURITY_PROTOTYPE_POLLUTION`| Tag/attribute named `__proto__` etc.             |
| `MISMATCHED_CLOSE_TAG`        | Malformed XML (may be intentional fuzzing)       |
| `UNEXPECTED_TRAILING_DATA`    | Junk after root close tag                        |
