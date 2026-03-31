
import { Expression } from "path-expression-matcher";
import XMLParser from "../src/XMLParser.js";
import { runAcrossAllInputSources, runAcrossAllInputSourcesWithException } from "./helpers/testRunner.js";


describe("Temp", function () {

  it("BUG: skip.declaration: true should omit ?xml from output (currently broken)", function () {
    const parser = new XMLParser({ skip: { declaration: true } });
    parser.feed(`<ro`);
    parser.feed(`ot/>`);
    const result = parser.end();
    console.log(result);//{ root: '' }
  });

  fit("should stop at multiple stop nodes with feesable input source", function () {
    const xmlData = `
    
    <root>
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
        stopNodes: [{ expression: "root.stopNode", nested: true }]
      }
    });
    // for (let i = 0; i < xmlData.length; i++) {
    //   const ch = xmlData[i];
    //   parser.feed(ch);
    // }
    // console.log("feed complete")
    // const result = parser.end();

    const result = parser.parse(xmlData);
    console.log(JSON.stringify(result, null, 2))
  });


  it("BUG: skip.declaration: true should omit ?xml from output (currently broken)", function () {
    const xmlData = `<a><b>abc<!-- </b> --><b/></a>`;

    const parser = new XMLParser({ tags: { stopNodes: ["a.b"] } });
    for (let i = 0; i < xmlData.length; i++) {
      const ch = xmlData[i];
      parser.feed(ch);
    }
    const result = parser.end();
    // const result = parser.parse(xmlData);
    console.log(result);//{ root: 'hello' }
  });
});