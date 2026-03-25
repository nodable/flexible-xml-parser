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

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW TESTS: Negative scenarios and edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  it("should handle stopNode with nested tags of the same name", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>level 1</data>
          <stopNode>
            <data>level 2 - nested stopNode</data>
          </stopNode>
          <data>back to level 1</data>
        </stopNode>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.stopNode).toContain("<stopNode>");
    expect(result.root.stopNode).toContain("</stopNode>");
    expect(result.root.stopNode).toContain("level 2 - nested stopNode");
    expect(result.root.stopNode).toContain("back to level 1");
  });

  it("should ignore closing tag in comments within stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>some data</data>
          <!-- This comment contains </stopNode> which should be ignored -->
          <moreData>more content</moreData>
        </stopNode>
        <afterStop>parsed</afterStop>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.stopNode).toContain("<!-- This comment contains </stopNode> which should be ignored -->");
    expect(result.root.stopNode).toContain("<moreData>more content</moreData>");
    expect(result.root.afterStop).toBe("parsed");
  });

  it("should ignore closing tag in CDATA within stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>before cdata</data>
          <![CDATA[
            This CDATA contains </stopNode> and <stopNode> tags
            which should be treated as text
          ]]>
          <data>after cdata</data>
        </stopNode>
        <afterStop>parsed</afterStop>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.stopNode).toContain("<![CDATA[");
    expect(result.root.stopNode).toContain("</stopNode> and <stopNode>");
    expect(result.root.stopNode).toContain("<data>after cdata</data>");
    expect(result.root.afterStop).toBe("parsed");
  });

  it("should handle processing instructions within stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>before PI</data>
          <?xml-stylesheet type="text/xsl" href="style.xsl"?>
          <?custom-pi data="value" with="</stopNode> in it"?>
          <data>after PI</data>
        </stopNode>
        <afterStop>parsed</afterStop>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.stopNode).toContain("<?xml-stylesheet");
    expect(result.root.stopNode).toContain("<?custom-pi");
    expect(result.root.stopNode).toContain("<data>after PI</data>");
    expect(result.root.afterStop).toBe("parsed");
  });

  it("should handle self-closing tags with same name in stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>content</data>
          <stopNode attr="value"/>
          <moreData>more content</moreData>
        </stopNode>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.stopNode).toContain("<stopNode attr=\"value\"/>");
    expect(result.root.stopNode).toContain("<moreData>more content</moreData>");
  });

  it("should handle attributes with > character in stopNode opening tag", function () {
    const xmlData = `
      <root>
        <stopNode attr="value > 10" other='contains ">" char'>
          <data>content</data>
        </stopNode>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] },
      skip: { attributes: false }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("object");
    expect(result.root.stopNode["@_attr"]).toContain(">");
  });

  it("should handle DOCTYPE declarations within stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
            "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
          <data>after doctype</data>
        </stopNode>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.stopNode).toContain("<!DOCTYPE");
    expect(result.root.stopNode).toContain("<data>after doctype</data>");
  });

  it("should handle complex DOCTYPE with internal subset in stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <!DOCTYPE doc [
            <!ELEMENT doc (item)*>
            <!ELEMENT item (#PCDATA)>
          ]>
          <data>content</data>
        </stopNode>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.stopNode).toContain("<!DOCTYPE doc [");
    expect(result.root.stopNode).toContain("]>");
  });

  it("should throw error for unclosed stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>content</data>
          <nested>
            <deep>value</deep>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);

    expect(() => {
      parser.parse(xmlData);
    }).toThrow();
  });

  it("should throw error for unclosed comment in stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>content</data>
          <!-- unclosed comment
          <moreData>more</moreData>
        </stopNode>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);

    expect(() => {
      parser.parse(xmlData);
    }).toThrow();
  });

  it("should throw error for unclosed CDATA in stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>content</data>
          <![CDATA[ unclosed cdata
          <moreData>more</moreData>
        </stopNode>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);

    expect(() => {
      parser.parse(xmlData);
    }).toThrow();
  });

  it("should throw error for unclosed PI in stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>content</data>
          <?xml-stylesheet type="text/xsl" href="style.xsl"
          <moreData>more</moreData>
        </stopNode>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);

    expect(() => {
      parser.parse(xmlData);
    }).toThrow();
  });

  it("should handle multiple nested same-name tags in stopNode", function () {
    const xmlData = `
      <root>
        <item>
          <item>
            <item>
              <data>deeply nested</data>
            </item>
          </item>
        </item>
        <afterItem>parsed normally</afterItem>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.item"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.item).toBe("string");
    expect(result.root.item.split("<item>").length).toBe(3); // 2 nested + 1 split artifact
    expect(result.root.item.split("</item>").length).toBe(3);
    expect(result.root.afterItem).toBe("parsed normally");
  });

  it("should handle whitespace in closing tags within stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          <data>content</data>
          <nested>value</nested  >
          <stopNode >inner</stopNode   >
        </stopNode>
        <after>parsed</after>
      </root>`;

    const expected = {
      "root": {
        "stopNode": `
          <data>content</data>
          <nested>value</nested  >
          <stopNode >inner</stopNode   >
        `,
        "after": "parsed"
      }
    }
    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(result).toEqual(expected);

  });

  it("should handle empty stopNode", function () {
    const xmlData = `
      <root>
        <stopNode></stopNode>
        <after>parsed</after>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.stopNode).toBe("");
    expect(result.root.after).toBe("parsed");
  });

  it("should handle stopNode with only whitespace", function () {
    const xmlData = `
      <root>
        <stopNode>   
          
        </stopNode>
        <after>parsed</after>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.after).toBe("parsed");
  });

  it("should handle complex mixed content in stopNode", function () {
    const xmlData = `
      <root>
        <stopNode>
          Text before
          <tag1>content1</tag1>
          <!-- comment -->
          <![CDATA[cdata content with <tags>]]>
          <?pi instruction?>
          <tag2 attr="value">content2</tag2>
          Text after
          <stopNode>nested</stopNode>
          Final text
        </stopNode>
        <after>parsed</after>
      </root>`;

    const options = {
      tags: { stopNodes: ["root.stopNode"] }
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(typeof result.root.stopNode).toBe("string");
    expect(result.root.stopNode).toContain("Text before");
    expect(result.root.stopNode).toContain("<tag1>content1</tag1>");
    expect(result.root.stopNode).toContain("<!-- comment -->");
    expect(result.root.stopNode).toContain("<![CDATA[cdata content with <tags>]]>");
    expect(result.root.stopNode).toContain("<?pi instruction?>");
    expect(result.root.stopNode).toContain("<tag2 attr=\"value\">content2</tag2>");
    expect(result.root.stopNode).toContain("<stopNode>nested</stopNode>");
    expect(result.root.stopNode).toContain("Final text");
    expect(result.root.after).toBe("parsed");
  });

  it("should stop at multiple stop nodes with feesable input source", function () {
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
    for (let i = 0; i < xmlData.length; i++) {
      const ch = xmlData[i];
      parser.feed(ch);
    }
    const result = parser.end();

    expect(result.root.section1.data).toBe("parse this");
    expect(typeof result.root.section2).toBe("string");
    expect(typeof result.root.section3).toBe("string");
  });
});