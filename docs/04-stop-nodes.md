# 04 — Stop Nodes & Skip Tags

---

## Stop Nodes

A **stop node** is a tag whose inner content is captured as a raw string without any further XML parsing. Useful for `<script>`, `<style>`, embedded HTML, or any tag whose content isn't valid XML.

```javascript
const parser = new XMLParser({
  tags: {
    stopNodes: [
      '..script',   // any <script> tag anywhere in the tree
      'root.raw',   // only <raw> directly inside <root>
    ],
  },
  onStopNode(tagDetail, rawContent, matcher) {
    console.log(tagDetail.name, rawContent);
  },
});
```

The `onStopNode` callback receives the tag details, the captured raw string, and a `ReadOnlyMatcher` for path inspection. If you don't provide a callback the raw content is still available in the output through the output builder.

---

## Default Enclosure Behaviour

By default, stop-node collection ends at the **first matching close tag**, regardless of context. So `<!-- </script> -->` inside a stop node will end the `<script>` collection unless you tell the parser to skip XML comments.

To control this, use the object form with `skipEnclosures`:

```javascript
import { xmlEnclosures, quoteEnclosures } from '@nodable/flexible-xml-parser';

const parser = new XMLParser({
  tags: {
    stopNodes: [
      // plain string — ends at first </script>
      '..script',

      // skip XML comments and CDATA when looking for the close tag
      { expression: 'body..pre',   skipEnclosures: [...xmlEnclosures] },

      // skip XML + quote enclosures (good for <style> with string literals)
      { expression: 'head..style', skipEnclosures: [...xmlEnclosures, ...quoteEnclosures] },

      // explicitly no skipping
      { expression: 'root.raw',    skipEnclosures: [] },
    ],
  },
});
```

`xmlEnclosures` covers XML comments (`<!-- -->`) and CDATA (`<![CDATA[...]]>`).  
`quoteEnclosures` covers single quotes, double quotes, and template literals.

---

## Skip Tags

**Skip tags** drop a tag and its entire subtree from the output silently. Content is consumed but never forwarded to the output builder.

```javascript
const parser = new XMLParser({
  skip: {
    tags: [
      '..script',   // drop all <script> tags anywhere
      'root.debug', // drop <debug> only inside <root>
    ],
  },
});
```

Like stop nodes, entries can be plain strings or objects with `skipEnclosures`:

```javascript
import { xmlEnclosures } from '@nodable/flexible-xml-parser';

skip: {
  tags: [
    '..script',
    { expression: 'body..pre', skipEnclosures: [...xmlEnclosures] },
  ],
}
```

---

## Stop Node vs Skip Tag

| | Stop node | Skip tag |
|---|---|---|
| Content captured? | Yes — as raw string | No — silently discarded |
| Callback available? | Yes — `onStopNode` | No |
| Use when | You need the raw inner text | You want to ignore a subtree entirely |

---

## Path Expression Syntax

Both `stopNodes` and `skip.tags` use path expression strings. Key patterns:

| Pattern | Matches |
|---|---|
| `'..tag'` | Any `<tag>` at any depth |
| `'root.tag'` | `<tag>` directly inside `<root>` |
| `'*.tag'` | `<tag>` as a direct child of any parent |
| `'root..tag'` | `<tag>` anywhere inside `<root>` |
| `'tag[attr=val]'` | `<tag>` with a specific attribute value |

See [09-path-expressions.md](./09-path-expressions.md) for the full syntax reference.

---

➡ Next: [05 — Output Builders](./05-output-builders.md)
