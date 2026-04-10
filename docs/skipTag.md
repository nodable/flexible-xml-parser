# Skip Tags

If you want a tag to be skipped from output, you can use `skipTags` option.

---

## Basic usage

```js
const parser = new XMLParser({
  tags: {
    skip: { tags: [
      "..script",        // any <script> tag at any depth
      "root.raw",        // only <raw> directly inside <root>
    ]}
  }
});
```

String entries use the **default enclosure set** (`xmlEnclosures`) — see below.

---

## Default skipping behaviour

By default (for plain string and `Expression` entries), `skipEnclosures` is empty. It means, parser by default look for closing matching tag which may appear in a comment, quotes, cdata or anywhere. To change this behavior you should provide `skipEnclosures` array.  

So for example, `<!-- </script> -->` inside a skip tag does **not** end the `<script>` collection.

---

## Per-node enclosure control with `skipEnclosures`

Each entry can be an object with an explicit `skipEnclosures` array instead of a plain string.  This lets you control exactly which enclosures are respected, on a per-tag basis.

```js
import { xmlEnclosures, quoteEnclosures } from '@nodable/flexible-xml-parser';

const parser = new XMLParser({
  tags: {
    skip : { tags: [
      // plain string — uses xmlEnclosures by default
      "..script",

      // object form — explicit enclosures
      { expression: "body..pre",   skipEnclosures: [...xmlEnclosures] },
      { expression: "head..style", skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] },

      // opt out of all enclosure skipping (plain first-match: first </tag> wins)
      { expression: "root.raw",    skipEnclosures: [] },
    ]}
  }
});
```

### `skipEnclosures` is an array of `{ open, close }` pairs

```js
import { xmlEnclosures, quoteEnclosures } from '@nodable/flexible-xml-parser';

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

Enclosures are checked in **array order**. The first match wins. Once inside an enclosure, no other enclosure or closing-tag detection runs until the close marker is found.

---

## Pre-compiled `Expression` objects

`Expression` instances from `path-expression-matcher` are also accepted and behave identically to plain strings (they use `xmlEnclosures` by default):

```js
import { Expression } from 'path-expression-matcher';

const parser = new XMLParser({
  tags: {
    skip: { tags: [
      new Expression("..script"),           // uses xmlEnclosures by default
      new Expression("..div[class=code]"),  // attribute condition — also uses xmlEnclosures
    ]}
  }
});
```

To use a custom enclosure set with an `Expression`, wrap it in an object:

```js
{ expression: new Expression("..script"), skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] }
```

---

## Depth tracking

You need to set `nested:true` to enable **depth tracking**. When enabled, nested
same-name tags are considered while looking for closing tag.

```js
const xmlData = `<root>
      <stopNode>
        <data>level 1</data>
        <stopNode>
          <data>level 2 - nested stopNode</data>
        </stopNode>
        <data>back to level 1</data>
      </stopNode>
    </root>`;

    const parser = new XMLParser({
      tags: {
        skip: {tags: [{ expression: "root.stopNode", nested: true }]}
      }
    });
```

output:
```js
{
  "root": {}
}
```