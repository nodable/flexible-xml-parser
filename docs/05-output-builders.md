# 05 — Output Builders

Output builders control the shape of the parsed result. The parser tokenises XML and calls the builder's methods — the builder decides what data structure to build.

Builders live in separate packages so you only install what you need.

---

## Available Builders

| Package | Builder | Output shape |
|---|---|---|
| `@nodable/compact-builder` | `CompactBuilderFactory` | JS object (default, like fast-xml-parser) |
| `@nodable/sequential-builder` | `SequentialBuilderFactory` | Ordered key-value array, preserves document order |
| `@nodable/sequential-stream-builder` | `SequentialStreamBuilderFactory` | Same as sequential but streams output |
| `@nodable/node-tree-builder` | `NodeTreeBuilderFactory` | Uniform AST node tree |
| `@nodable/base-output-builder` | `BaseOutputBuilder` | Base class for custom builders |

---

## CompactBuilder (default)

Produces a compact JS object. When a tag appears once it becomes a value; when it appears multiple times it becomes an array. This is the default when no `OutputBuilder` is specified.

```javascript
import { CompactBuilderFactory } from '@nodable/compact-builder';

const builder = new CompactBuilderFactory({
  alwaysArray:   ['..item', '..book'],   // always wrap these tags in arrays
  forceArray:    (matcher, isLeafNode) => matcher.path().endsWith('.product'),
  forceTextNode: false,    // when true, text-only tags always use { '#text': val }
  textJoint:     '',       // join string for multiple text nodes in one tag
});

new XMLParser({ OutputBuilder: builder });
```

### `alwaysArray`

Force specific tag paths to always be arrays, even if there's only one occurrence — prevents code from breaking when XML structure changes from single to multiple elements.

```javascript
alwaysArray: ['..item', new Expression('catalog.book')]
```

### `forceArray`

Function-based array forcing for more complex conditions:

```javascript
forceArray: (matcher, isLeafNode) => {
  return matcher.path().endsWith('catalog.book');
}
```

If either `alwaysArray` or `forceArray` returns true for a tag, it becomes an array.

### `forceTextNode`

When `true`, text-only tags always produce `{ '#text': value }` instead of a plain string value — useful for uniform property access:

```javascript
// forceTextNode: false (default)
parser.parse('<item>Value</item>');
// { item: 'Value' }

// forceTextNode: true
// { item: { '#text': 'Value' } }
```

---

## SequentialBuilder

Preserves full document order. Every element becomes an array entry. Useful for round-trip serialisation where element order matters.

```javascript
import { SequentialBuilderFactory } from '@nodable/sequential-builder';

new XMLParser({ OutputBuilder: new SequentialBuilderFactory() });
```

Input:
```xml
<root>
  <child>hello</child>
  <child>world</child>
</root>
```

Output:
```json
[
  { "root": [
    { "child": [{ "#text": "hello" }] },
    { "child": [{ "#text": "world" }] }
  ]}
]
```

---

## NodeTreeBuilder

Produces a uniform AST-style node tree. Every node has a consistent structure with `tagname` and `child` properties, making tree traversal predictable.

```javascript
import { NodeTreeBuilderFactory } from '@nodable/node-tree-builder';

new XMLParser({ OutputBuilder: new NodeTreeBuilderFactory() });
```

Output for `<root><child>hello</child></root>`:
```json
{
  "tagname": "root",
  "child": [
    {
      "tagname": "child",
      "child": [{ "#text": "hello" }]
    }
  ]
}
```

Attributes are always grouped under `:@` (the `attributes.groupBy` option is ignored):

```json
{
  "tagname": "t",
  "child": [],
  ":@": { "@_foo": "bar" }
}
```

---

## Custom Output Builder

Extend `BaseOutputBuilder` from `@nodable/base-output-builder` to build any custom output. The four methods you can override:

| Method | Called when | Common use |
|---|---|---|
| `addElement(tag, matcher)` | Opening tag | Rename or skip tags |
| `closeElement(matcher)` | Closing tag | Finalise a tag's value |
| `addAttribute(name, value)` | Each attribute | Rename, drop, or transform attributes |
| `addValue(text, matcher)` | Text content | Transform text values |
| `getOutput()` | After parsing completes | Return the result |

### Minimal example

```javascript
import { BaseOutputBuilder } from '@nodable/base-output-builder';

class TagListBuilder extends BaseOutputBuilder {
  constructor() {
    super();
    this.tags = [];
  }
  addElement(tag) { this.tags.push(tag.name); }
  getOutput() { return this.tags; }
}

new XMLParser({ OutputBuilder: new TagListBuilder() });
// Returns array of all tag names encountered
```

### Extending CompactBuilder

Subclass `CompactBuilder` to add behaviour while keeping normal object output:

```javascript
import { CompactBuilder } from '@nodable/compact-builder';

class LowerCaseTagBuilder extends CompactBuilder {
  addElement(tag, matcher) {
    super.addElement({ ...tag, name: tag.name.toLowerCase() }, matcher);
  }
}
```

> Always spread `tag` (`{ ...tag, name }`) rather than mutating `tag.name` directly.

### Common patterns

**Rename tags:**
```javascript
addElement(tag, matcher) {
  const name = tag.name === 'Person' ? 'person' : tag.name;
  super.addElement({ ...tag, name }, matcher);
}
```

**Skip a tag and its subtree:**
```javascript
constructor(...args) {
  super(...args);
  this._skipDepth = 0;
}
addElement(tag, matcher) {
  if (this._skipDepth > 0 || tag.name === 'internal') {
    this._skipDepth++;
    return; // omit super — tag is suppressed
  }
  super.addElement(tag, matcher);
}
closeElement(matcher) {
  if (this._skipDepth > 0) { this._skipDepth--; return; }
  super.closeElement(matcher);
}
```

**Write to database instead of returning an object:**
```javascript
class DbWriter extends BaseOutputBuilder {
  addElement(tag)   { /* open record */ }
  closeElement()    { /* flush to DB */ }
  addValue(v)       { /* accumulate field */ }
  getOutput()       { return null; }  // nothing to return
}
const result = await new XMLParser({ OutputBuilder: new DbWriter() })
  .parseStream(createReadStream('huge.xml'));
// result === null; data is in the database
```

See [CustomOutputBuilder.md](../docs/CustomOutputBuilder.md) (in the original docs) for more examples.

---

➡ Next: [06 — Streaming & Feed API](./06-streaming.md)
