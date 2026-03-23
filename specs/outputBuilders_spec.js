import XMLParser from "../src/XMLParser.js";
import JsArrBuilder from "../src/OutputBuilders/JsArrBuilder.js";
import JsMinArrBuilder from "../src/OutputBuilders/JsMinArrBuilder.js";
import JsObjOutputBuilder, { JsObjBuilder } from "../src/OutputBuilders/JsObjBuilder.js";

describe("Output Builders", function () {

  const xmlData = `
    <root>
      <items>
        <item id="1">First</item>
        <item id="2">Second</item>
        <item id="3">Third</item>
      </items>
      <single>value</single>
    </root>`;

  describe("JsObjBuilder (default)", function () {

    it("should build JavaScript object with arrays for repeated tags", function () {
      const parser = new XMLParser({
        skip: { attributes: false }
      });
      const result = parser.parse(xmlData);

      expect(result.root).toBeDefined();
      expect(Array.isArray(result.root.items.item)).toBe(true);
      expect(result.root.items.item.length).toBe(3);
      expect(result.root.single).toBe("value");
    });

    it("should handle nested objects", function () {
      const xml = `
        <root>
          <level1>
            <level2>
              <level3>deep value</level3>
            </level2>
          </level1>
        </root>`;

      const parser = new XMLParser();
      const result = parser.parse(xml);

      expect(result.root.level1.level2.level3).toBe("deep value");
    });

  });

  describe("JsArrBuilder", function () {

    it("should preserve document order in array format", function () {
      const options = {
        OutputBuilder: new JsArrBuilder(),
        skip: { attributes: false }
      };

      const parser = new XMLParser(options);
      const result = parser.parse(xmlData);

      expect(result).toBeDefined();
      expect(result.tagname).toBe("root");
      expect(Array.isArray(result.child)).toBe(true);
    });

    it("should handle attributes in array format", function () {
      const xml = `<root attr="value"><tag>content</tag></root>`;
      const options = {
        OutputBuilder: new JsArrBuilder(),
        skip: { attributes: false }
      };

      const parser = new XMLParser(options);
      const result = parser.parse(xml);

      expect(result[":@"]).toBeDefined();
      expect(result[":@"]["@_attr"]).toBe("value");
    });

  });

  describe("JsMinArrBuilder", function () {

    it("should create minimal array format", function () {
      const options = {
        OutputBuilder: new JsMinArrBuilder(),
        skip: { attributes: false }
      };

      const parser = new XMLParser(options);
      const result = parser.parse(xmlData);

      expect(result).toBeDefined();
      expect(Array.isArray(result.child)).toBe(true);
    });

  });

  describe("Custom Output Builder", function () {

    it("should allow custom output builder implementation via factory pattern", function () {
      // JsObjBuilder is the internal per-parse instance class.
      // To provide a custom OutputBuilder to XMLParser you need a factory object
      // with a getInstance() method — exactly as shown in customOutputBuilder_spec.js.
      class CustomBuilder extends JsObjBuilder {
        closeTag(matcher) {
          super.closeTag(matcher);
        }
      }

      const factory = {
        getInstance(parserOptions) {
          const base = new JsObjOutputBuilder();
          const parsers = { ...base.registeredParsers };
          return new CustomBuilder(parserOptions, base.options, parsers);
        },
        registerValueParser() {},
      };

      const parser = new XMLParser({ OutputBuilder: factory });
      const result = parser.parse("<root><tag>value</tag></root>");

      expect(result.root.tag).toBe("value");
    });

  });

});
