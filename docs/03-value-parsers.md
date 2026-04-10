# 03 — Value Parsers

Value parsers transform text values extracted from XML — tag content, CDATA, and attribute values. They run left-to-right so each parser receives the output of the previous one.

Value parsers are configured on the **output builder** (`@nodable/base-output-builder` and its subclasses), not on `XMLParser` directly.

---

## Configuring the Pipeline

```javascript
import { CompactBuilderFactory } from '@nodable/compact-builder';

const builder = new CompactBuilderFactory({
  tags:       { valueParsers: ['entity', 'boolean', 'number'] },  // default
  attributes: { valueParsers: ['entity', 'number', 'boolean'] },  // default
});
const parser = new XMLParser({ OutputBuilder: builder });
```

Each entry is either a **string name** (built-in or registered custom) or a **parser instance** with a `parse(val, context?)` method.

To disable all transformation:

```javascript
const builder = new CompactBuilderFactory({
  tags:       { valueParsers: [] },
  attributes: { valueParsers: [] },
});
// All values come out as raw strings
```

---

## Built-in Parsers

### `'entity'`

Expands XML entity references (`&lt;`, `&gt;`, `&amp;`, `&apos;`, `&quot;`), optional HTML entities, DOCTYPE-declared entities, and custom entities added via `addEntity()`.

Which sources are active is controlled by `EntitiesValueParser` from `@nodable/base-output-builder`:

```javascript
import { EntitiesValueParser } from '@nodable/base-output-builder';
import { CompactBuilderFactory } from '@nodable/compact-builder';

const evp = new EntitiesValueParser({
  default:  true,   // built-in XML entities (default: true)
  html:     false,  // HTML named entities like &nbsp; (default: false)
  external: true,   // entities added via addEntity() (default: true)
});
const builder = new CompactBuilderFactory();
builder.registerValueParser('entity', evp);
```

DOCTYPE entity collection is controlled separately by `doctypeOptions.enabled` on `XMLParser` (it happens at read time, before value parsing).

Remove `'entity'` from the chain to leave all references unexpanded:

```javascript
const builder = new CompactBuilderFactory({
  tags: { valueParsers: ['boolean', 'number'] },
});
// &lt; stays as the literal string "&lt;"
```

### `'boolean'`

Converts `"true"` and `"false"` (case-insensitive) to JavaScript `true`/`false`. All other values pass through unchanged.

### `'number'`

Converts numeric strings to JS numbers using the [`strnum`](https://www.npmjs.com/package/strnum) library.

| Option | Default | Description |
|---|---|---|
| `hex` | `true` | Parse `0x…` hex literals |
| `leadingZeros` | `true` | Parse `007` as `7` |
| `eNotation` | `true` | Parse `1.5e3` as `1500` |
| `infinity` | `"original"` | What to do with overflow: `"original"`, `"infinity"`, `"string"`, `"null"` |

To customise, import and register directly:

```javascript
import { NumberValueParser } from '@nodable/base-output-builder';

const builder = new CompactBuilderFactory();
builder.registerValueParser('number', new NumberValueParser({ leadingZeros: false }));
// "007" stays as "007"; 9.99 converts normally
```

### `'trim'`

Strips leading/trailing whitespace. Not in the default chain — add explicitly. Place it **before** `'boolean'` and `'number'` so whitespace is removed before type coercion.

```javascript
tags: { valueParsers: ['entity', 'trim', 'boolean', 'number'] }
```

### `'currency'`

Parses currency strings like `$1,234.56` or `€9.99` into numbers. Not in the default chain.

```javascript
import { CurrencyValueParser } from '@nodable/base-output-builder';
tags: { valueParsers: ['entity', new CurrencyValueParser(), 'boolean', 'number'] }
```

---

## Custom Value Parsers

Any object with a `parse(val, context?)` method works as a value parser:

```javascript
class UpperCaseParser {
  parse(val) {
    return typeof val === 'string' ? val.toUpperCase() : val;
  }
}

const builder = new CompactBuilderFactory({
  tags: { valueParsers: ['entity', new UpperCaseParser(), 'boolean', 'number'] },
});
```

To use a custom parser by name, register it on the builder:

```javascript
builder.registerValueParser('uppercase', new UpperCaseParser());
// Now reference it by name in any valueParsers array
```

---

## The Context Object

Each parser receives a `context` as its second argument:

```javascript
{
  elementName:  string,             // tag or attribute name
  elementValue: any,                // value before this parse call
  elementType:  'ELEMENT' | 'ATTRIBUTE',
  matcher:      ReadOnlyMatcher,    // inspect path, position
  isLeafNode:   boolean | null,
}
```

Use `ElementType` from `@nodable/base-output-builder` for the constants:

```javascript
import { ElementType } from '@nodable/base-output-builder';

class TagOnlyParser {
  parse(val, context) {
    if (context?.elementType === ElementType.ATTRIBUTE) return val;
    // only process tag values
    return doSomething(val);
  }
}
```

---

## Order Matters

- Put `'entity'` first — downstream parsers see clean characters, not `&amp;` etc.
- Put `'trim'` before `'boolean'` and `'number'` so `"  true  "` → `"true"` first
- Put `'number'` after `'boolean'` — once a value is `true`, number sees a non-string and passes through

Recommended order: `['entity', 'trim', 'boolean', 'number']`

---

## Separate Pipelines for Tags vs Attributes

```javascript
const builder = new CompactBuilderFactory({
  tags:       { valueParsers: ['entity', 'trim', 'boolean', 'number'] },
  attributes: { valueParsers: ['entity', 'number'] },  // no booleans in attrs
});
```

---

➡ Next: [04 — Stop Nodes & Skip Tags](./04-stop-nodes.md)
