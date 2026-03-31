import XMLParser from "../src/XMLParser.js";
import { xmlEnclosures, quoteEnclosures } from "../src/StopNodeProcessor.js";
import {
  runAcrossAllInputSources,
  frunAcrossAllInputSources,
  xrunAcrossAllInputSources,
  runAcrossAllInputSourcesWithException,
} from "./helpers/testRunner.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic stop node functionality
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — basic functionality", function () {

  runAcrossAllInputSources(
    "should stop parsing at specified nodes",
    `
      <root>
        <parse>
          <child>This is parsed</child>
        </parse>
        <dontparse>
          <child>This should not be parsed</child>
        </dontparse>
      </root>`,
    (result) => {
      expect(result.root.parse.child).toBe("This is parsed");
      expect(typeof result.root.dontparse).toBe("string");
      expect(result.root.dontparse).toContain("<child>");
    },
    { tags: { stopNodes: ["root.dontparse"] } }
  );

  runAcrossAllInputSources(
    "should stop at multiple stop nodes",
    `
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
      </root>`,
    (result) => {
      expect(result.root.section1.data).toBe("parse this");
      expect(typeof result.root.section2).toBe("string");
      expect(typeof result.root.section3).toBe("string");
    },
    { tags: { stopNodes: ["root.section2", "root.section3"] } }
  );

  runAcrossAllInputSources(
    "should handle nested stop nodes",
    `
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
      </root>`,
    (result) => {
      expect(result.root.level1.level2.level3.data).toBe("parse");
      expect(typeof result.root.stop.level2).toBe("string");
    },
    { tags: { stopNodes: ["root.stop.level2"] } }
  );

  runAcrossAllInputSources(
    "should preserve attributes in stop nodes",
    `
      <root>
        <stopNode attr="value">
          <child>content</child>
        </stopNode>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("object");
      expect(result.root.stopNode["@_attr"]).toBe("value");
    },
    { tags: { stopNodes: ["root.stopNode"] }, skip: { attributes: false } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Edge cases — same name tags and special content
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — same name tags and special content", function () {

  // Plain string: skipEnclosures: [] → no depth tracking → first </stopNode> wins.
  // The nested <stopNode>...</stopNode> ends collection at the INNER close tag.
  // So the outer stopNode content is everything up to the first </stopNode>.
  runAcrossAllInputSources(
    "plain string stopNode: first closing tag ends collection (no depth tracking)",
    `
      <root>
        <stopNode>
          <data>level 1</data>
          <stopNode>
            <data>level 2 - nested stopNode</data>
          </stopNode>
          <data>back to level 1</data>
        </stopNode>
      </root>`,
    (result) => {
      // Plain mode: ends at the FIRST </stopNode> (the inner one)
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("<stopNode>");
      expect(result.root.stopNode).toContain("</stopNode>");
      expect(result.root.stopNode).toContain("level 2 - nested stopNode");
    },
    { tags: { stopNodes: [{ "expression": "root.stopNode", "nested": true }] } }
  );

  // With xmlEnclosures, depth tracking is active → outer close tag ends collection.
  runAcrossAllInputSources(
    "xmlEnclosures stopNode: depth tracking — outer closing tag ends collection",
    `
      <root>
        <stopNode>
          <data>level 1</data>
          <stopNode>
            <data>level 2 - nested stopNode</data>
          </stopNode>
          <data>back to level 1</data>
        </stopNode>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("<stopNode>");
      expect(result.root.stopNode).toContain("</stopNode>");
      expect(result.root.stopNode).toContain("level 2 - nested stopNode");
      expect(result.root.stopNode).toContain("back to level 1");
    },
    { tags: { stopNodes: [{ expression: "root.stopNode", nested: true }] } }
  );

  runAcrossAllInputSources(
    "should handle self-closing tags with same name in stopNode",
    `
      <root>
        <stopNode>
          <data>content</data>
          <stopNode attr="value"/>
          <moreData>more content</moreData>
        </stopNode>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain('<stopNode attr="value"/>');
      expect(result.root.stopNode).toContain("<moreData>more content</moreData>");
    },
    { tags: { stopNodes: ["root.stopNode"] } }
  );

  runAcrossAllInputSources(
    "should handle attributes with > character in stopNode opening tag",
    `
      <root>
        <stopNode attr="value > 10" other='contains ">" char'>
          <data>content</data>
        </stopNode>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("object");
      expect(result.root.stopNode["@_attr"]).toContain(">");
    },
    { tags: { stopNodes: ["root.stopNode"] }, skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "should handle multiple nested same-name tags in stopNode (xmlEnclosures, depth tracking)",
    `
      <root>
        <item>
          <item>
            <item>
              <data>deeply nested</data>
            </item>
          </item>
        </item>
        <afterItem>parsed normally</afterItem>
      </root>`,
    (result) => {
      expect(typeof result.root.item).toBe("string");
      expect(result.root.item.split("<item>").length).toBe(3);
      expect(result.root.item.split("</item>").length).toBe(3);
      expect(result.root.afterItem).toBe("parsed normally");
    },
    { tags: { stopNodes: [{ expression: "root.item", nested: true }] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Comments and CDATA handling in stop nodes
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — comments and CDATA handling", function () {

  // Requires xmlEnclosures so comment interior is skipped
  runAcrossAllInputSources(
    "should ignore closing tag in comments within stopNode (xmlEnclosures)",
    `
      <root>
        <stopNode>
          <data>some data</data>
          <!-- This comment contains </stopNode> which should be ignored -->
          <moreData>more content</moreData>
        </stopNode>
        <afterStop>parsed</afterStop>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("<!-- This comment contains </stopNode> which should be ignored -->");
      expect(result.root.stopNode).toContain("<moreData>more content</moreData>");
      expect(result.root.afterStop).toBe("parsed");
    },
    { tags: { stopNodes: [{ expression: "root.stopNode", skipEnclosures: [...xmlEnclosures] }] } }
  );

  // Plain string: comment is NOT skipped → </stopNode> inside comment ends collection
  runAcrossAllInputSources(
    "plain string stopNode: closing tag inside comment IS matched (no enclosure skipping)",
    `
      <root>
        <stopNode>
          <data>some data</data>
          <!-- This comment contains </stopNode> which ends collection in plain mode -->
          <moreData>more content</moreData>
        </stopNode>
        <afterStop>parsed</afterStop>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      // Collection ended at the </stopNode> inside the comment
      expect(result.root.stopNode).toContain("<!-- This comment contains ");
      expect(result.root.stopNode).toContain("<moreData>");
    },
    { tags: { stopNodes: [{ expression: "root.stopNode", skipEnclosures: [{ open: '<!--', close: '-->' }] }] } }
  );

  // Requires xmlEnclosures so CDATA interior is skipped
  runAcrossAllInputSources(
    "should ignore closing tag in CDATA within stopNode (xmlEnclosures)",
    `
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
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("<![CDATA[");
      expect(result.root.stopNode).toContain("</stopNode> and <stopNode>");
      expect(result.root.stopNode).toContain("<data>after cdata</data>");
      expect(result.root.afterStop).toBe("parsed");
    },
    { tags: { stopNodes: [{ expression: "root.stopNode", skipEnclosures: [...xmlEnclosures] }] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Processing instructions and DOCTYPE in stop nodes
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — PIs and DOCTYPE handling", function () {

  // Requires xmlEnclosures so PI interior is skipped
  runAcrossAllInputSources(
    "should handle processing instructions within stopNode (xmlEnclosures)",
    `
      <root>
        <stopNode>
          <data>before PI</data>
          <?xml-stylesheet type="text/xsl" href="style.xsl"?>
          <?custom-pi data="value" with="</stopNode> in it"?>
          <data>after PI</data>
        </stopNode>
        <afterStop>parsed</afterStop>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("<?xml-stylesheet");
      expect(result.root.stopNode).toContain("<?custom-pi");
      expect(result.root.stopNode).toContain("<data>after PI</data>");
      expect(result.root.afterStop).toBe("parsed");
    },
    { tags: { stopNodes: [{ expression: "root.stopNode", skipEnclosures: [...xmlEnclosures] }] } }
  );

  runAcrossAllInputSources(
    "should handle DOCTYPE declarations within stopNode (xmlEnclosures)",
    `
      <root>
        <stopNode>
          <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
            "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
          <data>after doctype</data>
        </stopNode>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("<!DOCTYPE");
      expect(result.root.stopNode).toContain("<data>after doctype</data>");
    },
    { tags: { stopNodes: [{ expression: "root.stopNode", skipEnclosures: [...xmlEnclosures] }] } }
  );

  runAcrossAllInputSources(
    "should handle complex DOCTYPE with internal subset in stopNode (xmlEnclosures)",
    `
      <root>
        <stopNode>
          <!DOCTYPE doc [
            <!ELEMENT doc (item)*>
            <!ELEMENT item (#PCDATA)>
          ]>
          <data>content</data>
        </stopNode>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("<!DOCTYPE doc [");
      expect(result.root.stopNode).toContain("]>");
    },
    { tags: { stopNodes: [{ expression: "root.stopNode", skipEnclosures: [...xmlEnclosures] }] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Edge cases — empty and whitespace content
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — empty and whitespace content", function () {

  runAcrossAllInputSources(
    "should handle empty stopNode",
    `
      <root>
        <stopNode></stopNode>
        <after>parsed</after>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toBe("");
      expect(result.root.after).toBe("parsed");
    },
    { tags: { stopNodes: ["root.stopNode"] } }
  );

  runAcrossAllInputSources(
    "should handle stopNode with only whitespace",
    `
      <root>
        <stopNode>   
          
        </stopNode>
        <after>parsed</after>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.after).toBe("parsed");
    },
    { tags: { stopNodes: ["root.stopNode"] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Complex mixed content
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — complex mixed content", function () {

  runAcrossAllInputSources(
    "should handle complex mixed content in stopNode (xmlEnclosures)",
    `
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
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("Text before");
      expect(result.root.stopNode).toContain("<tag1>content1</tag1>");
      expect(result.root.stopNode).toContain("<!-- comment -->");
      expect(result.root.stopNode).toContain("<![CDATA[cdata content with <tags>]]>");
      expect(result.root.stopNode).toContain("<?pi instruction?>");
      expect(result.root.stopNode).toContain('<tag2 attr="value">content2</tag2>');
      expect(result.root.stopNode).toContain("<stopNode>nested</stopNode>");
      expect(result.root.stopNode).toContain("Final text");
      expect(result.root.after).toBe("parsed");
    },
    { tags: { stopNodes: [{ expression: "root.stopNode", nested: true, skipEnclosures: [...xmlEnclosures] }] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Error scenarios — unclosed tags and malformed content
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — error scenarios", function () {

  runAcrossAllInputSourcesWithException(
    "should throw error for unclosed stopNode",
    `
      <root>
        <stopNode>
          <data>content</data>
          <nested>
            <deep>value</deep>`,
    /unclosed/,
    { tags: { stopNodes: ["root.stopNode"] } }
  );

  // Unclosed comment/CDATA/PI errors only apply when xmlEnclosures is active
  runAcrossAllInputSourcesWithException(
    "should throw error for unclosed comment in stopNode (xmlEnclosures)",
    `
      <root>
        <stopNode>
          <data>content</data>
          <!-- unclosed comment
          <moreData>more</moreData>
        </stopNode>
      </root>`,
    "Unclosed stop node <stopNode> — unexpected end looking for '-->'",
    { tags: { stopNodes: [{ expression: "root.stopNode", skipEnclosures: [...xmlEnclosures] }] } }
  );

  runAcrossAllInputSourcesWithException(
    "should throw error for unclosed CDATA in stopNode (xmlEnclosures)",
    `
      <root>
        <stopNode>
          <data>content</data>
          <![CDATA[ unclosed cdata
          <moreData>more</moreData>
        </stopNode>
      </root>`,
    `Unclosed stop node <stopNode> — unexpected end looking for ']]>'`,
    { tags: { stopNodes: [{ expression: "root.stopNode", skipEnclosures: [...xmlEnclosures] }] } }
  );

  runAcrossAllInputSourcesWithException(
    "should throw error for unclosed PI in stopNode (xmlEnclosures)",
    `
      <root>
        <stopNode>
          <data>content</data>
          <?xml-stylesheet type="text/xsl" href="style.xsl"
          <moreData>more</moreData>
        </stopNode>
      </root>`,
    /unclosed/,
    { tags: { stopNodes: [{ expression: "root.stopNode", skipEnclosures: [...xmlEnclosures] }] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Whitespace handling in closing tags
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — whitespace in tags", function () {

  // Plain mode: first </stopNode ...> (with whitespace) is still matched correctly
  runAcrossAllInputSources(
    "should handle whitespace in the outer closing tag (plain mode)",
    `
      <root>
        <stopNode>
          <data>content</data>
          <nested>value</nested  >
        </stopNode >
        <after>parsed</after>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("<data>content</data>");
      expect(result.root.stopNode).toContain("<nested>value</nested  >");
      expect(result.root.after).toBe("parsed");
    },
    { tags: { stopNodes: ["root.stopNode"] } }
  );

  // With xmlEnclosures, depth tracking means inner <stopNode> is tracked;
  // whitespace in nested closing tags is preserved verbatim
  runAcrossAllInputSources(
    "should handle whitespace in closing tags within stopNode (xmlEnclosures)",
    `
      <root>
        <stopNode>
          <data>content</data>
          <nested>value</nested  >
          <stopNode >inner</stopNode   >
        </stopNode>
        <after>parsed</after>
      </root>`,
    (result) => {
      expect(typeof result.root.stopNode).toBe("string");
      expect(result.root.stopNode).toContain("<data>content</data>");
      expect(result.root.stopNode).toContain("<nested>value</nested  >");
      expect(result.root.stopNode).toContain("<stopNode >inner</stopNode   >");
      expect(result.root.after).toBe("parsed");
    },
    { tags: { stopNodes: [{ expression: "root.stopNode", nested: true, skipEnclosures: [...xmlEnclosures] }] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Feedable input source specific test
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — feedable input source", function () {

  it("should stop at multiple stop nodes with feedable input source", function () {
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

  it("should handle xmlEnclosures stop node with feedable input (chunk-boundary survival)", function () {
    const xmlData = `<root><s>text <!-- </s> fake --> real</s><after>ok</after></root>`;
    const options = {
      tags: { stopNodes: [{ expression: "root.s", skipEnclosures: [...xmlEnclosures] }] }
    };

    const parser = new XMLParser(options);
    for (let i = 0; i < xmlData.length; i++) {
      parser.feed(xmlData[i]);
    }
    const result = parser.end();

    expect(typeof result.root.s).toBe("string");
    expect(result.root.s).toContain("<!-- </s> fake -->");
    expect(result.root.s).toContain("real");
    expect(result.root.after).toBe("ok");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 10. skipEnclosures — explicit control
// ─────────────────────────────────────────────────────────────────────────────
describe("Stop Nodes — skipEnclosures", function () {

  // ── 10a. Plain [] vs xmlEnclosures ──────────────────────────────────────────

  runAcrossAllInputSources(
    "skipEnclosures: [] — first closing tag wins, no depth tracking",
    `<root><s>before <!-- </s> ends here --></s><after>ok</after></root>`,
    (result) => {
      expect(typeof result.root.s).toBe("string");
      // Collection ends at the </s> inside the comment
      expect(result.root.s).toContain("before <!-- ");
      expect(result.root.s).toContain("ends here");
      expect(result.root.after).toBe("ok");
    },
    { tags: { stopNodes: [{ expression: "root.s", skipEnclosures: [{ open: '<!--', close: '-->' }] }] } }
  );

  runAcrossAllInputSources(
    "skipEnclosures: xmlEnclosures — comment interior skipped, real closing tag wins",
    `<root><s>before <!-- </s> fake --> real</s><after>ok</after></root>`,
    (result) => {
      expect(typeof result.root.s).toBe("string");
      expect(result.root.s).toContain("<!-- </s> fake -->");
      expect(result.root.s).toContain("real");
      expect(result.root.after).toBe("ok");
    },
    { tags: { stopNodes: [{ expression: "root.s", skipEnclosures: [...xmlEnclosures] }] } }
  );

  runAcrossAllInputSources(
    "skipEnclosures: xmlEnclosures — CDATA interior skipped",
    `<root><s>a <![CDATA[</s> hidden]]> b</s><after>ok</after></root>`,
    (result) => {
      expect(typeof result.root.s).toBe("string");
      expect(result.root.s).toContain("<![CDATA[</s> hidden]]>");
      expect(result.root.s).toContain("b");
      expect(result.root.after).toBe("ok");
    },
    { tags: { stopNodes: [{ expression: "root.s", skipEnclosures: [...xmlEnclosures] }] } }
  );

  runAcrossAllInputSources(
    "skipEnclosures: xmlEnclosures — PI interior skipped",
    `<root><s>a <?pi </s> fake?> b</s><after>ok</after></root>`,
    (result) => {
      expect(typeof result.root.s).toBe("string");
      expect(result.root.s).toContain("<?pi </s> fake?>");
      expect(result.root.s).toContain("b");
      expect(result.root.after).toBe("ok");
    },
    { tags: { stopNodes: [{ expression: "root.s", skipEnclosures: [...xmlEnclosures] }] } }
  );

  // ── 10b. quoteEnclosures ───────────────────────────────────────────────────

  runAcrossAllInputSources(
    "skipEnclosures: quoteEnclosures — closing tag inside double-quote skipped",
    `<root><script>var x = "</script>"; done</script><after>ok</after></root>`,
    (result) => {
      expect(typeof result.root.script).toBe("string");
      expect(result.root.script).toContain('var x = "</script>";');
      expect(result.root.script).toContain("done");
      expect(result.root.after).toBe("ok");
    },
    { tags: { stopNodes: [{ expression: "root.script", skipEnclosures: [...quoteEnclosures] }] } }
  );

  runAcrossAllInputSources(
    "skipEnclosures: quoteEnclosures — closing tag inside single-quote skipped",
    `<root><script>var x = '</script>'; done</script><after>ok</after></root>`,
    (result) => {
      expect(typeof result.root.script).toBe("string");
      expect(result.root.script).toContain("var x = '</script>';");
      expect(result.root.script).toContain("done");
      expect(result.root.after).toBe("ok");
    },
    { tags: { stopNodes: [{ expression: "root.script", skipEnclosures: [...quoteEnclosures] }] } }
  );

  runAcrossAllInputSources(
    "skipEnclosures: quoteEnclosures — closing tag inside backtick skipped",
    "<root><script>var x = `</script>`; done</script><after>ok</after></root>",
    (result) => {
      expect(typeof result.root.script).toBe("string");
      expect(result.root.script).toContain("done");
      expect(result.root.after).toBe("ok");
    },
    { tags: { stopNodes: [{ expression: "root.script", skipEnclosures: [...quoteEnclosures] }] } }
  );

  // ── 10c. Combined xmlEnclosures + quoteEnclosures ──────────────────────────

  runAcrossAllInputSources(
    "skipEnclosures: combined — closing tag skipped inside both string and comment",
    `<root><style>a { content: "</style>"; } /* </style> kept */ </style><after>ok</after></root>`,
    (result) => {
      expect(typeof result.root.style).toBe("string");
      // Double-quote string skipped
      expect(result.root.style).toContain('"</style>"');
      expect(result.root.after).toBe("ok");
    },
    {
      tags: {
        stopNodes: [{
          expression: "root.style",
          nested: true,
          skipEnclosures: [
            ...quoteEnclosures,
            { open: "/*", close: "*/" }
          ]
        }]
      }
    }
  );

  // ── 10d. Custom enclosures ─────────────────────────────────────────────────

  runAcrossAllInputSources(
    "skipEnclosures: custom enclosure — closing tag inside custom pair skipped",
    `<root><s>START</s>END</s><after>ok</after></root>`,
    (result) => {
      expect(typeof result.root.s).toBe("string");
      expect(result.root.s).toContain("START");
      expect(result.root.s).toContain("END");
      expect(result.root.after).toBe("ok");
    },
    { tags: { stopNodes: [{ expression: "root.s", skipEnclosures: [{ open: "START", close: "END" }] }] } }
  );

  // ── 10e. Enclosure precedence ──────────────────────────────────────────────

  runAcrossAllInputSources(
    "skipEnclosures: first enclosure in array wins when both could match",
    // <!-- starts with '<' which also starts '<![CDATA['.
    // xmlEnclosures orders comment first, so <!-- wins over CDATA start.
    `<root><s><!-- </s> --></s><after>ok</after></root>`,
    (result) => {
      expect(typeof result.root.s).toBe("string");
      expect(result.root.s).toContain("<!-- </s> -->");
      expect(result.root.after).toBe("ok");
    },
    { tags: { stopNodes: [{ expression: "root.s", skipEnclosures: [...xmlEnclosures] }] } }
  );

  // ── 10f. Per-node independence ─────────────────────────────────────────────

  runAcrossAllInputSources(
    "different stopNodes can have different skipEnclosures independently",
    `<root>
       <script>var x = "</script>"; done</script>
       <pre><!-- </pre> fake --> real</pre>
       <raw><!-- </raw> fake --> raw ends here</raw>
     </root>`,
    (result) => {
      // script: quoteEnclosures — string skipped
      expect(result.root.script).toContain('"</script>"');
      expect(result.root.script).toContain("done");
      // pre: xmlEnclosures — comment skipped
      expect(result.root.pre).toContain("<!-- </pre> fake -->");
      expect(result.root.pre).toContain("real");
      // raw: no enclosures — first </raw> ends (inside comment)
      expect(result.root.raw).toContain("<!-- ");
      expect(result.root.raw).toContain("raw ends here");
    },
    {
      tags: {
        stopNodes: [
          { expression: "root.script", skipEnclosures: [...quoteEnclosures] },
          { expression: "root.pre", skipEnclosures: [...xmlEnclosures] },
          { expression: "root.raw", skipEnclosures: [{ open: '<!--', close: '-->' }] },
        ]
      }
    }
  );

  // ── 10g. onStopNode callback ───────────────────────────────────────────────

  it("onStopNode callback receives raw content, tagDetail and matcher", function () {
    const collected = [];
    const xml = `<root><script>alert(1)</script><style>body{}</style></root>`;
    const parser = new XMLParser({
      tags: {
        stopNodes: [
          { expression: "root.script", skipEnclosures: [...quoteEnclosures] },
          { expression: "root.style", skipEnclosures: [...xmlEnclosures] },
        ]
      },
      onStopNode(tagDetail, rawContent, matcher) {
        collected.push({ name: tagDetail.name, content: rawContent });
      }
    });

    parser.parse(xml);

    expect(collected.length).toBe(2);
    expect(collected[0].name).toBe("script");
    expect(collected[0].content).toBe("alert(1)");
    expect(collected[1].name).toBe("style");
    expect(collected[1].content).toBe("body{}");
  });

  it("onStopNode fires before content is added to output tree (CompactObjBuilder)", function () {
    const order = [];
    const xml = `<root><s>content</s></root>`;
    const parser = new XMLParser({
      tags: { stopNodes: [{ expression: "root.s", skipEnclosures: [] }] },
      onStopNode(tagDetail, rawContent) {
        order.push("callback");
      }
    });

    const result = parser.parse(xml);
    order.push("parsed");

    expect(order[0]).toBe("callback");
    expect(result.root.s).toBe("content");
  });

});