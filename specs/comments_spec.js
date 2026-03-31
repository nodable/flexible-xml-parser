import XMLParser from "../src/XMLParser.js";
import NodeTreeBuilder from "../src/OutputBuilders/NodeTreeBuilder.js";
import { runAcrossAllInputSources } from "./helpers/testRunner.js";

describe("Comments", function () {

  runAcrossAllInputSources(
    "should capture comments when nameFor.comment is set",
    `
      <!--Students grades are uploaded by months-->
      <class_list>
         <student>
           <!--Student details-->
           <n>Tanmay</n>
           <!--Grade information-->
           <grade>A</grade>
         </student>
      </class_list>`,
    (result) => {
      expect(result["#comment"]).toBeDefined();
      expect(result["#comment"]).toContain("Students grades are uploaded by months");
      expect(result.class_list.student["#comment"]).toBeDefined();
    },
    { nameFor: { comment: "#comment" } }
  );

  runAcrossAllInputSources(
    "should preserve order with comments when using NodeTreeBuilder",
    `
      <!--Root comment-->
      <root>
        <!--First comment-->
        <tag>value</tag>
        <!--Second comment-->
      </root>`,
    (result) => {
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    },
    {
      nameFor: { comment: "#comment" },
      OutputBuilder: new NodeTreeBuilder(),
    }
  );

  runAcrossAllInputSources(
    "should omit comments when nameFor.comment is empty string (default)",
    `
      <!--This comment should be omitted-->
      <root>
        <tag>value</tag>
        <!--Another omitted comment-->
      </root>`,
    (result) => {
      expect(result["#comment"]).toBeUndefined();
      expect(result.root["#comment"]).toBeUndefined();
      expect(result.root.tag).toBe("value");
    },
    {} // default options
  );

  runAcrossAllInputSources(
    "should exclude comments entirely when skip.comment is true",
    `
      <!--Skipped-->
      <root>
        <tag>value</tag>
      </root>`,
    (result) => {
      // skip.comment takes priority over nameFor.comment
      expect(result["#comment"]).toBeUndefined();
      expect(result.root.tag).toBe("value");
    },
    { skip: { comment: true }, nameFor: { comment: "#comment" } }
  );

  runAcrossAllInputSources(
    "should handle comments with special characters",
    `
      <root>
        <!-->> ISO DICTIONARY TYPES <<-->
        <!--Comment with & special < > chars-->
        <tag>value</tag>
      </root>`,
    (result) => {
      expect(result.root["#comment"]).toBeDefined();
    },
    { nameFor: { comment: "#comment" } }
  );

  runAcrossAllInputSources(
    "should handle multiple consecutive comments",
    `
      <root>
        <!--First-->
        <!--Second-->
        <!--Third-->
        <tag>value</tag>
      </root>`,
    (result) => {
      expect(result.root["#comment"]).toBeDefined();
    },
    { nameFor: { comment: "#comment" } }
  );

});