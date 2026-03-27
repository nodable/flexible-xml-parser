

### 1. `forceArray` Option

**Type:** `function(matcher, isLeafNode) => boolean`

Forces specific XML tags to always be represented as arrays, even when only a single occurrence exists. This ensures consistent data structures in your parsed output.

**Key Benefits:**

- Prevents code breaking when XML structure changes (single → multiple elements)
- Simplifies array processing logic in consuming code
- Supports path-based, attribute-based, and leaf-node-based decisions

```js
const inputXml = `<catalog><book>Title</book></catalog>`;

const parser = new XMLParser({
  OutputBuilder: new JsObjOutputBuilder({
    forceArray: (matcher, isLeafNode) => {
      return matcher.path.endsWith('catalog.book');
    }
  }),
});

const result = parser.parse(inputXml);
```

Output
```json
{
  "catalog": {
    "book": [
      {
        "title": "Title"
      }
    ]
  }
}
```

### 2. `forceTextNode` Option

**Type:** `boolean`

Forces creation of a text node object for every tag, ensuring consistent object structure instead of mixing strings and objects.

**Key Benefits:**

- Uniform property access patterns (`item["#text"]` always works)
- Easier to serialize/deserialize
- Consistent structure across all tags


```js
const inputXml = `<item>Value</item>`;

const parser = new XMLParser({
  OutputBuilder: new JsObjOutputBuilder({
    forceTextNode: true //false by default
  }),
});

const result = parser.parse(inputXml);

// Without option: { item: "Value" }
// With option: { item: { "#text": "Value" } }
```

Output
```js
{ item: { "#text": "Value" } }
```