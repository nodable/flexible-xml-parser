there are 4 type of entities

category 1: standard
- default/minimum: supported by XML
- system: system specific like HTML or other.

category 2: user defined
- input: entities which are shared through input. Most dangerous as blackbox. Flexible-xml-parser reads them through DOCTYPE.
- custom/external: an entity replaced or entity value parser let user to set entities externally instead of relying on input.


```js
const evp = new EntitiesValueParser({
  docType: true
});
const builder = new JsObjBuilder();
builder.registerValueParser("entity", evp);

const parser = new XMLParser({
  doctypeOptions: { enabled: true },
  outputBuilder: builder
});
const result = parser.parse(`<!DOCTYPE root [
  <!ENTITY brand "FlexParser">
]><root><name>&brand;</name></root>`);
```