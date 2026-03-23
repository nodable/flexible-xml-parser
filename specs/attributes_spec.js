import XMLParser from "../src/XMLParser.js";
import { runAcrossAllInputSources } from "./helpers/testRunner.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Default behaviour — attributes skipped
// ─────────────────────────────────────────────────────────────────────────────
describe("Attributes — default behaviour (skip.attributes: true)", function () {

  runAcrossAllInputSources(
    "should ignore all attributes by default",
    `<root><tag id="1" class="main">value</tag></root>`,
    (result) => {
      expect(result.root.tag).toBe("value");
      expect(result.root.tag["@_id"]).toBeUndefined();
    }
  );

  runAcrossAllInputSources(
    "should parse tag text value even when attributes are skipped",
    `<root><item qty="5" unit="kg">sugar</item></root>`,
    (result) => {
      expect(result.root.item).toBe("sugar");
    }
  );

  runAcrossAllInputSources(
    "should handle self-closing tags without attributes being exposed",
    `<root><br class="break"/></root>`,
    (result) => {
      expect(result.root.br).toBe("");
      expect(result.root.br["@_class"]).toBeUndefined();
    }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 2. Enabling attributes — skip.attributes: false
// ─────────────────────────────────────────────────────────────────────────────
describe("Attributes — skip.attributes: false", function () {

  runAcrossAllInputSources(
    "should include attributes with default @_ prefix",
    `<root><tag id="1" class="main">value</tag></root>`,
    (result) => {
      expect(result.root.tag["@_id"]).toBe(1);
      expect(result.root.tag["@_class"]).toBe("main");
      expect(result.root.tag["#text"]).toBe("value");
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should include attributes on self-closing tags",
    `<root><item id="42" label="hello"/></root>`,
    (result) => {
      expect(result.root.item["@_id"]).toBe(42);
      expect(result.root.item["@_label"]).toBe("hello");
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should include attributes on repeated tags (array)",
    `<root><item id="1">a</item><item id="2">b</item></root>`,
    (result) => {
      expect(Array.isArray(result.root.item)).toBe(true);
      expect(result.root.item[0]["@_id"]).toBe(1);
      expect(result.root.item[1]["@_id"]).toBe(2);
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should handle a tag with attributes but no text content",
    `<root><link href="http://example.com" rel="stylesheet"/></root>`,
    (result) => {
      expect(result.root.link["@_href"]).toBe("http://example.com");
      expect(result.root.link["@_rel"]).toBe("stylesheet");
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should handle multiple attributes on root tag",
    `<root version="1.0" lang="en"><child/></root>`,
    (result) => {
      expect(result.root["@_version"]).toBe(1);
      expect(result.root["@_lang"]).toBe("en");
    },
    { skip: { attributes: false } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 3. Attribute prefix and suffix
// ─────────────────────────────────────────────────────────────────────────────
describe("Attributes — prefix and suffix", function () {

  runAcrossAllInputSources(
    "should apply a custom prefix to attribute names",
    `<root><tag id="1">value</tag></root>`,
    (result) => {
      expect(result.root.tag["attr_id"]).toBe(1);
    },
    { skip: { attributes: false }, attributes: { prefix: "attr_" } }
  );

  runAcrossAllInputSources(
    "should apply an empty prefix (no prefix on attribute names)",
    `<root><tag id="1" class="a">value</tag></root>`,
    (result) => {
      expect(result.root.tag["id"]).toBe(1);
      expect(result.root.tag["class"]).toBe("a");
    },
    { skip: { attributes: false }, attributes: { prefix: "" } }
  );

  runAcrossAllInputSources(
    "should apply a suffix to attribute names",
    `<root><tag id="1">value</tag></root>`,
    (result) => {
      expect(result.root.tag["@_id$"]).toBe(1);
    },
    { skip: { attributes: false }, attributes: { prefix: "@_", suffix: "$" } }
  );

  runAcrossAllInputSources(
    "should apply both prefix and suffix together",
    `<root><tag id="1">value</tag></root>`,
    (result) => {
      expect(result.root.tag["[id]"]).toBe(1);
    },
    { skip: { attributes: false }, attributes: { prefix: "[", suffix: "]" } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 4. Attribute groupBy
// ─────────────────────────────────────────────────────────────────────────────
describe("Attributes — groupBy", function () {

  runAcrossAllInputSources(
    "should group all attributes under a named key",
    `<root><tag id="1" class="main">value</tag></root>`,
    (result) => {
      expect(result.root.tag[":@"]).toBeDefined();
      expect(result.root.tag[":@"]["@_id"]).toBe(1);
      expect(result.root.tag[":@"]["@_class"]).toBe("main");
      expect(result.root.tag["#text"]).toBe("value");
    },
    { skip: { attributes: false }, attributes: { groupBy: ":@" } }
  );

  runAcrossAllInputSources(
    "should group attributes under a custom key with empty prefix",
    `<root><item id="42" label="test"/></root>`,
    (result) => {
      expect(result.root.item["attrs"]).toBeDefined();
      expect(result.root.item["attrs"]["id"]).toBe(42);
      expect(result.root.item["attrs"]["label"]).toBe("test");
    },
    { skip: { attributes: false }, attributes: { groupBy: "attrs", prefix: "" } }
  );

  runAcrossAllInputSources(
    "should not create groupBy key when tag has no attributes",
    `<root><empty>text</empty></root>`,
    (result) => {
      expect(result.root.empty).toBe("text");
      expect(result.root.empty[":@"]).toBeUndefined();
    },
    { skip: { attributes: false }, attributes: { groupBy: ":@" } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 5. Boolean (valueless) attributes
// ─────────────────────────────────────────────────────────────────────────────
describe("Attributes — booleanType (valueless attributes)", function () {

  runAcrossAllInputSources(
    "should treat valueless attributes as true when booleanType: true",
    `<root><input disabled required type="text"/></root>`,
    (result) => {
      expect(result.root.input["@_disabled"]).toBe(true);
      expect(result.root.input["@_required"]).toBe(true);
      expect(result.root.input["@_type"]).toBe("text");
    },
    { skip: { attributes: false }, attributes: { booleanType: true, prefix: "@_" } }
  );

  runAcrossAllInputSources(
    "should treat valueless attributes as true in PI tags when booleanType: true",
    `<?textinfo whitespace standalone?><root/>`,
    (result) => {
      expect(result["?textinfo"]["@_whitespace"]).toBe(true);
      expect(result["?textinfo"]["@_standalone"]).toBe(true);
    },
    { skip: { attributes: false }, attributes: { booleanType: true } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 6. Attribute value parsing
// ─────────────────────────────────────────────────────────────────────────────
describe("Attributes — value parsing", function () {

  runAcrossAllInputSources(
    "should parse numeric attribute values by default",
    `<root><tag count="42" ratio="3.14"/></root>`,
    (result) => {
      expect(result.root.tag["@_count"]).toBe(42);
      expect(result.root.tag["@_ratio"]).toBe(3.14);
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should parse boolean attribute values by default",
    `<root><tag active="true" hidden="false"/></root>`,
    (result) => {
      expect(result.root.tag["@_active"]).toBe(true);
      expect(result.root.tag["@_hidden"]).toBe(false);
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should expand entity references in attribute values",
    `<root><tag label="&lt;hello&gt;"/></root>`,
    (result) => {
      expect(result.root.tag["@_label"]).toBe("<hello>");
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should leave attribute values as raw strings when valueParsers is empty",
    `<root><tag count="42" active="true"/></root>`,
    (result) => {
      expect(result.root.tag["@_count"]).toBe("42");
      expect(result.root.tag["@_active"]).toBe("true");
    },
    { skip: { attributes: false }, attributes: { valueParsers: [] } }
  );

  runAcrossAllInputSources(
    "should apply number-only parsing to attribute values",
    `<root><tag count="42" label="hello" flag="true"/></root>`,
    (result) => {
      expect(result.root.tag["@_count"]).toBe(42);
      expect(result.root.tag["@_label"]).toBe("hello");
      expect(result.root.tag["@_flag"]).toBe("true"); // string — boolean parser not in chain
    },
    { skip: { attributes: false }, attributes: { valueParsers: ["number"] } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 7. Namespace prefix stripping (skip.nsPrefix)
// ─────────────────────────────────────────────────────────────────────────────
describe("Attributes — namespace prefix stripping", function () {

  runAcrossAllInputSources(
    "should strip namespace prefix from attribute names when skip.nsPrefix: true",
    `<root><tag ns:id="1" ns:class="main">value</tag></root>`,
    (result) => {
      expect(result.root.tag["@_id"]).toBe(1);
      expect(result.root.tag["@_class"]).toBe("main");
    },
    { skip: { attributes: false, nsPrefix: true } }
  );

  runAcrossAllInputSources(
    "should drop xmlns:* declarations when skip.nsPrefix: true",
    `<root xmlns:ns="http://example.com"><tag ns:id="1">value</tag></root>`,
    (result) => {
      // xmlns:ns declaration is dropped entirely
      expect(result.root["@_xmlns:ns"]).toBeUndefined();
      expect(result.root.tag["@_id"]).toBe(1);
    },
    { skip: { attributes: false, nsPrefix: true } }
  );

  runAcrossAllInputSources(
    "should keep namespace prefixes when skip.nsPrefix: false (default)",
    `<root><tag ns:id="1">value</tag></root>`,
    (result) => {
      expect(result.root.tag["@_ns:id"]).toBe(1);
    },
    { skip: { attributes: false, nsPrefix: false } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 8. Attribute and text content coexistence
// ─────────────────────────────────────────────────────────────────────────────
describe("Attributes — mixed with text content", function () {

  runAcrossAllInputSources(
    "should store text under nameFor.text when tag has both attributes and text",
    `<root><item id="1">hello</item></root>`,
    (result) => {
      expect(result.root.item["@_id"]).toBe(1);
      expect(result.root.item["#text"]).toBe("hello");
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should store text under custom nameFor.text",
    `<root><item id="1">hello</item></root>`,
    (result) => {
      expect(result.root.item["@_id"]).toBe(1);
      expect(result.root.item["_text"]).toBe("hello");
    },
    { skip: { attributes: false }, nameFor: { text: "_text" } }
  );

  runAcrossAllInputSources(
    "should handle nested tags where parent and child both have attributes",
    `<outer id="1"><inner id="2">value</inner></outer>`,
    (result) => {
      expect(result.outer["@_id"]).toBe(1);
      expect(result.outer.inner["@_id"]).toBe(2);
      expect(result.outer.inner["#text"]).toBe("value");
    },
    { skip: { attributes: false } }
  );

});
