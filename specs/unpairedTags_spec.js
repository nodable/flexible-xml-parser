import XMLParser from "../src/XMLParser.js";
import { runAcrossAllInputSources, runAcrossAllInputSourcesWithException } from "./helpers/testRunner.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic unpaired tag behaviour
// ─────────────────────────────────────────────────────────────────────────────
describe("Unpaired Tags — basic behaviour", function () {

  runAcrossAllInputSources(
    "should treat a declared unpaired tag as self-closing without a closing tag",
    `<root><br>text after</root>`,
    (result) => {
      expect(result.root.br).toBe("");
      expect(result.root["#text"]).toBe("text after");
    },
    { tags: { unpaired: ["br"] } }
  );

  runAcrossAllInputSources(
    "should handle multiple unpaired tags of the same type",
    `<root><br><br><br>end</root>`,
    (result) => {
      expect(Array.isArray(result.root.br)).toBe(true);
      expect(result.root.br.length).toBe(3);
    },
    { tags: { unpaired: ["br"] } }
  );

  runAcrossAllInputSources(
    "should handle several different unpaired tags",
    `<html><body><p>text<br>more<hr>end</p></body></html>`,
    (result) => {
      expect(result.html.body.p.br).toBe("");
      expect(result.html.body.p.hr).toBe("");
    },
    { tags: { unpaired: ["br", "hr"] } }
  );

  runAcrossAllInputSources(
    "should treat an unpaired tag as empty when it has no following content",
    `<root><img/></root>`,
    (result) => {
      expect(result.root.img).toBe("");
    },
    { tags: { unpaired: ["img"] } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 2. Unpaired tags with attributes
// ─────────────────────────────────────────────────────────────────────────────
describe("Unpaired Tags — with attributes", function () {

  runAcrossAllInputSources(
    "should capture attributes on unpaired tags",
    `<root><img src="photo.jpg" alt="photo">text</root>`,
    (result) => {
      expect(result.root.img["@_src"]).toBe("photo.jpg");
      expect(result.root.img["@_alt"]).toBe("photo");
    },
    { skip: { attributes: false }, tags: { unpaired: ["img"] } }
  );

  runAcrossAllInputSources(
    "should capture attributes on multiple unpaired tags of the same type",
    `<root><img src="a.jpg"><img src="b.jpg"></root>`,
    (result) => {
      expect(Array.isArray(result.root.img)).toBe(true);
      expect(result.root.img[0]["@_src"]).toBe("a.jpg");
      expect(result.root.img[1]["@_src"]).toBe("b.jpg");
    },
    { skip: { attributes: false }, tags: { unpaired: ["img"] } }
  );

  runAcrossAllInputSources(
    "should capture valueless (boolean) attributes on unpaired tags",
    `<root><input disabled type="checkbox"></root>`,
    (result) => {
      expect(result.root.input["@_disabled"]).toBe(true);
      expect(result.root.input["@_type"]).toBe("checkbox");
    },
    {
      skip: { attributes: false },
      attributes: { booleanType: true },
      tags: { unpaired: ["input"] },
    }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 3. Unpaired tags coexisting with normal parsed tags
// ─────────────────────────────────────────────────────────────────────────────
describe("Unpaired Tags — mixed with normal tags", function () {

  runAcrossAllInputSources(
    "should not affect parsing of normal sibling tags",
    `<root><br><child>value</child></root>`,
    (result) => {
      expect(result.root.br).toBe("");
      expect(result.root.child).toBe("value");
    },
    { tags: { unpaired: ["br"] } }
  );

  runAcrossAllInputSources(
    "should handle unpaired tags nested inside normal tags",
    `<root><p>Hello<br>World</p></root>`,
    (result) => {
      expect(result.root.p.br).toBe("");
    },
    { tags: { unpaired: ["br"] } }
  );

  runAcrossAllInputSources(
    "should handle normal tags that appear after unpaired tags",
    `<root><br><section><title>Hello</title></section></root>`,
    (result) => {
      expect(result.root.br).toBe("");
      expect(result.root.section.title).toBe("Hello");
    },
    { tags: { unpaired: ["br"] } }
  );

  runAcrossAllInputSources(
    "should handle deeply nested unpaired tags",
    `<html><body><div><p>text<br>more text</p></div></body></html>`,
    (result) => {
      expect(result.html.body.div.p.br).toBe("");
    },
    { tags: { unpaired: ["br"] } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 4. Common HTML void elements
// ─────────────────────────────────────────────────────────────────────────────
describe("Unpaired Tags — common HTML void elements", function () {

  const htmlVoidTags = ["br", "hr", "img", "input", "link", "meta"];

  runAcrossAllInputSources(
    "should handle all common HTML void elements declared as unpaired",
    `<html><head>
      <meta charset="UTF-8">
      <link rel="stylesheet" href="style.css">
    </head><body>
      <p>Line one<br>Line two<hr>Section</p>
      <img src="pic.jpg" alt="pic">
      <input type="text" name="q">
    </body></html>`,
    (result) => {
      expect(result.html.head.meta["@_charset"]).toBe("UTF-8");
      expect(result.html.head.link["@_rel"]).toBe("stylesheet");
      expect(result.html.body.p.br).toBe("");
      expect(result.html.body.p.hr).toBe("");
      expect(result.html.body.img["@_src"]).toBe("pic.jpg");
      expect(result.html.body.input["@_type"]).toBe("text");
    },
    {
      skip: { attributes: false },
      tags: { unpaired: htmlVoidTags },
    }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 5. Unpaired tags self-closing with explicit slash are also handled
// ─────────────────────────────────────────────────────────────────────────────
describe("Unpaired Tags — explicit self-closing slash", function () {

  runAcrossAllInputSources(
    "should handle unpaired tag written with explicit self-closing slash",
    `<root><br/><child>value</child></root>`,
    (result) => {
      expect(result.root.br).toBe("");
      expect(result.root.child).toBe("value");
    },
    { tags: { unpaired: ["br"] } }
  );

  runAcrossAllInputSources(
    "should handle mix of slash and non-slash forms of the same unpaired tag",
    `<root><br/><br><br/></root>`,
    (result) => {
      expect(Array.isArray(result.root.br)).toBe(true);
      expect(result.root.br.length).toBe(3);
    },
    { tags: { unpaired: ["br"] } }
  );

});


// ─────────────────────────────────────────────────────────────────────────────
// 6. Unexpected closing tag for an unpaired tag should throw
// ─────────────────────────────────────────────────────────────────────────────
describe("Unpaired Tags — closing tag validation", function () {

  runAcrossAllInputSourcesWithException(
    "should throw when a closing tag appears for a declared unpaired tag",
    `<root><br></br></root>`,
    /Unexpected closing tag/,
    { tags: { unpaired: ["br"] } }
  );

});
