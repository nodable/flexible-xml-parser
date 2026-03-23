# AutoClose

The `autoClose` option controls how the parser behaves when it encounters malformed or incomplete XML. By default the parser throws an error on any structural problem. `autoClose` lets you choose a more lenient strategy — recovering gracefully, collecting a structured error log, or both.

---

## When do structural problems occur?

There are two distinct failure modes this feature addresses:

### 1. Unclosed tags at end of document (EOF)

```xml
<root><a><b>hello</b>
```

The stream was interrupted before `<a>` and `<root>` were closed. The `onEof` option handles this case.

### 2. Mismatched closing tag

```xml
<root><outer><inner>text</outer></root>
```

`</outer>` arrives while `<inner>` is still open. The `onMismatch` option handles this case.

---

## Options

```js
const parser = new XMLParser({
  autoClose: {
    onEof:        'throw',   // 'throw' | 'closeAll'
    onMismatch:   'throw',   // 'throw' | 'recover' | 'discard'
    collectErrors: false,    // boolean
  }
});
```

All three sub-options are independent and all default to their strictest value, so existing code is completely unaffected unless you opt in.

### `onEof`

What to do when the document ends with open tags still on the stack.

| Value | Behaviour |
|---|---|
| `'throw'` | Throw an error (default) |
| `'closeAll'` | Silently close all remaining open tags, innermost first |

```js
// Truncated stream — recover gracefully
const parser = new XMLParser({
  autoClose: { onEof: 'closeAll' }
});
parser.parse('<root><a><b>hello</b>');
// → { root: { a: { b: 'hello' } } }
```

### `onMismatch`

What to do when a closing tag does not match the currently open tag.

| Value | Behaviour |
|---|---|
| `'throw'` | Throw an error (default) |
| `'recover'` | Scan up the stack for the nearest matching opener. Close all intermediate tags implicitly, then close the matched tag. If no match is found anywhere in the stack, the closing tag is discarded and logged as a `phantom-close`. |
| `'discard'` | Silently ignore the bad closing tag and continue parsing |

```js
// Author forgot to close <inner> before closing <outer>
const parser = new XMLParser({
  autoClose: { onMismatch: 'recover' }
});
parser.parse('<root><outer><inner>text</outer></root>');
// → { root: { outer: { inner: 'text' } } }
```

**Phantom close tag** — a closing tag whose opener does not exist anywhere in the stack:

```xml
<root><a>text</a></z></root>
```

`</z>` has no matching `<z>` opener. With `onMismatch: 'recover'`, it is discarded and logged as a `phantom-close` error (when `collectErrors: true`). Parsing continues normally.

### `collectErrors`

When `true`, structural problems are recorded rather than silently dropped. After parsing completes, the error list is attached to the result object as `getParseErrors()`.

```js
const parser = new XMLParser({
  autoClose: { onEof: 'closeAll', collectErrors: true }
});
const result = parser.parse('<root><a><b>hi</b>');

console.log(parser.getParseErrors());
// [
//   {
//     type:     'unclosed-eof',
//     tag:      'a',
//     expected: null,
//     line:     1,
//     col:      8,
//     index:    7,
//   }
// ]
```

`getParseErrors()` is only added to the result when `collectErrors: true` **and** at least one error occurred. If the document is structurally valid there will be no `getParseErrors()` key.

#### Error record shape (each entry in getParseErrors())

| Field | Type | Description |
|---|---|---|
| `type` | `string` | One of `'unclosed-eof'`, `'mismatched-close'`, `'phantom-close'` |
| `tag` | `string` | Name of the tag that caused the problem |
| `expected` | `string \| null` | What the parser was expecting at that point (`null` for `unclosed-eof`) |
| `line` | `number` | 1-based line number where the opening tag began |
| `col` | `number` | 1-based column where the opening tag began |
| `index` | `number` | Character offset from the start of the document |

#### Error types

| `type` | Triggered by |
|---|---|
| `unclosed-eof` | A tag was still open when the document ended (`onEof: 'closeAll'`) |
| `mismatched-close` | A closing tag was matched to an ancestor by popping intermediate tags (`onMismatch: 'recover'`) |
| `phantom-close` | A closing tag had no matching opener anywhere in the stack (discarded by `recover` or `discard`) |

---

## HTML preset

Parsing real-world HTML fragments typically requires all three relaxed behaviours at once. The `'html'` shorthand enables them together and also registers the standard HTML void elements (tags that never have a closing tag) in `tags.unpaired`:

```js
const parser = new XMLParser({ autoClose: 'html' });
```

This is equivalent to:

```js
const parser = new XMLParser({
  autoClose: {
    onEof:        'closeAll',
    onMismatch:   'discard',
    collectErrors: true,
  },
  tags: {
    unpaired: [
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr',
    ],
  },
});
```

```js
const parser = new XMLParser({ autoClose: 'html', skip: { attributes: false } });
parser.parse(`
  <html>
    <head>
      <meta charset="UTF-8">
      <link rel="stylesheet" href="style.css">
    </head>
    <body>
      <p>Line one<br>Line two
    </body>
  </html>
`);
// Parses successfully. parser.getParseErrors() records unclosed <p>.
```

Any `tags.unpaired` values you supply yourself are merged with the HTML void elements rather than replaced.

---

## Combining options

`onEof` and `onMismatch` are fully independent. Common combinations:

```js
// Stream recovery only — still strict about mismatches during parsing
{ autoClose: { onEof: 'closeAll' } }

// Strict about EOF — lenient about mismatches
{ autoClose: { onMismatch: 'recover' } }

// Fully lenient — collect a log of everything that was fixed
{
  autoClose: {
    onEof:        'closeAll',
    onMismatch:   'recover',
    collectErrors: true,
  }
}
```

---

## Position information

Every error record carries `line`, `col`, and `index` fields taken from the moment the **opening** tag was read. This makes it straightforward to point a user at the tag that was never properly closed, rather than the position where the parser eventually noticed the problem.

```js
const xml = `<root>
  <section>
    <item>text</item>
    <open>
`;

const parser = new XMLParser({
  autoClose: { onEof: 'closeAll', collectErrors: true }
});
const result = parser.parse(xml);

const err = parser.getParseErrors().find(e => e.tag === 'open');
console.log(`<open> at line ${err.line}, col ${err.col}, offset ${err.index}`);
```

---

## Feedable / streaming input

`autoClose` works identically for all input modes — `parse()`, `parseBytesArr()`, and the `feed()` / `end()` streaming API. Errors are attached to the result returned by `end()`.

```js
const parser = new XMLParser({
  autoClose: { onEof: 'closeAll', collectErrors: true }
});

parser.feed('<root><a>');
parser.feed('<b>hello</b>');

const result = parser.end();
// result.root.a.b === 'hello'
// parser.getParseErrors() → [{ type: 'unclosed-eof', tag: 'a', ... }]
```

---

## Default behaviour is unchanged

Unless you pass an `autoClose` option, the parser behaves exactly as before: any structural problem throws immediately. There is no performance cost when `autoClose` is not configured.