# 02 — Options Reference

All options passed to `new XMLParser(options)`. Every option is optional.

---

## `skip` — exclude node types from output

```javascript
skip: {
  attributes:  true,   // Skip all attributes (set false to parse them)
  declaration: false,  // Include <?xml version="1.0"?> in output
  pi:          false,  // Include <?...?> processing instructions
  cdata:       false,  // Exclude CDATA from output (default: merge into text)
  comment:     false,  // Exclude comments (see also nameFor.comment)
  nsPrefix:    false,  // Strip namespace prefixes (ns:tag → tag)
  tags:        [],     // Tag paths to drop silently from output
}
```

`skip.attributes: false` is the most commonly changed flag. Setting `skip.nsPrefix: true` strips `ns:` from both tag and attribute names and drops `xmlns:*` attributes.

`skip.cdata` vs `nameFor.cdata` — `skip.cdata: true` drops CDATA entirely; when `false` (default), `nameFor.cdata` controls whether it's merged into text or stored as a separate property.

---

## `nameFor` — property names for special nodes

```javascript
nameFor: {
  text:    '#text',  // mixed-content text node property
  cdata:   '',       // '' = merge CDATA into text; '#cdata' = separate key
  comment: '',       // '' = omit; '#comment' = capture
}
```

---

## `attributes` — attribute representation

```javascript
attributes: {
  prefix:      '@_',
  suffix:      '',
  groupBy:     '',     // group all attributes under this key; '' = inline
  booleanType: false,  // allow valueless attributes (treated as true)
}
```

Value parsers for attributes are configured on the **output builder**, not here. See [03-value-parsers.md](./03-value-parsers.md).

```javascript
// No prefix, grouped under '$'
new XMLParser({
  skip: { attributes: false },
  attributes: { prefix: '', groupBy: '$' },
});
```

---

## `tags` — tag options

```javascript
tags: {
  unpaired:  [],  // self-closing tags without / (e.g. ['br', 'img'])
  stopNodes: [],  // paths whose content is captured raw — see 04-stop-nodes.md
}
```

Value parsers for tag text are configured on the **output builder**, not here. See [03-value-parsers.md](./03-value-parsers.md).

---

## `limits` — DoS prevention

```javascript
limits: {
  maxNestedTags:       null,  // max tag nesting depth; null = unlimited
  maxAttributesPerTag: null,  // max attributes on a single tag; null = unlimited
}
```

Exceeding a limit throws a `ParseError` with the appropriate `ErrorCode`. See [08-security.md](./08-security.md) for recommended values for untrusted input.

---

## `doctypeOptions` — DOCTYPE entity collection

Controls whether `DOCTYPE` entities are collected and enforces read-time limits. Replacement behaviour is configured on `EntitiesValueParser` in the output builder.

```javascript
doctypeOptions: {
  enabled:        false,  // collect and forward DOCTYPE entities to output builder
  maxEntityCount: 100,    // max entities declared in DOCTYPE
  maxEntitySize:  10000,  // max bytes per entity definition value
}
```

When `enabled: false` (default), the DOCTYPE block is read (cursor advances) but entities are discarded. Setting `enabled: true` collects them — but replacement only happens if `'entity'` is also in the output builder's `valueParsers` chain.

---

## `feedable` — buffer settings for feed/stream modes

```javascript
feedable: {
  maxBufferSize:  10 * 1024 * 1024,  // 10 MB; throw if exceeded
  autoFlush:      true,               // discard processed chars automatically
  flushThreshold: 1024,              // processed-char count that triggers flush
}
```

Increase `maxBufferSize` only if a single XML token (one tag, one CDATA block) exceeds 10 MB. See [06-streaming.md](./06-streaming.md).

---

## `autoClose` — lenient HTML parsing

```javascript
// Shorthand preset
autoClose: 'html'

// Fine-grained control
autoClose: {
  onEof:         'closeAll',  // 'throw' | 'closeAll'
  onMismatch:    'recover',   // 'throw' | 'recover' | 'discard'
  collectErrors: true,
}
```

See [07-auto-close.md](./07-auto-close.md) for full details.

---

## `exitIf` — early exit

A callback invoked after each opening tag. Return `true` to stop parsing immediately.

```javascript
exitIf: (tagDetail, matcher) => {
  return tagDetail.name === 'stopHere';
}
```

---

## `strictReservedNames` / `onDangerousProperty`

```javascript
strictReservedNames:  false,             // throw on reserved JS property names
onDangerousProperty:  defaultHandler,    // callback when a dangerous property name is seen
```

See [08-security.md](./08-security.md).

---

## `OutputBuilder`

Plug in a different output builder. Accepts a builder factory or instance.

```javascript
import { NodeTreeBuilderFactory } from '@nodable/node-tree-builder';

new XMLParser({ OutputBuilder: new NodeTreeBuilderFactory() });
```

See [05-output-builders.md](./05-output-builders.md).

---

➡ Next: [03 — Value Parsers](./03-value-parsers.md)
