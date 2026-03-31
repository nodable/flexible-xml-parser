import XMLParser from "../../src/XMLParser.js";
import NodeTreeBuilder from "../../src/OutputBuilders/NodeTreeBuilder.js";

const builderOptions = {}
const parserOptions = {}

const parser = new XMLParser({
  OutputBuilder: new NodeTreeBuilder(builderOptions),
  ...parserOptions,
});

const xmlData = `
<root>
  <child>hello</child>
  <child>world</child>
</root>` ;

const result = parser.parse(xmlData);

console.log(JSON.stringify(result, null, 2));