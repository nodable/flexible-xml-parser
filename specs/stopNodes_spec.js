import XMLParser from "../src/XMLParser.js";


describe("Stop Nodes", function () {

  it("should stop parsing at specified nodes", function () {
    const xmlData = `
      <root>
        <parse>
          <child>This is parsed</child>
        </parse>
        <dontparse>
          <child>This should not be parsed</child>
        </dontparse>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.dontparse"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(result.root.parse.child).toBe("This is parsed");
    expect(typeof result.root.dontparse).toBe("string");
    expect(result.root.dontparse).toContain("<child>");
  });

  it("should stop at multiple stop nodes", function () {
    const xmlData = `
      <root>
        <section1>
          <data>parse this</data>
        </section1>
        <section2>
          <data>don't parse</data>
        </section2>
        <section3>
          <data>also don't parse</data>
        </section3>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.section2", "root.section3"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(result.root.section1.data).toBe("parse this");
    expect(typeof result.root.section2).toBe("string");
    expect(typeof result.root.section3).toBe("string");
  });

  it("should handle nested stop nodes", function () {
    const xmlData = `
      <root>
        <level1>
          <level2>
            <level3>
              <data>parse</data>
            </level3>
          </level2>
        </level1>
        <stop>
          <level2>
            <level3>
              <data>don't parse</data>
            </level3>
          </level2>
        </stop>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stop.level2"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(result.root.level1.level2.level3.data).toBe("parse");
    expect(typeof result.root.stop.level2).toBe("string");
  });

  it("should preserve attributes in stop nodes", function () {
    const xmlData = `
      <root>
        <stopNode attr="value">
          <child>content</child>
        </stopNode>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] },
      skip: { attributes: false }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("object");
    expect(result.root.stopNode["@_attr"]).toBe("value");
  });

});