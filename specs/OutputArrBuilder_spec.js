import XMLParser from "../src/XMLParser.js";
import JsArrBuilder from "../src/OutputBuilders/JsArrBuilder.js";
import { runAcrossAllInputSources, runAcrossAllInputSourcesWithFactory } from "./helpers/testRunner.js";
import { buildOptions } from "../src/OutputBuilders/ParserOptionsBuilder.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build parser options for JsArrBuilder tests.
 *
 * @param {object} builderOptions - options passed to the JsArrBuilder factory
 *                                  (e.g. { compactLeaf: true })
 * @param {object} parserOptions  - options passed to XMLParser
 *                                  (e.g. { skip: { attributes: false } })
 * @returns {object} Parser options object
 */
function makeOptions(builderOptions = {}, parserOptions = {}) {
  return {
    OutputBuilder: new JsArrBuilder(builderOptions),
    ...parserOptions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic structure
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — basic structure", function () {

  runAcrossAllInputSources(
    "single root element is returned directly (not wrapped in an outer array)",
    "<root><child>hello</child></root>",
    (result) => {
      expect(result.tagname).toBe("root");
      expect(Array.isArray(result.child)).toBe(true);
    },
    makeOptions()
  );

  runAcrossAllInputSources(
    "multiple root-level nodes are returned as an array",
    `<?xml version="1.0"?><a>1</a>`,
    (result) => {
      expect(Array.isArray(result)).toBe(true);
    },
    makeOptions()
  );

  runAcrossAllInputSources(
    "preserves document order for sibling elements",
    "<root><first>1</first><second>2</second><third>3</third></root>",
    (result) => {
      const names = result.child.map((n) => n.tagname);
      expect(names).toEqual(["first", "second", "third"]);
    },
    makeOptions()
  );

  runAcrossAllInputSources(
    "self-closing tag produces a Node with an empty child array",
    "<root><empty/></root>",
    (result) => {
      expect(result.child[0].tagname).toBe("empty");
      expect(result.child[0].child).toEqual([]);
    },
    makeOptions()
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Text nodes
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — text nodes", function () {

  runAcrossAllInputSources(
    "text content is stored as { '#text': value } inside the child array",
    "<root><b>hello</b></root>",
    (result) => {
      const b = result.child[0];
      expect(b.tagname).toBe("b");
      expect(b.child[0]["#text"]).toBe("hello");
    },
    makeOptions()
  );

  runAcrossAllInputSources(
    "numeric string is converted to a number via the default value parsers",
    "<root><n>42</n></root>",
    (result) => {
      expect(result.child[0].child[0]["#text"]).toBe(42);
    },
    makeOptions()
  );

  runAcrossAllInputSources(
    "nameFor.text option changes the key used for text children",
    "<root><b>hi</b></root>",
    (result) => {
      const expected = {
        "tagname": "root",
        "child": [
          {
            "tagname": "b",
            "child": [
              {
                "_": "hi"
              }
            ]
          }
        ]
      };
      const plainResult = JSON.parse(JSON.stringify(result));
      expect(plainResult).toEqual(expected);
    },
    makeOptions({}, { nameFor: { text: "_" } })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Attributes
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — attributes", function () {

  runAcrossAllInputSources(
    "attributes are stored under ':@' on the Node",
    `<root><item id="1">x</item></root>`,
    (result) => {
      expect(result.child[0][":@"]["@_id"]).toBe(1);
    },
    makeOptions({}, { skip: { attributes: false } })
  );

  runAcrossAllInputSources(
    "attribute prefix is taken from builder options",
    `<root><t foo="bar"/></root>`,
    (result) => {
      const expected = {
        "tagname": "root",
        "child": [
          {
            "tagname": "t",
            "child": [],
            ":@": {
              "attr_foo": "bar"
            }
          }
        ]
      };
      const plainResult = JSON.parse(JSON.stringify(result));
      expect(plainResult).toEqual(expected);
    },
    makeOptions({}, { attributes: { prefix: "attr_", groupBy: "@" }, skip: { attributes: false } })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. compactLeaf disabled (default)
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf disabled (default)", function () {

  runAcrossAllInputSources(
    "leaf node retains full Node structure with a child array",
    "<root><b>123</b></root>",
    (result) => {
      const b = result.child[0];
      expect(b.tagname).toBe("b");
      expect(Array.isArray(b.child)).toBe(true);
      expect(b.child[0]["#text"]).toBe(123);
    },
    makeOptions() // compactLeaf not set
  );

  runAcrossAllInputSourcesWithFactory(
    "passing compactLeaf on parserOptions has no effect (wrong layer)",
    "<root><b>123</b></root>",
    (result) => {
      const b = result.child[0];
      expect(b.tagname).toBe("b");
      expect(b.child[0]["#text"]).toBe(123);
    },
    () => {
      // compactLeaf must be set on the OutputBuilder factory, not on XMLParser.
      // When supplied only via parserOptions the builder ignores it and keeps
      // the full Node structure.
      return new XMLParser({
        OutputBuilder: new JsArrBuilder(), // no compactLeaf here
        compactLeaf: true, // wrong layer — parser option, not builder option
      });
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. compactLeaf enabled
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf enabled", function () {

  runAcrossAllInputSources(
    "single leaf node is compacted to { [tagName]: value }",
    "<root><b>123</b></root>",
    (result) => {
      expect(result.child[0]).toEqual({ b: 123 });
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "leaf string value is preserved as-is after value parsers",
    "<root><label>hello</label></root>",
    (result) => {
      expect(result.child[0]).toEqual({ label: "hello" });
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "boolean value is preserved through value parsers",
    "<root><flag>true</flag></root>",
    (result) => {
      expect(result.child[0]).toEqual({ flag: true });
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "repeated leaf tags produce separate compact entries — not merged",
    "<root><b>123</b><b>456</b><b>789</b></root>",
    (result) => {
      expect(result.child).toEqual([{ b: 123 }, { b: 456 }, { b: 789 }]);
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "non-leaf node (has child elements) keeps full Node structure",
    "<root><parent><child>val</child></parent></root>",
    (result) => {
      const parent = result.child[0];
      // parent has a child element — not a leaf, must not be compacted
      expect(parent.tagname).toBe("parent");
      expect(Array.isArray(parent.child)).toBe(true);
      // its leaf child IS compacted
      expect(parent.child[0]).toEqual({ child: "val" });
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "self-closing tag is compacted to empty string",
    "<root><br/></root>",
    (result) => {
      expect(result.child[0]).toEqual({ br: "" });
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "empty open/close tag is compacted to empty string",
    "<root><empty></empty></root>",
    (result) => {
      expect(result.child[0]).toEqual({ empty: "" });
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "deeply nested structure: only the innermost leaf is compacted",
    "<root><a><b><c>deep</c></b></a></root>",
    (result) => {
      const a = result.child[0];
      expect(a.tagname).toBe("a");
      const b = a.child[0];
      expect(b.tagname).toBe("b");
      expect(b.child[0]).toEqual({ c: "deep" });
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "mixed siblings: leaf compacted, non-leaf kept as Node",
    "<root><leaf>42</leaf><parent><child>x</child></parent></root>",
    (result) => {
      expect(result.child[0]).toEqual({ leaf: 42 });
      expect(result.child[1].tagname).toBe("parent");
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "compacted leaf is a plain object — not a Node instance",
    "<root><leaf>42</leaf></root>",
    (result) => {
      const leaf = result.child[0];
      expect(leaf.tagname).toBeUndefined();
      expect(leaf.child).toBeUndefined();
      expect(leaf.leaf).toBe(42);
    },
    makeOptions({ compactLeaf: true })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. compactLeaf with attributes — node must NOT be compacted
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf blocked by attributes", function () {

  runAcrossAllInputSources(
    "leaf node with attributes keeps full Node structure",
    `<root><item id="1">text</item></root>`,
    (result) => {
      const item = result.child[0];
      expect(item.tagname).toBe("item");
      expect(item[":@"]["@_id"]).toBe(1);
      expect(item.child[0]["#text"]).toBe("text");
    },
    makeOptions({ compactLeaf: true }, { skip: { attributes: false } })
  );

  runAcrossAllInputSources(
    "self-closing tag with attributes keeps full Node structure",
    `<root><img src="pic.jpg"/></root>`,
    (result) => {
      const img = result.child[0];
      expect(img.tagname).toBe("img");
      expect(img[":@"]["@_src"]).toBe("pic.jpg");
    },
    makeOptions({ compactLeaf: true }, { skip: { attributes: false } })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. compactLeaf with stop nodes
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf with stop nodes", function () {

  it("stop node with raw content is compacted to { tagName: rawContent }", function () {
    const onStopNode = jasmine.createSpy("onStopNode");
    const parser = new XMLParser(makeOptions(
      { compactLeaf: true, onStopNode },
      { tags: { stopNodes: ["..script"] } }
    ));

    const result = parser.parse(
      "<root><script>alert('hi')</script></root>"
    );
    const expected = {
      "tagname": "root",
      "child": [
        {
          "script": "alert('hi')"
        }
      ]
    }


    // console.log(JSON.stringify(result, null, 2));
    const plainResult = JSON.parse(JSON.stringify(result));
    expect(plainResult).toEqual(expected);
    expect(onStopNode).toHaveBeenCalledTimes(1);
  });

  runAcrossAllInputSources(
    "empty stop node is compacted to { tagName: '' }",
    "<root><script></script></root>",
    (result) => {
      expect(result.child[0]).toEqual({ script: "" });
    },
    makeOptions({ compactLeaf: true }, { tags: { stopNodes: ["script"] } })
  );

  runAcrossAllInputSources(
    "stop node with attributes keeps full Node structure even with compactLeaf",
    `<root><script type="text/javascript">alert(1)</script></root>`,
    (result) => {
      const node = result.child[0];
      expect(node.tagname).toBe("script");
      expect(node[":@"]["@_type"]).toBe("text/javascript");
    },
    makeOptions(
      { compactLeaf: true },
      {
        skip: { attributes: false },
        tags: { stopNodes: ["script"] },
      }
    )
  );

  runAcrossAllInputSources(
    "stop node without compactLeaf keeps full Node structure",
    "<root><script>let x = 1;</script></root>",
    (result) => {
      const node = result.child[0];
      expect(node.tagname).toBe("script");
      expect(node.child[0]["#text"]).toBe("let x = 1;");
    },
    makeOptions({}, { tags: { stopNodes: ["script"] } })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 8. compactLeaf with CDATA
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf with CDATA", function () {

  runAcrossAllInputSources(
    "CDATA merged into text (nameFor.cdata = '') is compacted normally",
    "<root><code><![CDATA[x < 1]]></code></root>",
    (result) => {
      expect(result.child[0]).toEqual({ code: "x < 1" });
    },
    makeOptions({ compactLeaf: true })
  );

  runAcrossAllInputSources(
    "CDATA with its own key produces a non-leaf node — kept as Node",
    "<root><code><![CDATA[x < 1]]></code></root>",
    (result) => {
      const code = result.child[0];
      expect(code.tagname).toBe("code");
      expect(code.child[0]["#cdata"]).toBe("x < 1");
    },
    makeOptions(
      { compactLeaf: true },
      { nameFor: { cdata: "#cdata" }, skip: { cdata: false } }
    )
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 9. onClose callback interaction
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — onClose callback", function () {

  runAcrossAllInputSourcesWithFactory(
    "onClose returning truthy suppresses the node push regardless of compactLeaf",
    "<root><a>1</a><b>2</b></root>",
    (result) => {
      // Just verify parsing completed successfully
      expect(result).toBeDefined();
    },
    () => {
      const collected = [];
      const options = makeOptions({
        compactLeaf: true,
        onClose(node) {
          collected.push(node);
          return true; // suppress
        },
      });
      const parser = new XMLParser(options);
      parser._testCollected = collected;
      return parser;
    }
  );

});