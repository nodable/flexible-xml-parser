# 07 — Auto-Close (Lenient HTML Parsing)

By default the parser throws on any structural problem. `autoClose` lets you recover gracefully from malformed or incomplete XML — useful for parsing real-world HTML fragments.

---

## Two Failure Modes

**1. Unclosed tags at EOF** — document ends with open tags still on the stack:

```xml
<root><a><b>hello</b>
```

**2. Mismatched closing tag** — close tag doesn't match the currently open tag:

```xml
<root><outer><inner>text</outer></root>
```

---

## Options

```javascript
new XMLParser({
  autoClose: {
    onEof:         'throw',   // 'throw' | 'closeAll'
    onMismatch:    'throw',   // 'throw' | 'recover' | 'discard'
    collectErrors: false,
  }
});
```

All three sub-options are independent and default to the strictest value.

### `onEof`

| Value | Behaviour |
|---|---|
| `'throw'` | Throw an error (default) |
| `'closeAll'` | Silently close all remaining open tags, innermost first |

```javascript
const parser = new XMLParser({ autoClose: { onEof: 'closeAll' } });
parser.parse('<root><a><b>hello</b>');
// → { root: { a: { b: 'hello' } } }
```

### `onMismatch`

| Value | Behaviour |
|---|---|
| `'throw'` | Throw an error (default) |
| `'recover'` | Scan up the stack for a matching opener; close intermediate tags implicitly |
| `'discard'` | Silently ignore the bad closing tag |

```javascript
const parser = new XMLParser({ autoClose: { onMismatch: 'recover' } });
parser.parse('<root><outer><inner>text</outer></root>');
// → { root: { outer: { inner: 'text' } } }
```

A closing tag with no matching opener anywhere in the stack is called a **phantom close**. With `'recover'` or `'discard'` it is dropped and, if `collectErrors: true`, logged as a `phantom-close` error.

### `collectErrors`

When `true`, structural problems are recorded rather than silently dropped. After parsing, retrieve the list with `parser.getParseErrors()`:

```javascript
const parser = new XMLParser({
  autoClose: { onEof: 'closeAll', collectErrors: true }
});
parser.parse('<root><a><b>hi</b>');

parser.getParseErrors();
// [{ type: 'unclosed-eof', tag: 'a', expected: null, line: 1, col: 8, index: 7 }]
```

#### Error record fields

| Field | Description |
|---|---|
| `type` | `'unclosed-eof'`, `'mismatched-close'`, or `'phantom-close'` |
| `tag` | Name of the tag that caused the problem |
| `expected` | What the parser expected (`null` for `unclosed-eof`) |
| `line`, `col`, `index` | Position of the **opening** tag |

---

## HTML Preset

The `'html'` shorthand enables all three relaxed behaviours and registers standard HTML void elements (`br`, `img`, `input`, `meta`, etc.) in `tags.unpaired`:

```javascript
const parser = new XMLParser({ autoClose: 'html' });
```

Equivalent to:

```javascript
new XMLParser({
  autoClose: {
    onEof:         'closeAll',
    onMismatch:    'discard',
    collectErrors: true,
  },
  tags: {
    unpaired: ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
               'link', 'meta', 'param', 'source', 'track', 'wbr'],
  },
});
```

Any `tags.unpaired` values you add yourself are **merged** with the HTML void elements, not replaced.

```javascript
const parser = new XMLParser({ autoClose: 'html', skip: { attributes: false } });
parser.parse('<html><head><meta charset="UTF-8"></head><body><p>Line one<br>Line two</body></html>');
// Parses successfully
```

---

## Common Combinations

```javascript
// Stream/truncation recovery only
{ autoClose: { onEof: 'closeAll' } }

// Lenient about mismatches, strict at EOF
{ autoClose: { onMismatch: 'recover' } }

// Fully lenient with error log
{ autoClose: { onEof: 'closeAll', onMismatch: 'recover', collectErrors: true } }
```

---

## Works with all input modes

`autoClose` works identically with `parse()`, `parseStream()`, and `feed()`/`end()`. Errors are attached to the result returned by `end()`.

```javascript
parser.feed('<root><a>');
parser.feed('<b>hello</b>');
const result = parser.end();
// result.root.a.b === 'hello'
// parser.getParseErrors() → [{ type: 'unclosed-eof', tag: 'a', ... }]
```

---

➡ Next: [08 — Security](./08-security.md)
