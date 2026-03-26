import XMLParser from "../src/XMLParser.js";
import {
  runAcrossAllInputSources,
  frunAcrossAllInputSources,
  runAcrossAllInputSourcesWithException,
} from "./helpers/testRunner.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: XML with a DOCTYPE internal subset
// ─────────────────────────────────────────────────────────────────────────────
const withDocType = (entities, body) => {
  const decls = Object.entries(entities)
    .map(([k, v]) => `  <!ENTITY ${k} "${v}">`)
    .join("\n");
  return `<!DOCTYPE root [\n${decls}\n]>${body}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. DOCTYPE PARSING — cursor always advances past the block
// ─────────────────────────────────────────────────────────────────────────────
describe("DOCTYPE — cursor advancement", function () {

  runAcrossAllInputSources(
    "should parse content after a DOCTYPE with no internal subset",
    `<!DOCTYPE root SYSTEM "foo.dtd"><root><tag>hello</tag></root>`,
    (result) => {
      expect(result.root.tag).toBe("hello");
    }
  );

  runAcrossAllInputSources(
    "should parse content after a DOCTYPE with an internal subset",
    withDocType({ greeting: "hello" }, "<root><tag>world</tag></root>"),
    (result) => {
      expect(result.root.tag).toBe("world");
    }
  );

  runAcrossAllInputSources(
    "should parse content after a DOCTYPE with PUBLIC identifier",
    `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg><path d="M0 0"/></svg>`,
    (result) => {
      expect(result.svg).toBeDefined();
    }
  );

  runAcrossAllInputSources(
    "should parse content after DOCTYPE with ELEMENT and ATTLIST declarations",
    `<!DOCTYPE root [
      <!ELEMENT root (tag)>
      <!ATTLIST root id CDATA #IMPLIED>
      <!ENTITY name "world">
    ]><root><tag>ok</tag></root>`,
    (result) => {
      expect(result.root.tag).toBe("ok");
    }
  );

  runAcrossAllInputSources(
    "should parse content after DOCTYPE with a comment inside the internal subset",
    `<!DOCTYPE root [
      <!-- this is a comment -->
      <!ENTITY hi "there">
    ]><root><tag>ok</tag></root>`,
    (result) => {
      expect(result.root.tag).toBe("ok");
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. entityParseOptions.docType — controls entity collection
// ─────────────────────────────────────────────────────────────────────────────
describe("DOCTYPE — entityParseOptions.docType flag", function () {

  runAcrossAllInputSources(
    "docType: false (default) — entity refs left unexpanded",
    withDocType({ greeting: "hello" }, "<root>&greeting;</root>"),
    (result) => {
      expect(result.root).toBe("&greeting;");
    }
  );

  runAcrossAllInputSources(
    "docType: true — entities collected and replaced",
    withDocType({ greeting: "hello" }, "<root>&greeting;</root>"),
    (result) => {
      expect(result.root).toBe("hello");
    },
    { entityParseOptions: { docType: true } }
  );

  runAcrossAllInputSources(
    "docType: true — multiple entities in same value",
    withDocType({ a: "foo", b: "bar" }, "<root><tag>&a; and &b;</tag></root>"),
    (result) => {
      expect(result.root.tag).toBe("foo and bar");
    },
    { entityParseOptions: { docType: true } }
  );

  runAcrossAllInputSources(
    "docType: true — entity used in attribute value",
    withDocType({ org: "Acme" }, `<root><tag name="&org;">content</tag></root>`),
    (result) => {
      expect(result.root.tag["@_name"]).toBe("Acme");
    },
    {
      entityParseOptions: { docType: true },
      skip: { attributes: false },
    }
  );

  runAcrossAllInputSources(
    "docType: true — entity used multiple times",
    withDocType({ x: "42" }, "<root><a>&x;</a><b>&x;</b><c>&x;</c></root>"),
    (result) => {
      expect(result.root.a).toBe(42);
      expect(result.root.b).toBe(42);
      expect(result.root.c).toBe(42);
    },
    { entityParseOptions: { docType: true } }
  );

  runAcrossAllInputSources(
    "docType: true — entity value containing XML special chars",
    withDocType({ arrow: "<->" }, "<root>&arrow;</root>"),
    (result) => {
      // The entity value '<->' is stored as-is; &lt; etc. are NOT re-parsed
      expect(result.root).toBe("<->");
    },
    { entityParseOptions: { docType: true } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. replaceEntities value parser — controls whether replacement runs at all
// ─────────────────────────────────────────────────────────────────────────────
describe("DOCTYPE — replaceEntities value parser gate", function () {

  runAcrossAllInputSources(
    "docType: true but replaceEntities removed — entities collected but NOT replaced",
    withDocType({ greeting: "hello" }, "<root>&greeting;</root>"),
    (result) => {
      expect(result.root).toBe("&greeting;");
    },
    {
      entityParseOptions: { docType: true },
      tags: { valueParsers: ["boolean", "number"] },
    }
  );

  runAcrossAllInputSources(
    "replaceEntities present but docType: false — built-in XML entities still replaced",
    withDocType({ greeting: "hello" }, "<root>&greeting; &lt; &gt;</root>"),
    (result) => {
      // greeting is NOT replaced (docType: false), but &lt; and &gt; are (built-in)
      expect(result.root).toBe("&greeting; < >");
    }
  );

  runAcrossAllInputSources(
    "both docType: true and replaceEntities present — full replacement pipeline",
    withDocType({ brand: "Acme" }, "<root>&brand; &amp; Co &lt;Ltd&gt;</root>"),
    (result) => {
      expect(result.root).toBe("Acme & Co <Ltd>");
    },
    { entityParseOptions: { docType: true } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Built-in XML entity sources (entityParseOptions.default)
// ─────────────────────────────────────────────────────────────────────────────
describe("entityParseOptions.default — built-in XML entities", function () {

  runAcrossAllInputSources(
    "default: true (default) — lt/gt/apos/quot replaced",
    "<root>&lt;&gt;&apos;&quot;</root>",
    (result) => {
      expect(result.root).toBe(`<>'"`);
    }
  );

  runAcrossAllInputSources(
    "default: false — XML entities NOT replaced",
    "<root>&lt;&gt;</root>",
    (result) => {
      expect(result.root).toBe("&lt;&gt;");
    },
    { entityParseOptions: { default: false } }
  );

  runAcrossAllInputSources(
    "&amp; replaced even when default: false (amp is always last)",
    "<root>&amp;</root>",
    (result) => {
      expect(result.root).toBe("&");
    },
    { entityParseOptions: { default: false } }
  );

  runAcrossAllInputSources(
    "default: custom object — only custom entities replaced",
    "<root>&lt;&custom;</root>",
    (result) => {
      // &lt; is NOT in custom map so it stays; &custom; IS replaced
      expect(result.root).toBe("&lt;YES");
    },
    {
      entityParseOptions: {
        default: { custom: { regex: /&custom;/g, val: "YES" } },
      },
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. HTML entity source (entityParseOptions.html)
// ─────────────────────────────────────────────────────────────────────────────
describe("entityParseOptions.html — HTML named entities", function () {

  runAcrossAllInputSources(
    "html: false (default) — &nbsp; left unexpanded",
    "<root>&nbsp;</root>",
    (result) => {
      expect(result.root).toBe("&nbsp;");
    }
  );

  runAcrossAllInputSources(
    "html: true — &nbsp; expanded to non-breaking space",
    "<root>&nbsp;</root>",
    (result) => {
      expect(result.root).toBe("\u00a0");
    },
    { entityParseOptions: { html: true } }
  );

  runAcrossAllInputSources(
    "html: true — &copy; expanded",
    "<root>&copy;</root>",
    (result) => {
      expect(result.root).toBe("\u00a9");
    },
    { entityParseOptions: { html: true } }
  );

  runAcrossAllInputSources(
    "html: true — numeric decimal ref expanded",
    "<root>&#169;</root>",
    (result) => {
      expect(result.root).toBe("©");
    },
    { entityParseOptions: { html: true } }
  );

  runAcrossAllInputSources(
    "html: true — numeric hex ref expanded",
    "<root>&#xA9;</root>",
    (result) => {
      expect(result.root).toBe("©");
    },
    { entityParseOptions: { html: true } }
  );

  runAcrossAllInputSources(
    "html: true together with docType: true — both sources active",
    withDocType({ brand: "Acme" }, "<root>&brand; &copy;</root>"),
    (result) => {
      expect(result.root).toBe("Acme ©");
    },
    { entityParseOptions: { docType: true, html: true } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. External entities via addEntity()
// ─────────────────────────────────────────────────────────────────────────────
describe("addEntity() — external entities", function () {

  it("should replace a registered external entity", function () {
    const parser = new XMLParser();
    parser.addEntity("copy", "©");
    const result = parser.parse("<root>&copy;</root>");
    expect(result.root).toBe("©");
  });

  it("should replace multiple registered external entities", function () {
    const parser = new XMLParser();
    parser.addEntity("copy", "©");
    parser.addEntity("trade", "™");
    const result = parser.parse("<root>&copy; &trade;</root>");
    expect(result.root).toBe("© ™");
  });

  it("external: false — entity stored but NOT applied", function () {
    const parser = new XMLParser({ entityParseOptions: { external: false } });
    parser.addEntity("copy", "©");
    const result = parser.parse("<root>&copy;</root>");
    expect(result.root).toBe("&copy;");
  });

  it("external: false then re-enable — entities still stored", function () {
    // Store with external: false, but parse with external: true (new parser)
    const parserA = new XMLParser({ entityParseOptions: { external: false } });
    parserA.addEntity("copy", "©");
    const resultA = parserA.parse("<root>&copy;</root>");
    expect(resultA.root).toBe("&copy;");

    const parserB = new XMLParser({ entityParseOptions: { external: true } });
    parserB.addEntity("copy", "©");
    const resultB = parserB.parse("<root>&copy;</root>");
    expect(resultB.root).toBe("©");
  });

  it("should throw when entity key contains '&'", function () {
    const parser = new XMLParser();
    expect(() => parser.addEntity("&copy", "©")).toThrow();
  });

  it("should throw when entity key contains ';'", function () {
    const parser = new XMLParser();
    expect(() => parser.addEntity("copy;", "©")).toThrow();
  });

  it("should throw when entity value contains '&'", function () {
    const parser = new XMLParser();
    expect(() => parser.addEntity("bad", "a & b")).toThrow();
  });

  it("external entity coexists with docType entity — both replaced", function () {
    const parser = new XMLParser({ entityParseOptions: { docType: true } });
    parser.addEntity("ext", "external");
    const result = parser.parse(
      withDocType({ dt: "doctype" }, "<root>&dt; &ext;</root>")
    );
    expect(result.root).toBe("doctype external");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. &amp; ordering — always last
// ─────────────────────────────────────────────────────────────────────────────
describe("&amp; — always expanded last", function () {

  runAcrossAllInputSources(
    "&amp; produces & without double-expanding",
    "<root>&amp;lt;</root>",
    (result) => {
      // &amp; → & then stops; the resulting &lt; is NOT re-expanded
      expect(result.root).toBe("&lt;");
    }
  );

  runAcrossAllInputSources(
    "standalone &amp; → &",
    "<root>&amp;</root>",
    (result) => {
      expect(result.root).toBe("&");
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Security — maxEntityCount
// ─────────────────────────────────────────────────────────────────────────────
describe("Security — maxEntityCount", function () {

  runAcrossAllInputSourcesWithException(
    "should throw when DOCTYPE entity count exceeds maxEntityCount",
    `<!DOCTYPE root [
      <!ENTITY e1 "a">
      <!ENTITY e2 "b">
      <!ENTITY e3 "c">
    ]><root>&e1;</root>`,
    /Entity count.*exceeds maximum/,
    { entityParseOptions: { docType: true, maxEntityCount: 2 } }
  );

  runAcrossAllInputSources(
    "should not throw when entity count equals maxEntityCount",
    `<!DOCTYPE root [
      <!ENTITY e1 "a">
      <!ENTITY e2 "b">
    ]><root>&e1;&e2;</root>`,
    (result) => {
      expect(result.root).toBe("ab");
    },
    { entityParseOptions: { docType: true, maxEntityCount: 2 } }
  );

  runAcrossAllInputSources(
    "maxEntityCount: 0 (unlimited) — many entities allowed",
    `<!DOCTYPE root [
      <!ENTITY e1 "a"><!ENTITY e2 "b"><!ENTITY e3 "c">
      <!ENTITY e4 "d"><!ENTITY e5 "e">
    ]><root>&e1;&e2;&e3;&e4;&e5;</root>`,
    (result) => {
      expect(result.root).toBe("abcde");
    },
    { entityParseOptions: { docType: true, maxEntityCount: 0 } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Security — maxEntitySize
// ─────────────────────────────────────────────────────────────────────────────
describe("Security — maxEntitySize", function () {

  runAcrossAllInputSourcesWithException(
    "should throw when an entity definition exceeds maxEntitySize",
    `<!DOCTYPE root [
      <!ENTITY big "123456789012345">
    ]><root>&big;</root>`,
    /Entity.*size.*exceeds maximum/,
    { entityParseOptions: { docType: true, maxEntitySize: 10 } }
  );

  runAcrossAllInputSources(
    "should not throw when entity definition is exactly at maxEntitySize",
    `<!DOCTYPE root [
      <!ENTITY exact "1234567890">
    ]><root>&exact;</root>`,
    (result) => {
      expect(result.root).toBe(1234567890);
    },
    { entityParseOptions: { docType: true, maxEntitySize: 10 } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Security — maxTotalExpansions
// ─────────────────────────────────────────────────────────────────────────────
describe("Security — maxTotalExpansions", function () {

  runAcrossAllInputSourcesWithException(
    "should throw when total expansions exceeds limit",
    `<!DOCTYPE root [
      <!ENTITY e "x">
    ]><root>&e;&e;&e;&e;&e;&e;</root>`,
    /expansion limit exceeded/,
    { entityParseOptions: { docType: true, maxTotalExpansions: 3 } }
  );

  runAcrossAllInputSources(
    "should not throw when expansions are within limit",
    `<!DOCTYPE root [
      <!ENTITY e "x">
    ]><root>&e;&e;&e;</root>`,
    (result) => {
      expect(result.root).toBe("xxx");
    },
    { entityParseOptions: { docType: true, maxTotalExpansions: 3 } }
  );

  it("maxTotalExpansions counts external entity expansions too", function () {
    const parser = new XMLParser({
      entityParseOptions: { external: true, maxTotalExpansions: 2 },
    });
    parser.addEntity("e", "x");
    expect(() => parser.parse("<root>&e;&e;&e;</root>")).toThrowError("Entity expansion limit exceeded: 3 > 2");
  });

  runAcrossAllInputSources(
    "maxTotalExpansions: 0 — unlimited",
    `<!DOCTYPE root [
      <!ENTITY e "x">
    ]><root>&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;</root>`,
    (result) => {
      expect(result.root).toBe("xxxxxxxxxx");
    },
    { entityParseOptions: { docType: true, maxTotalExpansions: 0 } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Security — maxExpandedLength
// ─────────────────────────────────────────────────────────────────────────────
describe("Security — maxExpandedLength", function () {

  runAcrossAllInputSources(
    "should not throw when expanded length is within limit",
    `<!DOCTYPE root [
      <!ENTITY e "0123456789">
    ]><root>&e;</root>`,
    (result) => {
      expect(result.root).toBe(123456789); // numeric coercion
    },
    { entityParseOptions: { docType: true, maxExpandedLength: 15 } }
  );

  runAcrossAllInputSources(
    "maxExpandedLength: 0 — unlimited",
    `<!DOCTYPE root [
      <!ENTITY e "abcdefghij">
    ]><root>&e;&e;&e;&e;&e;</root>`,
    (result) => {
      expect(result.root).toBe("abcdefghijabcdefghijabcdefghijabcdefghijabcdefghij");
    },
    { entityParseOptions: { docType: true, maxExpandedLength: 0 } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Security — Billion Laughs (entity explosion attack)
// ─────────────────────────────────────────────────────────────────────────────
describe("Security — Billion Laughs mitigation", function () {

  // The parser does not support entity references inside entity values (parameter
  // entities / recursive expansion) so classic Billion Laughs cannot be expressed.
  // Entities whose values contain '&' are silently skipped by DocTypeReader.
  // maxTotalExpansions provides the backstop for flat repetition attacks.

  it("entity values containing '&' are silently discarded (no recursive expansion)", function () {
    const parser = new XMLParser({ entityParseOptions: { docType: true } });
    // lol2 references lol1 — would be the start of a Billion Laughs chain.
    // DocTypeReader skips any entity value containing '&', so lol2 is never stored.
    const result = parser.parse(`<!DOCTYPE root [
      <!ENTITY lol1 "lol">
      <!ENTITY lol2 "&lol1;&lol1;&lol1;">
    ]><root>&lol1;&lol2;</root>`);
    // lol1 is replaced; lol2 was not stored so it stays as-is
    expect(result.root).toBe("lol&lol2;");
  });

  it("flat repetition attack is caught by maxTotalExpansions", function () {
    const parser = new XMLParser({
      entityParseOptions: { docType: true, maxTotalExpansions: 100 },
    });
    // Build an XML with 200 entity references
    const refs = "&e;".repeat(200);
    expect(() =>
      parser.parse(`<!DOCTYPE root [<!ENTITY e "x">]><root>${refs}</root>`)
    ).toThrowError("Entity expansion limit exceeded: 200 > 100");
  });

});


// ─────────────────────────────────────────────────────────────────────────────
// 14. Per-parse isolation — counters reset between parses
// ─────────────────────────────────────────────────────────────────────────────
describe("Per-parse isolation", function () {

  it("expansion counters reset between parses — second parse should not carry over", function () {
    const parser = new XMLParser({
      entityParseOptions: { docType: true, maxTotalExpansions: 5 },
    });
    // First parse — 5 expansions (at the limit)
    const xml = `<!DOCTYPE root [<!ENTITY e "x">]><root>&e;&e;&e;&e;&e;</root>`;
    const r1 = parser.parse(xml);
    expect(r1.root).toBe("xxxxx");

    // Second parse — should also succeed (counters reset)
    const r2 = parser.parse(xml);
    expect(r2.root).toBe("xxxxx");
  });

  it("docType entities reset between parses — old entities do not bleed into new parse", function () {
    const parser = new XMLParser({ entityParseOptions: { docType: true } });

    const r1 = parser.parse(
      withDocType({ greeting: "hello" }, "<root>&greeting;</root>")
    );
    expect(r1.root).toBe("hello");

    // Second parse has no DOCTYPE — greeting should NOT be available
    const r2 = parser.parse("<root>&greeting;</root>");
    expect(r2.root).toBe("&greeting;");
  });

});
