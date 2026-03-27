import XMLParser from "../src/XMLParser.js";
import JsArrBuilder from "../src/OutputBuilders/JsArrBuilder.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a parser backed by JsArrBuilder.
 *
 * @param {object} builderOptions - options passed to the JsArrBuilder factory
 *                                  (e.g. { compactLeaf: true })
 * @param {object} parserOptions  - options passed to XMLParser
 *                                  (e.g. { skip: { attributes: false } })
 */
function makeParser(builderOptions = {}, parserOptions = {}) {
  return new XMLParser({
    OutputBuilder: new JsArrBuilder(builderOptions),
    ...parserOptions,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic structure
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — basic structure", function () {

  it("single root element is returned directly (not wrapped in an outer array)", function () {
    const parser = makeParser();
    const result = parser.parse("<root><child>hello</child></root>");

    expect(result.tagname).toBe("root");
    expect(Array.isArray(result.child)).toBe(true);
  });

  it("multiple root-level nodes are returned as an array", function () {
    const parser = makeParser();
    const result = parser.parse(`<?xml version="1.0"?><a>1</a>`);

    expect(Array.isArray(result)).toBe(true);
  });

  it("preserves document order for sibling elements", function () {
    const parser = makeParser();
    const result = parser.parse(
      "<root><first>1</first><second>2</second><third>3</third></root>"
    );

    const names = result.child.map((n) => n.tagname);
    expect(names).toEqual(["first", "second", "third"]);
  });

  it("self-closing tag produces a Node with an empty child array", function () {
    const parser = makeParser();
    const result = parser.parse("<root><empty/></root>");

    expect(result.child[0].tagname).toBe("empty");
    expect(result.child[0].child).toEqual([]);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Text nodes
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — text nodes", function () {

  it("text content is stored as { '#text': value } inside the child array", function () {
    const parser = makeParser();
    const result = parser.parse("<root><b>hello</b></root>");
    const b = result.child[0];

    expect(b.tagname).toBe("b");
    expect(b.child[0]["#text"]).toBe("hello");
  });

  it("numeric string is converted to a number via the default value parsers", function () {
    const parser = makeParser();
    const result = parser.parse("<root><n>42</n></root>");

    expect(result.child[0].child[0]["#text"]).toBe(42);
  });

  it("nameFor.text option changes the key used for text children", function () {
    const parser = makeParser({}, { nameFor: { text: "_" } });
    const result = parser.parse("<root><b>hi</b></root>");
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
    }
    // console.log(JSON.stringify(result, null, 2));
    const plainResult = JSON.parse(JSON.stringify(result));
    expect(plainResult).toEqual(expected);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Attributes
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — attributes", function () {

  it("attributes are stored under ':@' on the Node", function () {
    const parser = makeParser({}, { skip: { attributes: false } });
    const result = parser.parse(`<root><item id="1">x</item></root>`);

    expect(result.child[0][":@"]["@_id"]).toBe(1);
  });

  it("attribute prefix is taken from builder options", function () {
    const parser = makeParser({},
      { attributes: { prefix: "attr_", groupBy: "@" }, skip: { attributes: false } }
    );
    const result = parser.parse(`<root><t foo="bar"/></root>`);
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
    }

    // console.log(JSON.stringify(result, null, 2));
    const plainResult = JSON.parse(JSON.stringify(result));
    expect(plainResult).toEqual(expected);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. compactLeaf disabled (default)
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf disabled (default)", function () {

  it("leaf node retains full Node structure with a child array", function () {
    const parser = makeParser();                      // compactLeaf not set
    const result = parser.parse("<root><b>123</b></root>");
    const b = result.child[0];

    expect(b.tagname).toBe("b");
    expect(Array.isArray(b.child)).toBe(true);
    expect(b.child[0]["#text"]).toBe(123);
  });

  it("passing compactLeaf on parserOptions has no effect (wrong layer)", function () {
    // compactLeaf must be set on the OutputBuilder factory, not on XMLParser.
    // When supplied only via parserOptions the builder ignores it and keeps
    // the full Node structure.
    const parser = new XMLParser({
      OutputBuilder: new JsArrBuilder(),   // no compactLeaf here
      compactLeaf: true,                   // wrong layer — parser option, not builder option
    });
    const result = parser.parse("<root><b>123</b></root>");
    const b = result.child[0];

    expect(b.tagname).toBe("b");
    expect(b.child[0]["#text"]).toBe(123);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. compactLeaf enabled
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf enabled", function () {

  it("single leaf node is compacted to { [tagName]: value }", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse("<root><b>123</b></root>");

    expect(result.child[0]).toEqual({ b: 123 });
  });

  it("leaf string value is preserved as-is after value parsers", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse("<root><label>hello</label></root>");

    expect(result.child[0]).toEqual({ label: "hello" });
  });

  it("boolean value is preserved through value parsers", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse("<root><flag>true</flag></root>");

    expect(result.child[0]).toEqual({ flag: true });
  });

  it("repeated leaf tags produce separate compact entries — not merged", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse(
      "<root><b>123</b><b>456</b><b>789</b></root>"
    );

    expect(result.child).toEqual([{ b: 123 }, { b: 456 }, { b: 789 }]);
  });

  it("non-leaf node (has child elements) keeps full Node structure", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse(
      "<root><parent><child>val</child></parent></root>"
    );
    const parent = result.child[0];

    // parent has a child element — not a leaf, must not be compacted
    expect(parent.tagname).toBe("parent");
    expect(Array.isArray(parent.child)).toBe(true);
    // its leaf child IS compacted
    expect(parent.child[0]).toEqual({ child: "val" });
  });

  it("self-closing tag is compacted to empty string", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse("<root><br/></root>");

    expect(result.child[0]).toEqual({ br: "" });
  });

  it("empty open/close tag is compacted to empty string", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse("<root><empty></empty></root>");

    expect(result.child[0]).toEqual({ empty: "" });
  });

  it("deeply nested structure: only the innermost leaf is compacted", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse(
      "<root><a><b><c>deep</c></b></a></root>"
    );

    const a = result.child[0];
    expect(a.tagname).toBe("a");
    const b = a.child[0];
    expect(b.tagname).toBe("b");
    expect(b.child[0]).toEqual({ c: "deep" });
  });

  it("mixed siblings: leaf compacted, non-leaf kept as Node", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse(
      "<root><leaf>42</leaf><parent><child>x</child></parent></root>"
    );

    expect(result.child[0]).toEqual({ leaf: 42 });
    expect(result.child[1].tagname).toBe("parent");
  });

  it("compacted leaf is a plain object — not a Node instance", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse("<root><leaf>42</leaf></root>");
    const leaf = result.child[0];

    expect(leaf.tagname).toBeUndefined();
    expect(leaf.child).toBeUndefined();
    expect(leaf.leaf).toBe(42);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. compactLeaf with attributes — node must NOT be compacted
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf blocked by attributes", function () {

  it("leaf node with attributes keeps full Node structure", function () {
    const parser = makeParser(
      { compactLeaf: true },
      { skip: { attributes: false } }
    );
    const result = parser.parse(`<root><item id="1">text</item></root>`);
    const item = result.child[0];

    expect(item.tagname).toBe("item");
    expect(item[":@"]["@_id"]).toBe(1);
    expect(item.child[0]["#text"]).toBe("text");
  });

  it("self-closing tag with attributes keeps full Node structure", function () {
    const parser = makeParser(
      { compactLeaf: true },
      { skip: { attributes: false } }
    );
    const result = parser.parse(`<root><img src="pic.jpg"/></root>`);
    const img = result.child[0];

    expect(img.tagname).toBe("img");
    expect(img[":@"]["@_src"]).toBe("pic.jpg");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. compactLeaf with stop nodes
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf with stop nodes", function () {

  it("stop node with raw content is compacted to { tagName: rawContent }", function () {
    const onStopNode = jasmine.createSpy("onStopNode");
    const parser = makeParser(
      { compactLeaf: true, onStopNode },
      { tags: { stopNodes: ["..script"] } }
    );

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

  it("empty stop node is compacted to { tagName: '' }", function () {
    const parser = makeParser(
      { compactLeaf: true },
      { tags: { stopNodes: ["script"] } }
    );
    const result = parser.parse("<root><script></script></root>");

    expect(result.child[0]).toEqual({ script: "" });
  });

  it("stop node with attributes keeps full Node structure even with compactLeaf", function () {
    const parser = makeParser(
      { compactLeaf: true },
      {
        skip: { attributes: false },
        tags: { stopNodes: ["script"] },
      }
    );
    const result = parser.parse(
      `<root><script type="text/javascript">alert(1)</script></root>`
    );
    const node = result.child[0];

    expect(node.tagname).toBe("script");
    expect(node[":@"]["@_type"]).toBe("text/javascript");
  });

  it("stop node without compactLeaf keeps full Node structure", function () {
    const parser = makeParser(
      {},                                    // compactLeaf not set on factory
      { tags: { stopNodes: ["script"] } }
    );
    const result = parser.parse(
      "<root><script>let x = 1;</script></root>"
    );
    const node = result.child[0];

    expect(node.tagname).toBe("script");
    expect(node.child[0]["#text"]).toBe("let x = 1;");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 8. compactLeaf with CDATA
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — compactLeaf with CDATA", function () {

  it("CDATA merged into text (nameFor.cdata = '') is compacted normally", function () {
    const parser = makeParser({ compactLeaf: true });
    const result = parser.parse(
      "<root><code><![CDATA[x < 1]]></code></root>"
    );

    expect(result.child[0]).toEqual({ code: "x < 1" });
  });

  it("CDATA with its own key produces a non-leaf node — kept as Node", function () {
    // When CDATA has nameFor.cdata set it becomes a child entry, making the
    // parent a non-leaf — it must not be compacted.
    const parser = makeParser(
      { compactLeaf: true }, { nameFor: { cdata: "#cdata" }, skip: { cdata: false } }
    );
    const result = parser.parse(
      "<root><code><![CDATA[x < 1]]></code></root>"
    );
    const code = result.child[0];
    expect(code.tagname).toBe("code");
    expect(code.child[0]["#cdata"]).toBe("x < 1");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 9. onClose callback interaction
// ─────────────────────────────────────────────────────────────────────────────
describe("JsArrBuilder — onClose callback", function () {

  it("onClose returning truthy suppresses the node push regardless of compactLeaf", function () {
    const collected = [];
    const parser = makeParser({
      compactLeaf: true,
      onClose(node) {
        collected.push(node);
        return true; // suppress
      },
    });
    parser.parse("<root><a>1</a><b>2</b></root>");

    // a, b, and root all pass through onClose
    expect(collected.length).toBe(3);
  });

});