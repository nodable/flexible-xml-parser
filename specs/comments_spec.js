import XMLParser from "../src/XMLParser.js";
import JsArrBuilder from "../src/OutputBuilders/JsArrBuilder.js";

describe("Comments", function () {

  it("should capture comments when nameFor.comment is set", function () {
    const xmlData = `
      <!--Students grades are uploaded by months-->
      <class_list>
         <student>
           <!--Student details-->
           <n>Tanmay</n>
           <!--Grade information-->
           <grade>A</grade>
         </student>
      </class_list>`;

    const parser = new XMLParser({ nameFor: { comment: "#comment" } });
    const result = parser.parse(xmlData);

    expect(result["#comment"]).toBeDefined();
    expect(result["#comment"]).toContain("Students grades are uploaded by months");
    expect(result.class_list.student["#comment"]).toBeDefined();
  });

  it("should preserve order with comments when using JsArrBuilder", function () {
    const xmlData = `
      <!--Root comment-->
      <root>
        <!--First comment-->
        <tag>value</tag>
        <!--Second comment-->
      </root>`;

    const parser = new XMLParser({
      nameFor: { comment: "#comment" },
      OutputBuilder: new JsArrBuilder(),
    });
    const result = parser.parse(xmlData);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("should omit comments when nameFor.comment is empty string (default)", function () {
    const xmlData = `
      <!--This comment should be omitted-->
      <root>
        <tag>value</tag>
        <!--Another omitted comment-->
      </root>`;

    const parser = new XMLParser(); // nameFor.comment defaults to ''
    const result = parser.parse(xmlData);

    expect(result["#comment"]).toBeUndefined();
    expect(result.root["#comment"]).toBeUndefined();
    expect(result.root.tag).toBe("value");
  });

  it("should exclude comments entirely when skip.comment is true", function () {
    const xmlData = `
      <!--Skipped-->
      <root>
        <tag>value</tag>
      </root>`;

    const parser = new XMLParser({ skip: { comment: true }, nameFor: { comment: "#comment" } });
    const result = parser.parse(xmlData);

    // skip.comment takes priority over nameFor.comment
    expect(result["#comment"]).toBeUndefined();
    expect(result.root.tag).toBe("value");
  });

  it("should handle comments with special characters", function () {
    const xmlData = `
      <root>
        <!-->> ISO DICTIONARY TYPES <<-->
        <!--Comment with & special < > chars-->
        <tag>value</tag>
      </root>`;

    const parser = new XMLParser({ nameFor: { comment: "#comment" } });
    const result = parser.parse(xmlData);

    expect(result.root["#comment"]).toBeDefined();
  });

  it("should handle multiple consecutive comments", function () {
    const xmlData = `
      <root>
        <!--First-->
        <!--Second-->
        <!--Third-->
        <tag>value</tag>
      </root>`;

    const parser = new XMLParser({ nameFor: { comment: "#comment" } });
    const result = parser.parse(xmlData);

    expect(result.root["#comment"]).toBeDefined();
  });

});
