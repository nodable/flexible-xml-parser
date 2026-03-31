
Preserves full document order. 

Input
```xml
<root>
  <child>hello</child>
  <child>world</child>
</root>
```

OrderedOutputBuilder
```js
[
    {
        "root": [
            {
                "child": [
                    {
                        "#text": "hello"
                    }
                ]
            },
            {
                "child": [
                    {
                        "#text": "world"
                    }
                ]
            }
        ]
    }
]
```

NodeTreeBuilder
```js
{
  "tagname": "root",
  "child": [
    {
      "tagname": "child",
      "child": [
        {
          "#text": "hello"
        }
      ]
    },
    {
      "tagname": "child",
      "child": [
        {
          "#text": "world"
        }
      ]
    }
  ]
}

```

How to use
```js


const parserOptions = {}
const parser = new XMLParser({
    OutputBuilder: new NodeTreeBuilder(builderOptions),
    ...parserOptions,
  });

const result = parser.parse(input);

```


### Compact Leaf

Collapse a pure-text or stop-node leaf to `{ tagName: value }` instead of the full Node structure `{ tagname, child: [{ '#text': value }] }`. Conditions for compaction (all must hold):
  1. `compactLeaf` builder option is true.
  2. Node has no attributes — a node with attributes cannot be represented as a plain scalar value.
  3. One of:
      a. Exactly one child that is a pure text entry { '#text': value }. This is the standard leaf case. Stop nodes that have content also satisfy this condition because addValue() already pushed a '#text' child before closeElement() is called.
      b. Zero children AND the node is a stop node (empty raw content between the stop-node tags).
      c. Zero children AND not a stop node — self-closing or empty open/close tag with no text — collapses to the empty string "".


```js
const parserOptions = {}
const parser = new XMLParser({
    OutputBuilder: new NodeTreeBuilder(builderOptions),
    ...parserOptions,
    compactLeaf: true
  });

const result = parser.parse("<root><child>hello</child><child>world</child></root>");

```

Output
```
```

### Stop Node
```js
const parserOptions = { stopNode : "..child" }
const parser = new XMLParser({
    OutputBuilder: new NodeTreeBuilder(builderOptions),
    ...parserOptions,
  });

const result = parser.parse("<root><child>hello</child><child>world</child></root>");

```

Output
```
```

---

- `attributes.groupBy` doesn't work as attributes are always grouped by a special property `:@`.

```js
const options = { attributes: { prefix: "attr_", groupBy: "always_ignored" }, skip: { attributes: false } }

const input = `<root><t foo="bar"/></root>`
```

Output
```
{
  "tagname": "root",
  "child": [
    {
      "tagname": "t",
      "child": [],
      ":@": {
        "attr_foo": "bar"
      }
    }
  ]
}

```