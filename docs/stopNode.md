# Stop Nodes

A **stop node** is a tag whose content is captured as a raw string without any further XML parsing.
This is useful for tags like `<script>`, `<style>`, or `<pre>` where the content may contain
characters or constructs that would confuse the XML parser.

---

## Basic usage

```js
const parser = new XMLParser({
  tags: {
    stopNodes: [
      "..script",        // any <script> tag at any depth
      "root.raw",        // only <raw> directly inside <root>
    ]
  }
});
```

String entries use the **default enclosure set** (`xmlEnclosures`) — see below.

---

## Default skipping behaviour

By default (for plain string and `Expression` entries), `skipEnclosures` is empty. It means, parser by default look for closing stop tag which may appear in a comment, quotes, cdata or anywhere. To change this behavior you should provide `skipEnclosures` array.  

So for example, `<!-- </script> -->` inside a stop node does **not** end the `<script>` collection.

---

## Per-node enclosure control with `skipEnclosures`

Each stop-node entry can be an object with an explicit `skipEnclosures` array instead of a plain
string.  This lets you control exactly which enclosures are respected, on a per-tag basis.

```js
import { xmlEnclosures, quoteEnclosures } from 'flex-xml-parser';

const parser = new XMLParser({
  tags: {
    stopNodes: [
      // plain string — uses xmlEnclosures by default
      "..script",

      // object form — explicit enclosures
      { expression: "body..pre",   skipEnclosures: [...xmlEnclosures] },
      { expression: "head..style", skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] },

      // opt out of all enclosure skipping (plain first-match: first </tag> wins)
      { expression: "root.raw",    skipEnclosures: [] },
    ]
  }
});
```

### `skipEnclosures` is an array of `{ open, close }` pairs

```js
import { xmlEnclosures, quoteEnclosures } from 'flex-xml-parser';

// xmlEnclosures — XML structural delimiters (the default)
const xmlEnclosures = [
  { open: '<!--',      close: '-->'  },   // comment
  { open: '<![CDATA[', close: ']]>' },    // CDATA section
  { open: '<?',        close: '?>'  },    // processing instruction
];

// quoteEnclosures — string literals (useful for JS / CSS content)
const quoteEnclosures = [
  { open: "'",  close: "'"  },
  { open: '"',  close: '"'  },
  { open: '`',  close: '`'  },   // template literal
];
```

You can compose freely:

```js
// Add CSS block-comment support on top of the standard set
{ expression: "head..style", skipEnclosures: [...xmlEnclosures, ...quoteEnclosures, { open: '/*', close: '*/' }] }
```

### Enclosure precedence

Enclosures are checked in **array order**. The first match wins. Once inside an enclosure,
no other enclosure or closing-tag detection runs until the close marker is found.

---

## Pre-compiled `Expression` objects

`Expression` instances from `path-expression-matcher` are also accepted and behave identically to
plain strings (they use `xmlEnclosures` by default):

```js
import { Expression } from 'path-expression-matcher';

const parser = new XMLParser({
  tags: {
    stopNodes: [
      new Expression("..script"),           // uses xmlEnclosures by default
      new Expression("..div[class=code]"),  // attribute condition — also uses xmlEnclosures
    ]
  }
});
```

To use a custom enclosure set with an `Expression`, wrap it in an object:

```js
{ expression: new Expression("..script"), skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] }
```

---

## `onStopNode` callback

`JsArrBuilder` and `JsObjBuilder` fire an `onStopNode` callback (if supplied) each time a stop
node is fully collected, before its raw content is added to the output tree.  This is useful for
side-channel analysis without post-processing the output.

```js
const scripts = [];

const parser = new XMLParser({
  tags: { stopNodes: ["..script"] },
  onStopNode(tagDetail, rawContent, matcher) {
    // tagDetail: { name, line, col, index }
    // rawContent: raw string between opening and closing tags
    // matcher: read-only path matcher positioned at the stop node
    scripts.push({ tag: tagDetail.name, src: rawContent });
  }
});
```

The callback is informational — its return value is ignored.  To suppress the node from output
entirely, use a custom `OutputBuilder` subclass.

---

## Depth tracking

When `skipEnclosures` is non-empty, **depth tracking** is enabled automatically.  Nested
same-name tags increment the depth counter; the stop node only ends when the matching closing
tag brings the depth back to zero.

```xml
<script>
  var s = document.createElement('script');   <!-- depth still 1 -->
  s.src = 'foo.js';
</script>                                     <!-- depth → 0, collection ends -->
```

When `skipEnclosures: []` (plain mode), depth tracking is **disabled** — the very first
`</tagName>` ends collection regardless of nesting.
