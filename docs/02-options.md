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
  whitespaceText: true;//Skip whitespace only text values to be passed to the output builder
}
```

`skip.attributes: false` is the most commonly changed flag. Setting `skip.nsPrefix: true` strips `ns:` from both tag and attribute names and drops `xmlns:*` attributes.

`skip.cdata` vs `nameFor.cdata` — `skip.cdata: true` drops CDATA entirely; when `false` (default), `nameFor.cdata` controls whether it's merged into text or stored as a separate property.

XML parser supports whitespace normalisation, for `xml:space="preserve"` and `xml:space="default"` attributes. If `"ws"` value parser is set in `tags.valueParsers`, or you can import `WSNormalizer` from `@nodable/base-output-builder` to preserve white spaces of specific tags like 'script', 'pre', 'style' etc.  White spaces are by default preserved for CDATA, comments, or stop nodes irrespective of setting `ws` or `WSNormalizer` in pipeline. `WSNormalizer` skip attributes parsing. You will have to override its `parse` method to change the functionality. There is no impact if you skip or keep namespace.

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

## `decoding` — character encoding for byte/stream input

Only relevant when input is a `Buffer`/`Uint8Array` (`parseBytesArr()`, or bytes passed to `parse()`/`feed()`/`parseStream()`). Ignored for plain string input — there's nothing to decode.

```javascript
decoding: {
  encoding: 'auto',        // 'auto' | 'utf8' | 'ascii' | 'latin1' | 'utf16le' | 'utf16be' | a custom name
  customDecoders: {},      // register encodings FXP doesn't ship natively
}
```

`'auto'` (default) looks for a byte-order mark first, then a `<?xml ... encoding="..."?>` declaration, then falls back to `'utf8'`. A BOM and a declared encoding that disagree throw `ENCODING_MISMATCH` rather than silently picking one. Set `encoding` explicitly to skip detection entirely.

For an encoding not built in (e.g. Shift_JIS), register it under `customDecoders`, keyed by the name you'll use in `encoding`:

```javascript
import iconv from 'iconv-lite';

new XMLParser({
  decoding: {
    encoding: 'shift_jis',
    customDecoders: {
      shift_jis: {
        createDecoder: () => iconv.getDecoder('shift_jis'), // { write(buf): string, end(): string }
        selfSynchronizing: false, // default and safe — see below
      },
    },
  },
});
```

`selfSynchronizing` — leave `false` unless you've verified an ASCII delimiter byte (`<`, `>`, `"`, `'`) can never appear as part of one of this encoding's multi-byte characters. Setting it `true` incorrectly causes wrong tag/attribute boundaries to be found, not a crash — this is a correctness switch, not a performance knob to flip speculatively. A malformed `createDecoder()` (missing `write`/`end`) throws immediately at registration, not later during parsing.

`customDecoders` is scoped to the one `XMLParser` instance it's passed to — it doesn't leak into other instances in the same process.

See [16-encoding.md](./16-encoding.md) for the full internals (why `BufferSource` needs this in particular, how streaming auto-detection buffers bytes until it knows the encoding, and how error line/column stay accurate for multi-byte characters).

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

## Events

### onStopNode

Callback fired when a stop node appears.

```javascript
  onStopNode?: (
    tagDetail: { name: string; line: number; col: number; index: number },
    rawContent: string,
    matcher: any,
  ) => void;
```
Example

```js
const scripts: string[] = [];
const parser = new XMLParser({
 tags: { stopNodes: ["..script"] },
 onStopNode(tagDetail, rawContent, matcher) {
   scripts.push(rawContent);
 }
});
```