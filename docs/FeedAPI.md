# Feed API

> **See [StreamingAPI.md](./StreamingAPI.md) for the full documentation**
> covering `feed()`/`end()`, `parseStream()`, and the `feedable` options group.

## Quick reference

```js
// Incremental feeding
const parser = new XMLParser(options);
parser.feed('<root>');
parser.feed('<item>value</item>');
parser.feed('</root>');
const result = parser.end();

// Node.js stream
const result = await parser.parseStream(fs.createReadStream('file.xml'));
```

Chunk boundaries may fall anywhere — mid tag-name, mid CDATA, mid attribute.
