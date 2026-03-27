import XMLParser from "../src/XMLParser.js";
import JsObjOutputBuilder, { JsObjBuilder } from "../src/OutputBuilders/JsObjBuilder.js";
import { Expression } from "path-expression-matcher";


const rootItemExp = new Expression('root.item');

describe("Output Builder Options - forceArray and forceTextNode", function () {

  describe("forceArray option - JsObjBuilder", function () {

    it("should force single tag into array when forceArray returns true", function () {
      const xmlData = `
        <root>
          <item>Single</item>
        </root>`;
      const expected = {
        "root": {
          "item": ["Single"]
        }
      }
      const parser = new XMLParser({
        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(rootItemExp);
          }
        })
      });

      const result = parser.parse(xmlData);
      expect(result).toEqual(expected);
    });

    it("should force array based on tag path pattern", function () {
      const xmlData = `
        <root>
          <items>
            <item>First</item>
            <product>Product 1</product>
          </items>
        </root>`;

      const expected = {
        "root": {
          "items": {
            "item": [
              "First"
            ],
            "product": [
              "Product 1"
            ]
          }
        }
      }


      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            // Force all tags under 'items' to be arrays
            return matcher.matches(new Expression('root.items.*'));
          }
        })
      });

      const result = parser.parse(xmlData);

      // console.log(JSON.stringify(result, null, 2));

      expect(result).toEqual(expected);

    });

    it("should work with isLeafNode parameter", function () {
      const xmlData = `
        <root>
          <simple>text</simple>
          <complex><child>value</child></complex>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            // Force only leaf nodes to be arrays
            return isLeafNode === true;
          }
        })
      });

      const result = parser.parse(xmlData);

      expect(Array.isArray(result.root.simple)).toBe(true);
      expect(result.root.simple[0]).toBe("text");
      // Complex has a child, so isLeafNode is false
      expect(Array.isArray(result.root.complex)).toBe(false);
    });

    it("should handle multiple occurrences with forceArray", function () {
      const xmlData = `
        <root>
          <item>First</item>
          <item>Second</item>
          <item>Third</item>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(rootItemExp);
          }
        })
      });

      const result = parser.parse(xmlData);

      expect(Array.isArray(result.root.item)).toBe(true);
      expect(result.root.item.length).toBe(3);
      expect(result.root.item[0]).toBe("First");
      expect(result.root.item[1]).toBe("Second");
      expect(result.root.item[2]).toBe("Third");
    });

    it("should use matcher attributes in forceArray callback", function () {
      const xmlData = `
        <root>
          <item type="special">Value 1</item>
          <item type="normal">Value 2</item>
        </root>`;

      const parser = new XMLParser({
        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            // Force array only for items with type="special"
            return matcher.matches(rootItemExp) &&
              matcher.attributes?.type === 'special';
          }
        })
      });

      const result = parser.parse(xmlData);

      // First item should be in array, but since we have 2 items total,
      // the natural behavior creates an array anyway
      expect(Array.isArray(result.root.item)).toBe(true);
      expect(result.root.item.length).toBe(2);
    });

    it("should handle nested tags with forceArray", function () {
      const xmlData = `
        <root>
          <level1>
            <level2>
              <target>Value</target>
            </level2>
          </level1>
        </root>`;

      const expected = {
        "root": {
          "level1": {
            "level2": {
              "target": [
                "Value"
              ]
            }
          }
        }
      }

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(new Expression('..target'));
          }
        })
      });

      const result = parser.parse(xmlData);
      // console.log(JSON.stringify(result, null, 2));
      expect(result).toEqual(expected);
    });

    it("should handle forceArray with tags containing attributes", function () {
      const xmlData = `
        <root>
          <item id="1">First</item>
        </root>`;

      const parser = new XMLParser({
        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(rootItemExp);
          }
        })
      });

      const result = parser.parse(xmlData);

      // console.log(JSON.stringify(result, null, 2));

      expect(Array.isArray(result.root.item)).toBe(true);
      expect(result.root.item.length).toBe(1);
      expect(result.root.item[0]["@_id"]).toBe(1);
      expect(result.root.item[0]["#text"]).toBe("First");
    });

  });

  describe("forceTextNode option - JsObjBuilder", function () {

    it("should create text node for leaf tag when forceTextNode is true", function () {
      const xmlData = `
        <root>
          <item>Value</item>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      });

      const result = parser.parse(xmlData);

      // Without forceTextNode, item would be "Value"
      // With forceTextNode, item should be { "#text": "Value" }
      expect(typeof result.root.item).toBe("object");
      expect(result.root.item["#text"]).toBe("Value");
    });

    it("should create text node even when tag has no text content", function () {
      const xmlData = `
        <root>
          <empty></empty>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      });

      const result = parser.parse(xmlData);

      // console.log(JSON.stringify(result));

      expect(typeof result.root.empty).toBe("object");
      expect(result.root.empty["#text"]).toBe("");
    });

    it("should work with tags that have attributes", function () {
      const xmlData = `
        <root>
          <item id="1">Value</item>
        </root>`;

      const parser = new XMLParser({
        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      });

      const result = parser.parse(xmlData);

      expect(result.root.item["@_id"]).toBe(1);
      expect(result.root.item["#text"]).toBe("Value");
    });

    it("should work with tags that have child elements", function () {
      const xmlData = `
        <root>
          <parent>
            <child>Value</child>
          </parent>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      });

      const result = parser.parse(xmlData);

      // Parent has a child, so it already has object structure
      // forceTextNode adds #text even though parent has no direct text
      expect(result.root.parent.child["#text"]).toBe("Value");
      expect(result.root.parent["#text"]).toBe("");
    });

    it("should preserve text when tag has both text and children", function () {
      const xmlData = `
        <root>
          <mixed>Text before<child>Child value</child>Text after</mixed>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      });

      const result = parser.parse(xmlData);

      expect(result.root.mixed["#text"]).toBe("Text beforeText after");
      expect(result.root.mixed.child["#text"]).toBe("Child value");
    });

    it("should use custom text node name with forceTextNode", function () {
      const xmlData = `
        <root>
          <item>Value</item>
        </root>`;

      const expected = {
        "root": {
          "item": {
            "textContent": "Value"
          },
          "textContent": ""
        }
      }


      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true,
        }),
        nameFor: {
          text: "textContent"
        }
      });

      const result = parser.parse(xmlData);

      // console.log(JSON.stringify(result, null, 2));
      expect(result).toEqual(expected);
    });

    it("should handle empty tags with attributes and forceTextNode", function () {
      const xmlData = `
        <root>
          <item id="1" />
        </root>`;
      const expected = {
        "root": {
          "item": {
            "@_id": 1,
            "#text": ""
          },
          "#text": ""
        }
      }

      const parser = new XMLParser({
        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      });

      const result = parser.parse(xmlData);
      // console.log(JSON.stringify(result, null, 2));
      expect(result).toEqual(expected);
    });

  });

  describe("Combined forceArray and forceTextNode - JsObjBuilder", function () {

    it("should work together - force array and text node", function () {
      const xmlData = `
        <root>
          <item>Single Value</item>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => matcher.matches(rootItemExp),
          forceTextNode: true
        })
      });

      const result = parser.parse(xmlData);

      expect(Array.isArray(result.root.item)).toBe(true);
      expect(result.root.item.length).toBe(1);
      expect(result.root.item[0]["#text"]).toBe("Single Value");
    });

    it("should handle multiple items with both options", function () {
      const xmlData = `
        <root>
          <item>First</item>
          <item>Second</item>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => matcher.matches(rootItemExp),
          forceTextNode: true
        })
      });

      const result = parser.parse(xmlData);

      expect(Array.isArray(result.root.item)).toBe(true);
      expect(result.root.item.length).toBe(2);
      expect(result.root.item[0]["#text"]).toBe("First");
      expect(result.root.item[1]["#text"]).toBe("Second");
    });

  });

  describe("Edge cases and error handling", function () {

    it("should handle forceArray returning non-boolean gracefully", function () {
      const xmlData = `<root><item>Value</item></root>`;
      const expected = {
        "root": [
          {
            "item": [
              "Value"
            ]
          }
        ]
      }
      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return "true";  // String instead of boolean
          }
        })
      });

      const result = parser.parse(xmlData);
      // console.log(JSON.stringify(result, null, 2));
      // Truthy value should work
      expect(result).toEqual(expected);
    });

    it("should handle forceArray with null isLeafNode", function () {
      const xmlData = `<root><item>Value</item></root>`;

      let capturedIsLeafNode;
      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            capturedIsLeafNode = isLeafNode;
            return false;
          }
        })
      });

      parser.parse(xmlData);

      // isLeafNode should be either true or false, not null in this case
      expect(typeof capturedIsLeafNode).toBe("boolean");
    });

    it("should handle deeply nested paths in forceArray", function () {
      const xmlData = `
        <root>
          <a><b><c><d><e>Deep</e></d></c></b></a>
        </root>`;

      const expected = {
        "root": {
          "a": {
            "b": {
              "c": {
                "d": {
                  "e": ["Deep"]
                }
              }
            }
          }
        }
      }

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(new Expression('root.a.b.c.d.e'));
          }
        })
      });

      const result = parser.parse(xmlData);

      // console.log(JSON.stringify(result, null, 2));
      expect(result).toEqual(expected);
    });

  });

  describe("Performance and consistency", function () {

    it("should maintain consistent behavior across multiple tags", function () {
      const xmlData = `
        <root>
          <item>1</item>
          <item>2</item>
          <item>3</item>
          <item>4</item>
          <item>5</item>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => matcher.matches(rootItemExp)
        })
      });

      const result = parser.parse(xmlData);


      expect(Array.isArray(result.root.item)).toBe(true);
      expect(result.root.item.length).toBe(5);
      for (let i = 0; i < 5; i++) {
        expect(result.root.item[i]).toBe((i + 1));
      }
    });

    it("should work correctly with mixed content", function () {
      const xmlData = `
        <root>
          <forceArray>Single</forceArray>
          <normal>Value</normal>
          <forceArray>Another</forceArray>
        </root>`;

      const parser = new XMLParser({
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(new Expression('root.forceArray'));
          }
        })
      });

      const result = parser.parse(xmlData);

      expect(Array.isArray(result.root.forceArray)).toBe(true);
      expect(result.root.forceArray.length).toBe(2);
      expect(result.root.normal).toBe("Value");
    });

  });

});