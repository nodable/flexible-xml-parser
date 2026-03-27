import XMLParser from "../../src/XMLParser.js";
import JsArrBuilder from "../../src/OutputBuilders/JsArrBuilder.js";

const builderOptions = {}
const parserOptions = {}

const parser = new XMLParser({
  OutputBuilder: new JsArrBuilder(builderOptions),
  ...parserOptions,
});

const xmlData = `
<root>
  <child>hello</child>
  <child>world</child>
</root>` ;

const result = parser.parse(xmlData);

console.log(JSON.stringify(result, null, 2));