import XMLParser from "../src/XMLParser.js";

describe("CDATA", function () {

  it("should parse CDATA and store it separately when nameFor.cdata is set", function () {
    const xmlData = `
      <root>
        <script><![CDATA[
          function test() {
            if (a < b && c > d) {
              return true;
            }
          }
        ]]></script>
      </root>`;

    const parser = new XMLParser({ nameFor: { cdata: "#cdata" } });
    const result = parser.parse(xmlData);

    expect(result.root.script["#cdata"]).toBeDefined();
    expect(result.root.script["#cdata"]).toContain("function test()");
  });

  it("should merge CDATA with text content when nameFor.cdata is empty string (default)", function () {
    const xmlData = `
      <root>
        <data><![CDATA[Some <raw> data & more]]></data>
      </root>`;

    const parser = new XMLParser(); // nameFor.cdata defaults to ''
    const result = parser.parse(xmlData);

    expect(result.root.data).toBe("Some <raw> data & more");
  });

  it("should handle multiple CDATA sections", function () {
    const xmlData = `
      <root>
        <content>
          <![CDATA[First CDATA]]>
          Some text
          <![CDATA[Second CDATA]]>
        </content>
      </root>`;

    const parser = new XMLParser({ nameFor: { cdata: "#cdata" } });
    const result = parser.parse(xmlData);

    expect(result.root.content["#cdata"]).toBeDefined();
  });

  it("should preserve special characters in CDATA without parsing", function () {
    const xmlData = `
      <root>
        <xml><![CDATA[<tag attr="value">text & more</tag>]]></xml>
      </root>`;

    const parser = new XMLParser({ nameFor: { cdata: "#cdata" } });
    const result = parser.parse(xmlData);

    expect(result.root.xml["#cdata"]).toContain('<tag attr="value">');
    expect(result.root.xml["#cdata"]).toContain("&");
  });

  it("should handle empty CDATA sections", function () {
    const xmlData = `
      <root>
        <empty><![CDATA[]]></empty>
      </root>`;

    const parser = new XMLParser({ nameFor: { cdata: "#cdata" } });
    const result = parser.parse(xmlData);

    expect(result.root.empty["#cdata"]).toBeDefined();
  });

  it("should exclude CDATA entirely when skip.cdata is true", function () {
    const xmlData = `
      <root>
        <script><![CDATA[some code here]]></script>
      </root>`;

    const parser = new XMLParser({ skip: { cdata: true } });
    const result = parser.parse(xmlData);

    // CDATA skipped — tag is empty
    expect(result.root.script).toBe("");
  });

});
