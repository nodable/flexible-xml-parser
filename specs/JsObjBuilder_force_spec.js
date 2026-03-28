import XMLParser from "../src/XMLParser.js";
import JsObjOutputBuilder, { JsObjBuilder } from "../src/OutputBuilders/JsObjBuilder.js";
import { Expression } from "path-expression-matcher";
import {
  frunAcrossAllInputSources,
  runAcrossAllInputSources,
  runAcrossAllInputSourcesWithFactory
} from "./helpers/testRunner.js";


const rootItemExp = new Expression('root.item');

describe("Output Builder Options - forceArray and forceTextNode", function () {

  describe("forceArray option - JsObjBuilder", function () {

    runAcrossAllInputSources(
      "should force single tag into array when forceArray returns true",
      `
        <root>
          <item>Single</item>
        </root>`,
      (result) => {
        const expected = {
          "root": {
            "item": ["Single"]
          }
        };
        expect(result).toEqual(expected);
      },
      {
        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(rootItemExp);
          }
        })
      }
    );

    runAcrossAllInputSources(
      "should force array based on tag path pattern",
      `
        <root>
          <items>
            <item>First</item>
            <product>Product 1</product>
          </items>
        </root>`,
      (result) => {
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
        };
        expect(result).toEqual(expected);
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            // Force all tags under 'items' to be arrays
            return matcher.matches(new Expression('root.items.*'));
          }
        })
      });

    runAcrossAllInputSources(
      "should work with isLeafNode parameter",
      `
        <root>
          <simple>text</simple>
          <complex><child>value</child></complex>
        </root>`,
      (result) => {
        expect(Array.isArray(result.root.simple)).toBe(true);
        expect(result.root.simple[0]).toBe("text");
        // Complex has a child, so isLeafNode is false
        expect(Array.isArray(result.root.complex)).toBe(false);
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            // Force only leaf nodes to be arrays
            return isLeafNode === true;
          }
        })
      });

    runAcrossAllInputSources(
      "should handle multiple occurrences with forceArray",
      `
        <root>
          <item>First</item>
          <item>Second</item>
          <item>Third</item>
        </root>`,
      (result) => {
        expect(Array.isArray(result.root.item)).toBe(true);
        expect(result.root.item.length).toBe(3);
        expect(result.root.item[0]).toBe("First");
        expect(result.root.item[1]).toBe("Second");
        expect(result.root.item[2]).toBe("Third");
      },
      {
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(rootItemExp);
          }
        })
      }
    );

    runAcrossAllInputSources(
      "should use matcher attributes in forceArray callback",
      `
        <root>
          <item type="special">Value 1</item>
          <item type="normal">Value 2</item>
        </root>`,
      (result) => {
        // First item should be in array, but since we have 2 items total,
        // the natural behavior creates an array anyway
        expect(Array.isArray(result.root.item)).toBe(true);
        expect(result.root.item.length).toBe(2);
      },
      {

        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            // Force array only for items with type="special"
            return matcher.matches(rootItemExp) &&
              matcher.attributes?.type === 'special';
          }
        })
      }
    );

    runAcrossAllInputSources(
      "should handle nested tags with forceArray",
      `
        <root>
          <level1>
            <level2>
              <target>Value</target>
            </level2>
          </level1>
        </root>`,
      (result) => {
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
        };
        expect(result).toEqual(expected);
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(new Expression('..target'));
          }
        })
      }
    );

    runAcrossAllInputSources(
      "should handle forceArray with tags containing attributes",
      `
        <root>
          <item id="1">First</item>
        </root>`,
      (result) => {
        expect(Array.isArray(result.root.item)).toBe(true);
        expect(result.root.item.length).toBe(1);
        expect(result.root.item[0]["@_id"]).toBe(1);
        expect(result.root.item[0]["#text"]).toBe("First");
      },
      {

        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(rootItemExp);
          }
        })
      }
    );

  });

  describe("forceTextNode option - JsObjBuilder", function () {

    runAcrossAllInputSources(
      "should create text node for leaf tag when forceTextNode is true",
      `
        <root>
          <item>Value</item>
        </root>`,
      (result) => {
        // Without forceTextNode, item would be "Value"
        // With forceTextNode, item should be { "#text": "Value" }
        expect(typeof result.root.item).toBe("object");
        expect(result.root.item["#text"]).toBe("Value");
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      }
    );

    runAcrossAllInputSources(
      "should create text node even when tag has no text content",
      `
        <root>
          <empty></empty>
        </root>`,
      (result) => {
        expect(typeof result.root.empty).toBe("object");
        expect(result.root.empty["#text"]).toBe("");
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      }
    );

    runAcrossAllInputSources(
      "should work with tags that have attributes",
      `
        <root>
          <item id="1">Value</item>
        </root>`,
      (result) => {
        expect(result.root.item["@_id"]).toBe(1);
        expect(result.root.item["#text"]).toBe("Value");
      },
      {

        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      }
    );

    runAcrossAllInputSources(
      "should work with tags that have child elements",
      `
        <root>
          <parent>
            <child>Value</child>
          </parent>
        </root>`,
      (result) => {
        // Parent has a child, so it already has object structure
        // forceTextNode adds #text even though parent has no direct text
        expect(result.root.parent.child["#text"]).toBe("Value");
        expect(result.root.parent["#text"]).toBe("");
      },
      {
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      }
    );

    runAcrossAllInputSources(
      "should preserve text when tag has both text and children",
      `
        <root>
          <mixed>Text before<child>Child value</child>Text after</mixed>
        </root>`,
      (result) => {
        expect(result.root.mixed["#text"]).toBe("Text beforeText after");
        expect(result.root.mixed.child["#text"]).toBe("Child value");
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      }
    );

    runAcrossAllInputSources(
      "should use custom text node name with forceTextNode",
      `
        <root>
          <item>Value</item>
        </root>`,
      (result) => {
        const expected = {
          "root": {
            "item": {
              "textContent": "Value"
            },
            "textContent": ""
          }
        };
        expect(result).toEqual(expected);
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true,
        }),
        nameFor: {
          text: "textContent"
        }
      }
    );

    runAcrossAllInputSources(
      "should handle empty tags with attributes and forceTextNode",
      `
        <root>
          <item id="1" />
        </root>`,
      (result) => {
        const expected = {
          "root": {
            "item": {
              "@_id": 1,
              "#text": ""
            },
            "#text": ""
          }
        };
        expect(result).toEqual(expected);
      },
      {

        skip: { attributes: false },
        OutputBuilder: new JsObjOutputBuilder({
          forceTextNode: true
        })
      }
    );

  });

  describe("Combined forceArray and forceTextNode - JsObjBuilder", function () {

    runAcrossAllInputSources(
      "should work together - force array and text node",
      `
        <root>
          <item>Single Value</item>
        </root>`,
      (result) => {
        expect(Array.isArray(result.root.item)).toBe(true);
        expect(result.root.item.length).toBe(1);
        expect(result.root.item[0]["#text"]).toBe("Single Value");
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => matcher.matches(rootItemExp),
          forceTextNode: true
        })
      }
    );

    runAcrossAllInputSources(
      "should handle multiple items with both options",
      `
        <root>
          <item>First</item>
          <item>Second</item>
        </root>`,
      (result) => {
        expect(Array.isArray(result.root.item)).toBe(true);
        expect(result.root.item.length).toBe(2);
        expect(result.root.item[0]["#text"]).toBe("First");
        expect(result.root.item[1]["#text"]).toBe("Second");
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => matcher.matches(rootItemExp),
          forceTextNode: true
        })
      }
    );

  });

  describe("Edge cases and error handling", function () {

    runAcrossAllInputSources(
      "should handle forceArray returning non-boolean gracefully",
      `<root><item>Value</item></root>`,
      (result) => {
        const expected = {
          "root": [
            {
              "item": [
                "Value"
              ]
            }
          ]
        };
        // Truthy value should work
        expect(result).toEqual(expected);
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return "true";  // String instead of boolean
          }
        })
      }
    );

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

    runAcrossAllInputSources(
      "should handle deeply nested paths in forceArray",
      `
        <root>
          <a><b><c><d><e>Deep</e></d></c></b></a>
        </root>`,
      (result) => {
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
        };
        expect(result).toEqual(expected);
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(new Expression('root.a.b.c.d.e'));
          }
        })
      }
    );

  });

  describe("Performance and consistency", function () {

    runAcrossAllInputSources(
      "should maintain consistent behavior across multiple tags",
      `
        <root>
          <item>1</item>
          <item>2</item>
          <item>3</item>
          <item>4</item>
          <item>5</item>
        </root>`,
      (result) => {
        expect(Array.isArray(result.root.item)).toBe(true);
        expect(result.root.item.length).toBe(5);
        for (let i = 0; i < 5; i++) {
          expect(result.root.item[i]).toBe((i + 1));
        }
      },
      {
        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => matcher.matches(rootItemExp)
        })
      }
    );

    runAcrossAllInputSources(
      "should work correctly with mixed content",
      `
        <root>
          <forceArray>Single</forceArray>
          <normal>Value</normal>
          <forceArray>Another</forceArray>
        </root>`,
      (result) => {
        expect(Array.isArray(result.root.forceArray)).toBe(true);
        expect(result.root.forceArray.length).toBe(2);
        expect(result.root.normal).toBe("Value");
      },
      {

        OutputBuilder: new JsObjOutputBuilder({
          forceArray: (matcher, isLeafNode) => {
            return matcher.matches(new Expression('root.forceArray'));
          }
        })
      }
    );

  });

});