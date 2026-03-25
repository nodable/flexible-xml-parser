# Streaming and Incremental Parsing

flex-xml-parser supports three ways to provide XML input, all using the same
parser internals and producing identical output.

| API | Input | Output | Use when |
|-----|-------|--------|----------|
| `parse(string\|Buffer)` | Complete document in memory | JS object (sync) | Document already loaded |
| `feed(chunk)` / `end()` | Incremental chunks, you control the loop | JS object (sync on `end()`) | Custom data sources, WebSockets, `fetch` body |
| `parseStream(readable)` | Node.js Readable stream | `Promise<JS object>` | Files, HTTP responses, piped data |

---

## `parseStream(readable)` — Node.js streams

```js
import { XMLParser } from 'flex-xml-parser';
import { createReadStream } from 'fs';

const parser = new XMLParser(options);
const result = await parser.parseStream(createReadStream('large.xml'));
```

The parser advances incrementally on each `'data'` event.
Already-consumed bytes are freed before the next chunk arrives, so memory
stays proportional to the size of the largest single token (a tag, CDATA
section, etc.) rather than the total document size.

### Error handling

```js
try {
  const result = await parser.parseStream(readable);
} catch (err) {
  // ParseError  — malformed XML, limit exceeded, buffer overflow
  // native Error — stream 'error' event forwarded as-is
}
```

If the stream emits an `'error'` event the Promise rejects with that error.
If the XML is malformed the Promise rejects with a `ParseError`.

---

## `feed(chunk)` / `end()` — manual incremental feeding

Use when you control the data loop yourself — for example reading from a
`fetch` response body, a WebSocket, or any other async source.

```js
const parser = new XMLParser(options);

// Feed any number of string or Buffer chunks
parser.feed('<root>');
parser.feed('<item>value</item>');
parser.feed('</root>');

// Finalise and get the result
const result = parser.end();
```

`feed()` returns `this` so calls can be chained:

```js
const result = parser.feed(a).feed(b).feed(c).end();
```

### With a `fetch` response

```js
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

Chunks may split anywhere — mid tag-name, mid attribute value, mid text node,
mid CDATA, mid comment.  The parser handles all cases correctly because data
is accumulated in an internal buffer before parsing proceeds.

```js
// All of these work fine
parser.feed('<ro');   parser.feed('ot/>');           // mid tag-name
parser.feed('<![CDATA[hel'); parser.feed('lo]]>');  // mid CDATA
parser.feed('<a id="he'); parser.feed('llo">');      // mid attribute
```

### Parser reuse

A single `XMLParser` instance can be used for multiple sequential
feed/end sessions:

```js
const parser = new XMLParser(options);

parser.feed(xml1);
const r1 = parser.end();

parser.feed(xml2);
const r2 = parser.end();
```

---

## `feedable` options

Both `feed()`/`end()` and `parseStream()` share a buffer managed by
`FeedableSource` / `StreamSource`.  Configure it with the `feedable` group:

```js
new XMLParser({
  feedable: {
    maxBufferSize:  50 * 1024 * 1024, // 50 MB (default: 10 MB)
    autoFlush:      true,              // default: true
    flushThreshold: 4096,             // default: 1024 (1 KB)
  }
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `maxBufferSize` | `10485760` (10 MB) | Maximum characters in the buffer at once. Throws `ParseError` with code `INVALID_INPUT` if exceeded. |
| `autoFlush` | `true` | Automatically discard already-processed characters when the processed portion grows past `flushThreshold`. Keeps memory bounded during long parse sessions. |
| `flushThreshold` | `1024` | Processed-character count that triggers an auto-flush. Lower values free memory sooner; higher values reduce string-slice frequency. |

For most use cases the defaults are fine.  Increase `maxBufferSize` only if
a single XML token (one tag, one CDATA block, one attribute value) exceeds
10 MB — the buffer needs to hold at least that much to parse without error.

---

## Memory characteristics

### `parse(string|Buffer)`

The whole document is in memory as both the input string and the output
JS object.  Peak memory ≈ 2× document size.

### `feed()`/`end()`

The whole document accumulates in the `FeedableSource` buffer before
`end()` triggers parsing.  For memory, this is equivalent to `parse()`.
The benefit is that *you* control when chunks arrive — the parser does not
need the full document upfront.

### `parseStream()`

This is the low-memory path.  Each chunk is parsed immediately after it
arrives and the processed portion is freed before the next chunk is read.
At steady state the buffer holds:
- The current in-flight chunk, plus
- Any incomplete token that straddles the chunk boundary (typically a few
  bytes of a tag name or attribute value)

**Output memory is separate.**  The JS object returned by `getOutput()`
still holds the complete parsed result.  For documents where the output
itself is too large to hold in memory, use a custom `OutputBuilder` that
streams results to another destination (file, database, etc.) and returns
`null` from `getOutput()`:

```js
class WriteToDatabaseBuilder extends BaseOutputBuilder {
  addTag(tag)   { /* open record */ }
  closeTag()    { /* flush record to DB */ }
  addValue(v)   { /* accumulate field value */ }
  getOutput()   { return null; } // nothing to return — already written
}

const result = await new XMLParser({
  OutputBuilder: new WriteToDatabaseBuilder()
}).parseStream(createReadStream('huge.xml'));
// result === null; data is in the database
```

See [CustomOutputBuilder.md](./CustomOutputBuilder.md) for details on
implementing custom output builders.

---

## API reference

### `parser.parseStream(readable): Promise<any>`

| | |
|-|---|
| **Parameter** | `readable` — any Node.js `Readable` stream |
| **Returns** | `Promise` that resolves with the parsed JS object |
| **Rejects** | `ParseError` (malformed XML / limit exceeded) or the stream's own error |

### `parser.feed(data): this`

| | |
|-|---|
| **Parameter** | `data` — `string` or `Buffer` |
| **Returns** | `this` (chainable) |
| **Throws** | `ParseError` with code `DATA_MUST_BE_STRING` for non-string/Buffer input |
| **Throws** | `ParseError` with code `INVALID_INPUT` if `feedable.maxBufferSize` is exceeded |

### `parser.end(): any`

| | |
|-|---|
| **Returns** | Parsed JS object |
| **Throws** | `ParseError` with code `NOT_STREAMING` if called before any `feed()` |
| **Throws** | `ParseError` on any well-formedness or limit violation |
