import XMLParser from "../src/XMLParser.js";

describe("Input Sources", function () {

  it("should parse from string", function () {
    const xmlString = "<root><tag>value</tag></root>";
    const parser = new XMLParser();
    const result = parser.parse(xmlString);

    expect(result.root.tag).toBe("value");
  });

  it("should parse from Buffer", function () {
    const xmlString = "<root><tag>123</tag></root>";
    const buffer = Buffer.from(xmlString);
    const parser = new XMLParser();
    const result = parser.parse(buffer);

    expect(result.root.tag).toBe(123);
  });

  it("should parse from Uint8Array using parseBytesArr", function () {
    const xmlString = "<root><tag>test</tag></root>";
    const uint8Array = new Uint8Array(Buffer.from(xmlString));
    const parser = new XMLParser();
    const result = parser.parseBytesArr(uint8Array);

    expect(result.root.tag).toBe("test");
  });

  it("should handle UTF-8 encoded content", function () {
    const xmlString = "<root><tag>Hello 世界 🌍</tag></root>";
    const parser = new XMLParser();
    const result = parser.parse(xmlString);

    expect(result.root.tag).toBe("Hello 世界 🌍");
  });

  it("should use feed/end API for streaming", function () {
    const parser = new XMLParser();

    parser.feed("<root>");
    parser.feed("<tag>value</tag>");
    parser.feed("</root>");
    const result = parser.end();

    expect(result.root.tag).toBe("value");
  });

  it("should handle chunked streaming data", function () {
    const parser = new XMLParser();
    const chunks = [
      "<root>",
      "<items>",
      "<item>first</item>",
      "<item>second</item>",
      "</items>",
      "</root>"
    ];

    chunks.forEach(chunk => parser.feed(chunk));
    const result = parser.end();

    expect(Array.isArray(result.root.items.item)).toBe(true);
    expect(result.root.items.item[0]).toBe("first");
    expect(result.root.items.item[1]).toBe("second");
  });

});