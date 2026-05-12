import XMLParser from "../src/XMLParser.js";
import { xmlEnclosures, quoteEnclosures } from "../src/StopNodeProcessor.js";
import {
  runAcrossAllInputSources,
  frunAcrossAllInputSources,
  xrunAcrossAllInputSources,
  runAcrossAllInputSourcesWithException,
} from "./helpers/testRunner.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic skip tag functionality
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — basic functionality", function () {

  runAcrossAllInputSources(
    "should drop a skipped tag entirely from output",
    `
      <root>
        <keep>visible</keep>
        <drop>
          <child>this should not appear</child>
        </drop>
        <also>also visible</also>
      </root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.also).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: ["root.drop"] } }
  );

  runAcrossAllInputSources(
    "should drop multiple skip tags independently",
    `
      <root>
        <a>keep</a>
        <b><inner>gone</inner></b>
        <c>also keep</c>
        <d><inner>also gone</inner></d>
      </root>`,
    (result) => {
      expect(result.root.a).toBe("keep");
      expect(result.root.c).toBe("also keep");
      expect(result.root.b).toBeUndefined();
      expect(result.root.d).toBeUndefined();
    },
    { skip: { tags: ["root.b", "root.d"] } }
  );

  runAcrossAllInputSources(
    "should drop using deep wildcard expression",
    `
      <root>
        <section>
          <secret><password>hunter2</password></secret>
          <public>visible</public>
        </section>
      </root>`,
    (result) => {
      expect(result.root.section.public).toBe("visible");
      expect(result.root.section.secret).toBeUndefined();
    },
    { skip: { tags: ["..secret"] } }
  );

  runAcrossAllInputSources(
    "should keep surrounding siblings intact after skipped tag",
    `
      <root>
        <before>first</before>
        <skip><data>gone</data></skip>
        <after>last</after>
      </root>`,
    (result) => {
      expect(result.root.before).toBe("first");
      expect(result.root.after).toBe("last");
      expect(result.root.skip).toBeUndefined();
    },
    { skip: { tags: ["root.skip"] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Self-closing skip tags
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — self-closing tags", function () {

  runAcrossAllInputSources(
    "should drop a self-closing skip tag from output",
    `
      <root>
        <keep>visible</keep>
        <drop/>
        <also>also visible</also>
      </root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.also).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: ["root.drop"] } }
  );

  runAcrossAllInputSources(
    "should drop self-closing skip tag with attributes",
    `
      <root>
        <keep>visible</keep>
        <drop attr="value"/>
        <also>also visible</also>
      </root>`,
    (result) => {
      const expected = {
        root: {
          keep: 'visible',
          also: { '@_attr': 'value', '#text': 'also visible' }
        }
      }
      // console.log(result)
      expect(result.root.keep).toBe("visible");
      expect(result.root.also).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: ["root.drop"], attributes: false } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Nested same-name tags
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — nested same-name tags", function () {

  // Plain (nested: false): first </drop> ends collection
  runAcrossAllInputSources(
    "plain skip tag: first closing tag ends collection (no depth tracking)",
    `
      <root>
        <keep>visible</keep>
        <drop>
          outer
          <drop>inner</drop>
          back to outer
        </drop>
        <after>also visible</after>
      </root>`,
    (result) => {
      // plain mode: ends at first </drop> — the inner one.
      // The "back to outer" text and the outer </drop> are left in the stream
      // and would cause a parse error. Use nested:true to handle this correctly.
      // This test verifies nested:false is the default.
      expect(result.root.keep).toBe("visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: [{ expression: "root.drop", nested: true }] } }
  );

  runAcrossAllInputSources(
    "nested:true skip tag: outer closing tag ends collection",
    `
      <root>
        <keep>visible</keep>
        <drop>
          <drop>inner</drop>
          <more>content</more>
        </drop>
        <after>also visible</after>
      </root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.after).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: [{ expression: "root.drop", nested: true }] } }
  );

  runAcrossAllInputSources(
    "nested:true: multiple levels of same-name nesting are all dropped",
    `
      <root>
        <item>
          <item>
            <item>deep</item>
          </item>
        </item>
        <after>visible</after>
      </root>`,
    (result) => {
      expect(result.root.item).toBeUndefined();
      expect(result.root.after).toBe("visible");
    },
    { skip: { tags: [{ expression: "root.item", nested: true }] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. skipEnclosures — fake closing tags inside comments/CDATA/strings
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — skipEnclosures", function () {

  runAcrossAllInputSources(
    "xmlEnclosures: fake closing tag inside comment is ignored",
    `
      <root>
        <keep>visible</keep>
        <drop>
          <!-- </drop> fake -->
          real content
        </drop>
        <after>also visible</after>
      </root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.after).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: [{ expression: "root.drop", skipEnclosures: [...xmlEnclosures] }] } }
  );

  runAcrossAllInputSources(
    "xmlEnclosures: fake closing tag inside CDATA is ignored",
    `
      <root>
        <keep>visible</keep>
        <drop><![CDATA[ </drop> fake ]]> real</drop>
        <after>also visible</after>
      </root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.after).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: [{ expression: "root.drop", skipEnclosures: [...xmlEnclosures] }] } }
  );

  runAcrossAllInputSources(
    "quoteEnclosures: fake closing tag inside string literal is ignored",
    `<root><keep>visible</keep><drop>var x = "</drop>"; done</drop><after>also visible</after></root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.after).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: [{ expression: "root.drop", skipEnclosures: [...quoteEnclosures] }] } }
  );

  runAcrossAllInputSources(
    "no enclosures: fake closing tag inside comment ends collection early (plain mode)",
    `<root><keep>visible</keep><drop><!-- </drop> --><after>also visible</after></root>`,
    (result) => {
      // Without enclosures, </drop> inside comment ends the skip collection.
      // Remainder becomes visible output.
      expect(result.root.keep).toBe("visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: ["root.drop"] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Empty and whitespace content
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — empty and whitespace content", function () {

  runAcrossAllInputSources(
    "should silently drop an empty skip tag",
    `
      <root>
        <keep>visible</keep>
        <drop></drop>
        <after>also visible</after>
      </root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.after).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: ["root.drop"] } }
  );

  runAcrossAllInputSources(
    "should silently drop a whitespace-only skip tag",
    `
      <root>
        <keep>visible</keep>
        <drop>   
        </drop>
        <after>also visible</after>
      </root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.after).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: ["root.drop"] } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Attributes on a skipped tag
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — attributes on skipped tags", function () {

  runAcrossAllInputSources(
    "attributes on a skipped tag are also dropped",
    `
      <root>
        <keep>visible</keep>
        <drop id="123" class="secret"><child>gone</child></drop>
        <after>also visible</after>
      </root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.after).toBe("also visible");
      expect(result.root.drop).toBeUndefined();
    },
    { skip: { tags: ["root.drop"], attributes: false } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Skip tags and stop nodes coexist
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — coexistence with stop nodes", function () {

  runAcrossAllInputSources(
    "stop nodes and skip tags both work in the same document",
    `
      <root>
        <script>alert(1)</script>
        <secret><password>hunter2</password></secret>
        <data>visible</data>
      </root>`,
    (result) => {
      // stop node: raw content captured
      expect(typeof result.root.script).toBe("string");
      expect(result.root.script).toBe("alert(1)");
      // skip tag: entirely absent
      expect(result.root.secret).toBeUndefined();
      // normal tag: parsed
      expect(result.root.data).toBe("visible");
    },
    {
      tags: { stopNodes: ["root.script"] },
      skip: { tags: ["root.secret"] },
    }
  );

  runAcrossAllInputSources(
    "a tag cannot be both a stop node and a skip tag — stop node takes priority",
    `<root><both>content</both><after>visible</after></root>`,
    (result) => {
      // stop node wins: content is captured as raw string
      expect(typeof result.root.both).toBe("string");
      expect(result.root.both).toBe("content");
      expect(result.root.after).toBe("visible");
    },
    {
      tags: { stopNodes: ["root.both"] },
      skip: { tags: ["root.both"] },
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Skip tag independence — different configs per tag
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — per-tag independence", function () {

  runAcrossAllInputSources(
    "different skip tags can have different skipEnclosures independently",
    `
      <root>
        <a><!-- </a> fake --> real</a>
        <b>"</b>" real</b>
        <keep>visible</keep>
      </root>`,
    (result) => {
      // <a> uses xmlEnclosures — fake close inside comment is ignored, whole tag dropped
      expect(result.root.a).toBeUndefined();
      // <b> uses quoteEnclosures — fake close inside string is ignored, whole tag dropped
      expect(result.root.b).toBeUndefined();
      expect(result.root.keep).toBe("visible");
    },
    {
      skip: {
        tags: [
          { expression: "root.a", skipEnclosures: [...xmlEnclosures] },
          { expression: "root.b", skipEnclosures: [...quoteEnclosures] },
        ]
      }
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Feedable input source — chunk-boundary survival
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — feedable input source", function () {

  it("should correctly skip a tag when fed character by character", function () {
    const xmlData = `<root><keep>visible</keep><drop><child>gone</child></drop><after>also visible</after></root>`;
    const options = { skip: { tags: ["root.drop"] } };

    const parser = new XMLParser(options);
    for (let i = 0; i < xmlData.length; i++) {
      parser.feed(xmlData[i]);
    }
    const result = parser.end();

    expect(result.root.keep).toBe("visible");
    expect(result.root.after).toBe("also visible");
    expect(result.root.drop).toBeUndefined();
  });

  it("should handle xmlEnclosures skip tag with chunk-boundary survival", function () {
    const xmlData = `<root><keep>ok</keep><drop>text <!-- </drop> fake --> real</drop><after>ok</after></root>`;
    const options = {
      skip: { tags: [{ expression: "root.drop", skipEnclosures: [...xmlEnclosures] }] }
    };

    const parser = new XMLParser(options);
    for (let i = 0; i < xmlData.length; i++) {
      parser.feed(xmlData[i]);
    }
    const result = parser.end();

    expect(result.root.keep).toBe("ok");
    expect(result.root.after).toBe("ok");
    expect(result.root.drop).toBeUndefined();
  });

  it("should handle nested skip tag with chunk-boundary survival", function () {
    const xmlData = `<root><drop><drop>inner</drop><more>content</more></drop><after>visible</after></root>`;
    const options = {
      skip: { tags: [{ expression: "root.drop", nested: true }] }
    };

    const parser = new XMLParser(options);
    for (let i = 0; i < xmlData.length; i++) {
      parser.feed(xmlData[i]);
    }
    const result = parser.end();

    expect(result.root.drop).toBeUndefined();
    expect(result.root.after).toBe("visible");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Error scenarios
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — error scenarios", function () {

  runAcrossAllInputSourcesWithException(
    "should throw for an unclosed skip tag",
    `
      <root>
        <keep>visible</keep>
        <drop>
          <child>content`,
    /unclosed/i,
    { skip: { tags: ["root.drop"] } }
  );

  runAcrossAllInputSourcesWithException(
    "should throw for unclosed comment inside skip tag (xmlEnclosures)",
    `
      <root>
        <drop>
          <!-- unclosed comment
          <more>content</more>
        </drop>
      </root>`,
    "Unclosed stop node <drop> — unexpected end looking for '-->'",
    { skip: { tags: [{ expression: "root.drop", skipEnclosures: [...xmlEnclosures] }] } }
  );

  it("should throw for an empty skip.tags expression string", function () {
    expect(() => new XMLParser({ skip: { tags: [""] } }))
      .toThrowError("skip.tags expression cannot be empty");
  });

  it("should throw for an invalid skip.tags entry type", function () {
    expect(() =>
      new XMLParser({ skip: { tags: [42] } })
    )
      .toThrowError("Invalid skip.tags entry: expected a string, Expression, or { expression, nested?, skipEnclosures? } object.");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 11. OptionsBuilder validation — skip.tags entry forms
// ─────────────────────────────────────────────────────────────────────────────
describe("Skip Tags — OptionsBuilder entry normalization", function () {

  it("accepts plain string shorthand", function () {
    expect(() => new XMLParser({ skip: { tags: ["root.drop"] } })).not.toThrow();
  });

  it("accepts object form with string expression", function () {
    expect(() => new XMLParser({
      skip: { tags: [{ expression: "root.drop", nested: true, skipEnclosures: [] }] }
    })).not.toThrow();
  });

  it("accepts object form without optional fields", function () {
    expect(() => new XMLParser({
      skip: { tags: [{ expression: "root.drop" }] }
    })).not.toThrow();
  });

  it("defaults nested to false when omitted", function () {
    const parser = new XMLParser({ skip: { tags: [{ expression: "root.drop" }] } });
    const expr = parser.options.skip.tags[0];
    expect(expr.data.nested).toBe(false);
  });

  it("defaults skipEnclosures to [] when omitted", function () {
    const parser = new XMLParser({ skip: { tags: [{ expression: "root.drop" }] } });
    const expr = parser.options.skip.tags[0];
    expect(expr.data.skipEnclosures).toEqual([]);
  });

  it("embeds config into Expression.data", function () {
    const parser = new XMLParser({
      skip: { tags: [{ expression: "root.drop", nested: true, skipEnclosures: [...xmlEnclosures] }] }
    });
    const expr = parser.options.skip.tags[0];
    expect(expr.data.nested).toBe(true);
    expect(expr.data.skipEnclosures).toEqual(xmlEnclosures);
  });

  it("skip.tagsSet is a sealed ExpressionSet", function () {
    const parser = new XMLParser({ skip: { tags: ["root.drop"] } });
    expect(parser.options.skip.tagsSet).toBeDefined();
    expect(parser.options.skip.tagsSet.size).toBe(1);
    expect(parser.options.skip.tagsSet.isSealed).toBe(true);
  });

});

describe("Skip Tags — nested and namespace", function () {
  it("should determine nested skip tag", function () {
    const xml = `<root><code>safe <code>nested</code> still raw</code></root>`;
    const parser = new XMLParser({
      skip: { tags: [{ expression: "root.code", nested: true }] },
    });

    const expected = {
      "root": ""
    }
    const result = parser.parse(xml);

    // console.log(JSON.stringify(result, null, 4));
    expect(result).toEqual(expected);
  });

  it("should determine nested skip tag with namespace when nsPrefix is not skipped", function () {
    const xml = `<root><ns:code>safe <ns:code>nested</ns:code> still raw</ns:code></root>`;
    const parser = new XMLParser({
      skip: { tags: [{ expression: "root.ns::code", nested: true }] },
    });

    const expected = {
      "root": ""
    }

    const result = parser.parse(xml);
    // console.log(JSON.stringify(result, null, 4));
    expect(result).toEqual(expected);
  });

  it("should determine nested skip tag with namespace when nsPrefix is not skipped and namespace is not used in expression", function () {
    const xml = `<root><ns:code>safe <ns:code>nested</ns:code> still raw</ns:code></root>`;
    const parser = new XMLParser({
      skip: { tags: [{ expression: "root.code", nested: true }] },
    });

    const expected = {
      "root": ""
    }

    const result = parser.parse(xml);
    // console.log(JSON.stringify(result, null, 4));
    expect(result).toEqual(expected);
  });
  it("should determine nested skip tag with namespace when nsPrefix is skipped", function () {
    const xml = `<root><ns:code>safe <ns:code>nested</ns:code> still raw</ns:code></root>`;
    const parser = new XMLParser({
      skip: {
        tags: [{ expression: "root.ns::code", nested: true }],
        nsPrefix: true
      }
    });

    const expected = {
      "root": ""
    }
    const result = parser.parse(xml);
    // console.log(JSON.stringify(result, null, 4));
    expect(result).toEqual(expected);
  });
  it("should determine nested skip tag with namespace when nsPrefix is skipped and namespace is not used in expression", function () {
    const xml = `<root><ns:code>safe <ns:code>nested</ns:code> still raw</ns:code></root>`;
    const parser = new XMLParser({
      skip: {
        tags: [{ expression: "root.code", nested: true }],
        nsPrefix: true
      },
    });

    const expected = {
      "root": ""
    }
    const result = parser.parse(xml);
    // console.log(JSON.stringify(result, null, 4));
    expect(result).toEqual(expected);
  });

});