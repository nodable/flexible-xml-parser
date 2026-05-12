
import { Expression } from "path-expression-matcher";
import XMLParser from "../src/XMLParser.js";
import { runAcrossAllInputSources, runAcrossAllInputSourcesWithException } from "./helpers/testRunner.js";
import { skip } from "node:test";
// import OutputBuilder from "@nodable/compact-builder";
//import { NodeTreeBuilder } from "@nodable/node-tree-builder";


describe("Temp", function () {

  it("BUG: skip.declaration: true should omit ?xml from output (currently broken)", function () {
    const parser = new XMLParser({ skip: { declaration: true } });
    parser.feed(`<ro`);
    parser.feed(`ot/>`);
    const result = parser.end();
    console.log(result);//{ root: '' }
  });

  fit("should stop at multiple stop nodes with feesable input source", function () {
    const xmlData = `<rootNode abc='\t23' />`;

    const parser = new XMLParser({
      skip: { attributes: false },
      //OutputBuilder: new NodeTreeBuilder()
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