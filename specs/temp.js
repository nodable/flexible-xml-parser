
import XMLParser from "../src/XMLParser.js";
import { runAcrossAllInputSources, runAcrossAllInputSourcesWithException } from "./helpers/testRunner.js";


describe("Temp", function () {

  fit("BUG: skip.declaration: true should omit ?xml from output (currently broken)", function () {
    const parser = new XMLParser({ skip: { declaration: true } });
    const result = parser.parse(`<?xml version="1.0"?><root/>`);
    // console.log(result);
    expect(result["?xml"]).toBeUndefined();
    expect(result.root).toBe("");
  });
});