# 08 — Security

`@nodable/flexible-xml-parser` includes multiple layers of defence against malicious or pathological input.

---

## ParseError

Every error thrown by the parser is a `ParseError` (subclass of `Error`), so you can distinguish parser errors from unexpected runtime bugs with a single `instanceof` check:

```javascript
import XMLParser, { ParseError, ErrorCode } from '@nodable/flexible-xml-parser';

try {
  parser.parse(xmlInput);
} catch (e) {
  if (e instanceof ParseError) {
    console.error(`[${e.code}] line ${e.line}, col ${e.col}: ${e.message}`);
  } else {
    throw e; // unexpected bug — rethrow
  }
}
```

### ParseError properties

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable description |
| `code` | `ErrorCodeValue` | Machine-readable code |
| `line` | `number \| undefined` | 1-based line number |
| `col` | `number \| undefined` | 1-based column |
| `index` | `number \| undefined` | 0-based character offset |

---

## Structural Limits (DoS Prevention)

```javascript
new XMLParser({
  limits: {
    maxNestedTags:       100,  // max tag nesting depth
    maxAttributesPerTag:  50,  // max attributes on any single tag
  }
});
```

Both default to `null` (no limit). **For untrusted input, always set both.**

`maxNestedTags` guards against deeply nested documents that exhaust the call stack or heap. `maxAttributesPerTag` guards against attribute-flood attacks. The attributes limit only applies when `skip.attributes: false`.

---

## Entity Expansion Limits (Billion Laughs / XML Bomb)

The Billion Laughs attack uses recursive entity references to produce exponentially large output from a small document. The parser's defence is split into two layers:

**Layer 1 — `doctypeOptions` on `XMLParser`** (enforced at read time):

| Option | Default | Description |
|---|---|---|
| `maxEntityCount` | `100` | Max entities declared in a single DOCTYPE |
| `maxEntitySize` | `10000` | Max bytes per entity definition value |

**Layer 2 — `EntitiesValueParser`** from `@nodable/base-output-builder` (enforced at replacement time):

| Option | Default | Description |
|---|---|---|
| `maxTotalExpansions` | `0` (unlimited) | Max total entity references expanded per document |
| `maxExpandedLength` | `0` (unlimited) | Max total characters added by expansion |

DOCTYPE entity expansion is **disabled by default** (`doctypeOptions.enabled: false`). If you need it, enable it only for trusted input and tighten both layers:

```javascript
import { EntitiesValueParser } from '@nodable/base-output-builder';
import { CompactBuilderFactory } from '@nodable/compact-builder';

const evp = new EntitiesValueParser({
  default:            true,
  maxTotalExpansions: 200,
  maxExpandedLength:  10000,
});
const builder = new CompactBuilderFactory();
builder.registerValueParser('entity', evp);

new XMLParser({
  doctypeOptions: { enabled: true, maxEntityCount: 20, maxEntitySize: 1000 },
  OutputBuilder: builder,
});
```

---

## Prototype Pollution Prevention

Property names that could corrupt the JavaScript prototype (`__proto__`, `constructor`, `prototype`) are **always rejected** — they throw `ParseError` with code `SECURITY_PROTOTYPE_POLLUTION` regardless of options.

Dangerous but non-critical names (`hasOwnProperty`, `toString`, `valueOf`, etc.) are sanitised by default: the name is prefixed with `__` in the output. Use `onDangerousProperty` to customise this behaviour.

Option values that would place reserved names into output keys are rejected at construction time with code `SECURITY_RESERVED_OPTION`.

When `strictReservedNames: true`, tag or attribute names that collide with any configured `nameFor.*` or `attributes.groupBy` value throw `ParseError` with code `SECURITY_RESTRICTED_NAME`.

---

## Recommended Configuration for Untrusted Input

```javascript
import XMLParser, { ParseError } from '@nodable/flexible-xml-parser';
import { EntitiesValueParser } from '@nodable/base-output-builder';
import { CompactBuilderFactory } from '@nodable/compact-builder';

const evp = new EntitiesValueParser({
  default:            true,
  maxTotalExpansions: 500,
  maxExpandedLength:  50000,
});
const builder = new CompactBuilderFactory();
builder.registerValueParser('entity', evp);

const parser = new XMLParser({
  limits: {
    maxNestedTags:       100,
    maxAttributesPerTag:  50,
  },
  doctypeOptions: { enabled: false },  // never expand DOCTYPE from untrusted input
  strictReservedNames: true,
  OutputBuilder: builder,
});

try {
  const result = parser.parse(untrustedXml);
} catch (e) {
  if (e instanceof ParseError) {
    console.warn('XML rejected', { code: e.code, line: e.line, col: e.col });
  } else {
    throw e;
  }
}
```

### ErrorCode Quick Reference

| `ErrorCode` | Likely cause |
|---|---|
| `LIMIT_MAX_NESTED_TAGS` | Deeply nested or recursive XML |
| `LIMIT_MAX_ATTRIBUTES` | Attribute-flood attack |
| `ENTITY_MAX_COUNT` | DOCTYPE with excessive entity declarations |
| `ENTITY_MAX_EXPANSIONS` | Billion Laughs / XML bomb |
| `ENTITY_MAX_EXPANDED_LENGTH` | Large entity expansion output |
| `SECURITY_PROTOTYPE_POLLUTION` | Tag/attribute named `__proto__` etc. |
| `MISMATCHED_CLOSE_TAG` | Malformed XML (may be intentional fuzzing) |
| `UNEXPECTED_TRAILING_DATA` | Junk after the root close tag |

---

➡ Next: [09 — Path Expressions](./09-path-expressions.md)
