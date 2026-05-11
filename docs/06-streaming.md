# 06 — Streaming & Feed API

Three ways to provide XML input, all using the same parser internals and producing identical output.

| API | Use when |
|---|---|
| `parse(string\|Buffer)` | Document already in memory |
| `feed(chunk)` / `end()` | You control the data loop (WebSocket, `fetch` body, etc.) |
| `parseStream(readable)` | Node.js Readable stream; lowest memory footprint |

---

## `parseStream` — Node.js streams

```javascript
import XMLParser from '@nodable/flexible-xml-parser';
import { createReadStream } from 'fs';

const parser = new XMLParser(options);
const result = await parser.parseStream(createReadStream('large.xml'));
```

Each chunk is parsed immediately as it arrives and already-consumed bytes are freed before the next chunk. Memory at steady state is proportional to the **largest single token** (one tag, one CDATA block), not the total document size.

```javascript
try {
  const result = await parser.parseStream(readable);
} catch (err) {
  // ParseError — malformed XML or limit exceeded
  // native Error — stream 'error' event forwarded as-is
}
```

---

## `feed` / `end` — incremental feeding

Use when you control the data loop:

```javascript
const parser = new XMLParser(options);

parser.feed('<root>');
parser.feed('<item>value</item>');
parser.feed('</root>');

const result = parser.end();
```

`feed()` returns `this`, so calls can be chained:

```javascript
const result = parser.feed(a).feed(b).feed(c).end();
```

### With `fetch` body

```javascript
const response = await fetch('https://example.com/data.xml');
const reader   = response.body.getReader();
const decoder  = new TextDecoder();
const parser   = new XMLParser(options);

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  parser.feed(decoder.decode(value, { stream: true }));
}

const result = parser.end();
```

### Chunk boundaries

Chunks may split anywhere — mid tag-name, mid attribute value, mid CDATA. The parser buffers data internally and handles all split points correctly.

### Reusing a parser instance

```javascript
const parser = new XMLParser(options);

parser.feed(xml1);
const r1 = parser.end();

parser.feed(xml2);
const r2 = parser.end();
```

---

## `feedable` Options

```javascript
new XMLParser({
  feedable: {
    maxBufferSize:  10 * 1024 * 1024,  // 10 MB (default)
    autoFlush:      true,               // free processed chars automatically
    flushThreshold: 1024,              // processed bytes that trigger a flush
    bufferSize: 256                   // size of buffer to be used for parsing
  }
});
```

Increase `maxBufferSize` only if a single XML token exceeds 10 MB.

---

## Memory Characteristics

**`parse(string|Buffer)`** — the whole document is in memory. Peak ≈ 2× document size.

**`feed()`/`end()`** — the full document accumulates in the buffer before `end()` triggers parsing. Equivalent to `parse()` memory-wise; the benefit is that *you* control when chunks arrive.

**`parseStream()`** — the low-memory path. Each chunk is processed and freed before the next arrives. The output object still holds the complete result — for documents where even the output is too large, use a custom `OutputBuilder` that writes directly to a database and returns `null` from `getOutput()`.

---

## API Reference

### `parser.parseStream(readable): Promise<any>`

Rejects with `ParseError` (malformed XML / limit exceeded) or the stream's own error.

### `parser.feed(data): this`

Throws `ParseError` with code `DATA_MUST_BE_STRING` for non-string/Buffer input, or `INVALID_INPUT` if `maxBufferSize` is exceeded.

### `parser.end(): any`

Throws `ParseError` with code `NOT_STREAMING` if called before any `feed()`.

---

➡ Next: [07 — Auto-Close (Lenient HTML)](./07-auto-close.md)
