import XMLParser from "../src/XMLParser.js";
import {
  runAcrossAllInputSources,
  frunAcrossAllInputSources,
  runAcrossAllInputSourcesWithException
} from "./helpers/testRunner.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. XML declaration (<?xml ... ?>)
// ─────────────────────────────────────────────────────────────────────────────
describe("Processing Instructions — XML declaration", function () {

  runAcrossAllInputSources(
    "should include XML declaration in output by default",
    `<?xml version="1.0"?><root><tag>value</tag></root>`,
    (result) => {
      expect(result["?xml"]).toBeDefined();
      expect(result.root.tag).toBe("value");
    }
  );

  runAcrossAllInputSources(
    "should capture declaration attributes when skip.attributes is false",
    `<?xml version="1.0" encoding="UTF-8"?><root/>`,
    (result) => {
      expect(result["?xml"]["@_version"]).toBe(1.0);
      expect(result["?xml"]["@_encoding"]).toBe("UTF-8");
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should keep declaration version as raw string when valueParsers is empty",
    `<?xml version="1.0"?><root/>`,
    (result) => {
      expect(result["?xml"]["@_version"]).toBe("1.0");
    },
    { skip: { attributes: false }, attributes: { valueParsers: [] } }
  );

  // NOTE: skip.declaration is currently not working as expected due to a bug
  // in XmlSpecialTagsReader.js. The tagName returned by readPiExp is "xml"
  // (without the leading "?"), so the check `tagExp.tagName === "?xml"` always
  // fails — addDeclaration() is never called, addInstruction("?xml") is always used,
  // and skip.declaration: true has no effect. This test documents the BUG:
  it("BUG: skip.declaration: true should omit ?xml from output (currently broken)", function () {
    const parser = new XMLParser({ skip: { declaration: true } });
    const result = parser.parse(`<?xml version="1.0"?><root/>`);
    expect(result["?xml"]).toBeUndefined();
    expect(result.root).toBe("");
  });

});


// ─────────────────────────────────────────────────────────────────────────────
// 2. Other processing instructions
// ─────────────────────────────────────────────────────────────────────────────
describe("Processing Instructions — non-declaration PI tags", function () {

  runAcrossAllInputSources(
    "should include PI tags in output by default",
    `<?xml version="1.0"?><?xml-stylesheet href="style.css"?><root/>`,
    (result) => {
      expect(result["?xml-stylesheet"]).toBeDefined();
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should capture PI tag attributes",
    `<?xml-stylesheet href="mystyle.xslt" type="text/xsl"?><root/>`,
    (result) => {
      expect(result["?xml-stylesheet"]["@_href"]).toBe("mystyle.xslt");
      expect(result["?xml-stylesheet"]["@_type"]).toBe("text/xsl");
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should handle PI tag with no attributes",
    `<?xml version="1.0"?><?mso-contentType?><root/>`,
    (result) => {
      expect(result["?mso-contentType"]).toBeDefined();
      expect(result["?mso-contentType"]).toBe("");
    }
  );

  runAcrossAllInputSources(
    "should handle PI tag name containing a hyphen",
    `<?xml-stylesheet href="a.css"?><root/>`,
    (result) => {
      expect(result["?xml-stylesheet"]).toBeDefined();
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should handle multiple PI tags before root element",
    `<?xml version="1.0"?><?pi1 a="1"?><?pi2 b="2"?><root/>`,
    (result) => {
      expect(result["?xml"]).toBeDefined();
      expect(result["?pi1"]["@_a"]).toBe(1);
      expect(result["?pi2"]["@_b"]).toBe(2);
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should handle PI tag appearing inside an element",
    `<root><?proc data="x"?><child>value</child></root>`,
    (result) => {
      expect(result.root["?proc"]).toBeDefined();
      expect(result.root.child).toBe("value");
    },
    { skip: { attributes: false } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 3. skip.pi — suppressing non-declaration PI tags
// ─────────────────────────────────────────────────────────────────────────────
describe("Processing Instructions — skip.pi", function () {

  runAcrossAllInputSources(
    "should omit non-declaration PI tags when skip.pi: true",
    `<?xml version="1.0"?><?xml-stylesheet href="a.css"?><root/>`,
    (result) => {
      expect(result["?xml-stylesheet"]).toBeUndefined();
      expect(result.root).toBe("");
    },
    { skip: { pi: true } }
  );

  runAcrossAllInputSources(
    "should keep XML declaration even when skip.pi: true",
    `<?xml version="1.0"?><?ignored data="x"?><root/>`,
    (result) => {
      // Declaration is always kept when skip.pi: true (only non-xml PIs are skipped)
      expect(result["?xml"]).toBeDefined();
      expect(result["?ignored"]).toBeUndefined();
    },
    { skip: { pi: true } }
  );

  runAcrossAllInputSources(
    "should omit all non-declaration PI tags when skip.pi: true",
    `<?xml version="1.0"?><?pi1 a="1"?><?pi2 b="2"?><root/>`,
    (result) => {
      expect(result["?pi1"]).toBeUndefined();
      expect(result["?pi2"]).toBeUndefined();
      expect(result.root).toBe("");
    },
    { skip: { pi: true } }
  );

  runAcrossAllInputSources(
    "should omit PI tags inside elements when skip.pi: true",
    `<root><?proc data="x"?><child>value</child></root>`,
    (result) => {
      expect(result.root["?proc"]).toBeUndefined();
      expect(result.root.child).toBe("value");
    },
    { skip: { pi: true } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 4. Boolean (valueless) attributes in PI tags
// ─────────────────────────────────────────────────────────────────────────────
describe("Processing Instructions — boolean attributes", function () {

  runAcrossAllInputSources(
    "should treat valueless PI attributes as true when booleanType: true",
    `<?textinfo whitespace standalone?><root/>`,
    (result) => {
      expect(result["?textinfo"]["@_whitespace"]).toBe(true);
      expect(result["?textinfo"]["@_standalone"]).toBe(true);
    },
    { skip: { attributes: false }, attributes: { booleanType: true } }
  );

  runAcrossAllInputSources(
    "should mix valued and valueless PI attributes",
    `<?proc version="2" debug standalone?><root/>`,
    (result) => {
      expect(result["?proc"]["@_version"]).toBe(2);
      expect(result["?proc"]["@_debug"]).toBe(true);
      expect(result["?proc"]["@_standalone"]).toBe(true);
    },
    { skip: { attributes: false }, attributes: { booleanType: true } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 5. Malformed PI tags
// ─────────────────────────────────────────────────────────────────────────────
describe("Processing Instructions — malformed PI", function () {

  runAcrossAllInputSourcesWithException(
    "should throw when PI tag is not closed",
    `<?xml version="1.0"?><?pi  `,
    /Unexpected closing of source/
  );

});
