import XMLParser from "../src/XMLParser.js";
import EntitiesValueParser from "../src/EntityParser/EntitiesParser.js";
import JsObjOutputBuilder from "../src/OutputBuilders/JsObjBuilder.js";
import numParser from "../src/OutputBuilders/ValueParsers/number.js";
import { skip } from "node:test";

describe("Value Parsers", function () {

  // ── Default chain behaviour ───────────────────────────────────────────────

  it("should parse numbers with the default chain", function () {
    const xmlData = `
      <root>
        <integer>42</integer>
        <float>3.14</float>
        <negative>-100</negative>
        <hex>0x1F</hex>
      </root>`;

    const parser = new XMLParser();
    const result = parser.parse(xmlData);

    expect(result.root.integer).toBe(42);
    expect(result.root.float).toBe(3.14);
    expect(result.root.negative).toBe(-100);
    expect(result.root.hex).toBe(31);
  });

  it("should parse booleans with the default chain", function () {
    const xmlData = `
      <root>
        <trueVal>true</trueVal>
        <falseVal>false</falseVal>
        <notBoolean>maybe</notBoolean>
      </root>`;

    const parser = new XMLParser();
    const result = parser.parse(xmlData);

    expect(result.root.trueVal).toBe(true);
    expect(result.root.falseVal).toBe(false);
    expect(result.root.notBoolean).toBe("maybe");
  });

  it("should NOT trim values by default", function () {
    const xmlData = `
      <root>
        <tag>  padded  </tag>
      </root>`;

    const parser = new XMLParser();
    const result = parser.parse(xmlData);

    // No 'trim' in the default chain — whitespace is preserved
    expect(result.root.tag).toBe("  padded  ");
  });

  it("should trim values when 'trim' is added to valueParsers", function () {
    const xmlData = `
      <root>
        <tag>  trimmed  </tag>
      </root>`;

    const parser = new XMLParser({
      tags: { valueParsers: ['trim', 'boolean', 'number'] },
    });
    const result = parser.parse(xmlData);

    expect(result.root.tag).toBe("trimmed");
  });

  // ── Entity expansion via ValueParser ─────────────────────────────────────

  it("should expand XML entities via the 'entity' ValueParser (default)", function () {
    const parser = new XMLParser();
    const result = parser.parse(`<root><tag>&lt;hello&gt;</tag></root>`);
    expect(result.root.tag).toBe("<hello>");
  });

  it("should expand DOCTYPE entities via the 'entity' ValueParser (default)", function () {
    const evp = new EntitiesValueParser({
      docType: true
    });
    const builder = new JsObjOutputBuilder();
    builder.registerValueParser("entity", evp);

    const parser = new XMLParser({
      doctypeOptions: { enabled: true },
      outputBuilder: builder
    });
    const result = parser.parse(`<!DOCTYPE root [
      <!ENTITY brand "FlexParser">
    ]><root><name>&brand;</name></root>`);
    expect(result.root.name).toBe("FlexParser");
  });

  it("should leave entities unexpanded when 'entity' is removed from valueParsers", function () {
    const parser = new XMLParser({
      tags: { valueParsers: ['boolean', 'number'] },
    });
    const result = parser.parse(`<root><tag>&lt;raw&gt;</tag></root>`);
    expect(result.root.tag).toBe("&lt;raw&gt;");
  });

  it("should expand HTML entities when entityParseOptions.html is true", function () {
    const evp = new EntitiesValueParser({ html: true });
    const builder = new JsObjOutputBuilder({
      // attributes: { valueParsers: ['entity'] }
      tags: { valueParsers: [evp, "number"] }
      // tags: { valueParsers: ["entity", "number"] }
    });

    builder.registerValueParser("entity", evp);

    const parser = new XMLParser({
      skip: { attributes: false },
      OutputBuilder: builder,
    });
    const result = parser.parse(`<root><c>&copy;</c><p>&pound;</p></root>`);
    expect(result.root.c).toBe("©");
    expect(result.root.p).toBe("£");
  });

  it("should expand HTML entities in attributes when entityParseOptions.html is true", function () {

    const evp = new EntitiesValueParser({
      html: true
    });
    const builder = new JsObjOutputBuilder({
      // attributes: { valueParsers: ['entity'] }
      attributes: { valueParsers: [evp] }
    });

    // builder.registerValueParser("entity", evp);

    const parser = new XMLParser({
      skip: { attributes: false },
      OutputBuilder: builder,
    });
    const result = parser.parse(`<root label="&copy; 2024"/>`);
    expect(result.root["@_label"]).toBe("© 2024");
  });

  // ── Custom chain ──────────────────────────────────────────────────────────

  it("should use a fully custom valueParsers chain with replaceEntities", function () {
    const xmlData = `
      <root>
        <val1>42</val1>
        <val2>true</val2>
        <val3>text</val3>
      </root>`;

    const parser = new XMLParser({
      tags: { valueParsers: ['entity', 'boolean', 'number'] },
    });
    const result = parser.parse(xmlData);

    expect(result.root.val1).toBe(42);
    expect(result.root.val2).toBe(true);
    expect(result.root.val3).toBe("text");
  });

  it("should use a custom number parser instance with specific options", function () {
    const xmlData = `
      <root>
        <leadingZeros>007</leadingZeros>
        <hex>0xFF</hex>
        <eNotation>1.5e3</eNotation>
      </root>`;

    const parser = new XMLParser({
      tags: {
        valueParsers: [
          new numParser({ hex: true, leadingZeros: false, eNotation: true }),
        ],
      },
    });
    const result = parser.parse(xmlData);

    expect(result.root.leadingZeros).toBe("007"); // preserved — leadingZeros: false
    expect(result.root.hex).toBe(255);
    expect(result.root.eNotation).toBe(1500);
  });

  it("should disable all value parsing with an empty valueParsers array", function () {
    const parser = new XMLParser({
      tags: { valueParsers: [] },
      attributes: { valueParsers: [] },
    });
    const result = parser.parse(`<root><n>42</n></root>`);
    expect(result.root.n).toBe("42");
    expect(typeof result.root.n).toBe("string");
  });

  it("should parse attribute values with the default chain", function () {
    const xmlData = `<root><tag num="42" bool="true" text="hello">value</tag></root>`;

    const parser = new XMLParser({ skip: { attributes: false } });
    const result = parser.parse(xmlData);

    expect(result.root.tag["@_num"]).toBe(42);
    expect(result.root.tag["@_bool"]).toBe(true);
    expect(result.root.tag["@_text"]).toBe("hello");
  });

  it("should parse attribute values with a custom chain", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      attributes: { valueParsers: ['number'] },
    });
    const result = parser.parse(`<root><tag n="42" s="hello"/></root>`);
    expect(result.root.tag["@_n"]).toBe(42);
    expect(result.root.tag["@_s"]).toBe("hello");
  });

  // ── Context-aware custom parser ───────────────────────────────────────────

  it("should pass context object to custom value parsers", function () {
    const seenContexts = [];

    class ContextCapture {
      parse(val, context) {
        // Spread everything except matcher (not plain-serialisable)
        const { matcher, ...rest } = context;
        seenContexts.push({ ...rest, hasMatcher: matcher != null });
        return val;
      }
    }

    const parser = new XMLParser({
      tags: { valueParsers: [new ContextCapture()] },
    });
    parser.parse(`<root><price>9.99</price></root>`);

    expect(seenContexts.length).toBeGreaterThan(0);
    // New context shape
    expect(seenContexts[0].elementName).toBe("price");
    expect(seenContexts[0].elementType).toBe("ELEMENT");
    expect(seenContexts[0].isLeafNode).toBe(true);
    expect(seenContexts[0].hasMatcher).toBe(true);
  });

  // ── Registering a named custom parser ────────────────────────────────────

  it("should support registering and referencing a named custom parser", function () {
    class UpperCaseParser {
      parse(val) {
        return typeof val === "string" ? val.toUpperCase() : val;
      }
    }

    const builder = new JsObjOutputBuilder();
    builder.registerValueParser("uppercase", new UpperCaseParser());

    const parser = new XMLParser({
      OutputBuilder: builder,
      tags: { valueParsers: ["uppercase"] },
    });
    const result = parser.parse(`<root><tag>hello world</tag></root>`);
    expect(result.root.tag).toBe("HELLO WORLD");
  });

});
