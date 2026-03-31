import XMLParser from "../src/XMLParser.js";
import { EntitiesValueParser, JsObjBuilder } from "../src/fxp.js";
import {
  runAcrossAllInputSources,
  frunAcrossAllInputSources,
  runAcrossAllInputSourcesWithException,
  frunAcrossAllInputSourcesWithFactory,
  runAcrossAllInputSourcesWithFactory,
  createInputSource,
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

// Helper: build a parser with a custom EntitiesValueParser configuration.
// Keeps test bodies concise — callers only specify what they care about.
const makeParser = (doctypeOpts = {}, entitiesOpts = {}, parserOpts = {}) => {
  const evp = new EntitiesValueParser({ default: true, ...entitiesOpts });
  const builder = new JsObjBuilder();
  builder.registerValueParser("entity", evp);
  return new XMLParser({
    ...parserOpts,
    doctypeOptions: { enabled: false, ...doctypeOpts },
    OutputBuilder: builder,
  });
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
// 2. doctypeOptions.enabled — controls entity collection
// ─────────────────────────────────────────────────────────────────────────────
describe("DOCTYPE — doctypeOptions.enabled flag", function () {

  runAcrossAllInputSources(
    "enabled: false (default) — entity refs left unexpanded",
    withDocType({ greeting: "hello" }, "<root>&greeting;</root>"),
    (result) => {
      expect(result.root).toBe("&greeting;");
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "enabled: true — entities collected and replaced",
    withDocType({ greeting: "hello" }, "<root>&greeting;</root>"),
    (result) => {
      expect(result.root).toBe("hello");
    },
    () => makeParser({ enabled: true })
  );

  runAcrossAllInputSourcesWithFactory(
    "enabled: true — multiple entities in same value",
    withDocType({ a: "foo", b: "bar" }, "<root><tag>&a; and &b;</tag></root>"),
    (result) => {
      expect(result.root.tag).toBe("foo and bar");
    },
    () => makeParser({ enabled: true })
  );

  runAcrossAllInputSourcesWithFactory(
    "enabled: true — entity used in attribute value",
    withDocType({ org: "Acme" }, `<root><tag name="&org;">content</tag></root>`),
    (result) => {
      expect(result.root.tag["@_name"]).toBe("Acme");
    },
    () => makeParser({ enabled: true }, {}, { skip: { attributes: false } })
  );

  runAcrossAllInputSourcesWithFactory(
    "enabled: true — entity used multiple times",
    withDocType({ x: "42" }, "<root><a>&x;</a><b>&x;</b><c>&x;</c></root>"),
    (result) => {
      expect(result.root.a).toBe(42);
      expect(result.root.b).toBe(42);
      expect(result.root.c).toBe(42);
    },
    () => makeParser({ enabled: true })
  );

  runAcrossAllInputSourcesWithFactory(
    "enabled: true — entity value containing XML special chars",
    withDocType({ arrow: "<->" }, "<root>&arrow;</root>"),
    (result) => {
      // The entity value '<->' is stored as-is; &lt; etc. are NOT re-parsed
      expect(result.root).toBe("<->");
    },
    () => makeParser({ enabled: true })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. replaceEntities value parser — controls whether replacement runs at all
// ─────────────────────────────────────────────────────────────────────────────
describe("DOCTYPE — replaceEntities value parser gate", function () {

  // replaceEntities removed from chain — entities collected but NOT replaced
  runAcrossAllInputSourcesWithFactory(
    "enabled: true but replaceEntities removed — entities collected but NOT replaced",
    withDocType({ greeting: "hello" }, "<root>&greeting;</root>"),
    (result) => {
      expect(result.root).toBe("&greeting;");
    },
    () => {
      // No EntitiesValueParser registered; chain has no 'entity'
      const builder = new JsObjBuilder({ tags: { valueParsers: ["boolean", "number"] } });
      return new XMLParser({
        doctypeOptions: { enabled: true },
        OutputBuilder: builder,
      });
    }
  );

  runAcrossAllInputSources(
    "replaceEntities present but enabled: false — built-in XML entities still replaced",
    withDocType({ greeting: "hello" }, "<root>&greeting; &lt; &gt;</root>"),
    (result) => {
      // greeting is NOT replaced (enabled: false), but &lt; and &gt; are (built-in)
      expect(result.root).toBe("&greeting; < >");
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "both enabled: true and replaceEntities present — full replacement pipeline",
    withDocType({ brand: "Acme" }, "<root>&brand; &amp; Co &lt;Ltd&gt;</root>"),
    (result) => {
      expect(result.root).toBe("Acme & Co <Ltd>");
    },
    () => makeParser({ enabled: true })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Built-in XML entity sources (EntitiesValueParser default option)
// ─────────────────────────────────────────────────────────────────────────────
describe("EntitiesValueParser default option — built-in XML entities", function () {

  runAcrossAllInputSources(
    "default: true (default) — lt/gt/apos/quot replaced",
    `<root>&lt;&gt;&apos;&quot;</root>`,
    (result) => {
      expect(result.root).toBe(`<>'"`);
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "default: false — XML entities NOT replaced",
    "<root>&lt;&gt;</root>",
    (result) => {
      expect(result.root).toBe("&lt;&gt;");
    },
    () => makeParser({}, { default: false })
  );

  runAcrossAllInputSourcesWithFactory(
    "&amp; replaced even when default: false (amp is always last)",
    "<root>&amp;</root>",
    (result) => {
      expect(result.root).toBe("&");
    },
    () => makeParser({}, { default: false })
  );

  runAcrossAllInputSourcesWithFactory(
    "default: custom object — only custom entities replaced",
    "<root>&lt;&custom;</root>",
    (result) => {
      // &lt; is NOT in custom map so it stays; &custom; IS replaced
      expect(result.root).toBe("&lt;YES");
    },
    () => makeParser({}, { default: { custom: { regex: /&custom;/g, val: "YES" } } })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. HTML entity source (EntitiesValueParser html option)
// ─────────────────────────────────────────────────────────────────────────────
describe("EntitiesValueParser html option — HTML named entities", function () {

  runAcrossAllInputSources(
    "html: false (default) — &nbsp; left unexpanded",
    "<root>&nbsp;</root>",
    (result) => {
      expect(result.root).toBe("&nbsp;");
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "html: true — &nbsp; expanded to non-breaking space",
    "<root>&nbsp;</root>",
    (result) => {
      expect(result.root).toBe("\u00a0");
    },
    () => makeParser({}, { html: true })
  );

  runAcrossAllInputSourcesWithFactory(
    "html: true — &copy; expanded",
    "<root>&copy;</root>",
    (result) => {
      expect(result.root).toBe("\u00a9");
    },
    () => makeParser({}, { html: true })
  );

  runAcrossAllInputSourcesWithFactory(
    "html: true — numeric decimal ref expanded",
    "<root>&#169;</root>",
    (result) => {
      expect(result.root).toBe("©");
    },
    () => makeParser({}, { html: true })
  );

  runAcrossAllInputSourcesWithFactory(
    "html: true — numeric hex ref expanded",
    "<root>&#xA9;</root>",
    (result) => {
      expect(result.root).toBe("©");
    },
    () => makeParser({}, { html: true })
  );

  runAcrossAllInputSourcesWithFactory(
    "html: true together with enabled: true — both sources active",
    withDocType({ brand: "Acme" }, "<root>&brand; &copy;</root>"),
    (result) => {
      expect(result.root).toBe("Acme ©");
    },
    () => makeParser({ enabled: true }, { html: true })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. External entities via EntitiesValueParser.addEntity()
// ─────────────────────────────────────────────────────────────────────────────
describe("EntitiesValueParser.addEntity() — external entities", function () {

  it("should replace a registered external entity", function () {
    const evp = new EntitiesValueParser({ default: true });
    evp.addEntity("copy", "©");
    const builder = new JsObjBuilder();
    builder.registerValueParser("entity", evp);
    const parser = new XMLParser({ OutputBuilder: builder });
    const result = parser.parse("<root>&copy;</root>");
    expect(result.root).toBe("©");
  });

  it("should replace multiple registered external entities", function () {
    const evp = new EntitiesValueParser({ default: true });
    evp.addEntity("copy", "©");
    evp.addEntity("trade", "™");
    const builder = new JsObjBuilder();
    builder.registerValueParser("entity", evp);
    const parser = new XMLParser({ OutputBuilder: builder });
    const result = parser.parse("<root>&copy; &trade;</root>");
    expect(result.root).toBe("© ™");
  });

  it("external: false — entity stored but NOT applied", function () {
    //TODO: output builder options building is incorrect. default values like html are being set as true.
    const evp = new EntitiesValueParser({ default: true, external: false });
    evp.addEntity("copy", "©");
    const builder = new JsObjBuilder();
    builder.registerValueParser("entity", evp);
    const parser = new XMLParser({ OutputBuilder: builder });
    const result = parser.parse("<root>&copy;</root>");
    expect(result.root).toBe("&copy;");
  });

  it("external: false then re-enable — entities applied when external: true", function () {
    const evpOff = new EntitiesValueParser({ default: true, external: false });
    evpOff.addEntity("copy", "©");
    const builderOff = new JsObjBuilder();
    builderOff.registerValueParser("entity", evpOff);
    const parserOff = new XMLParser({ OutputBuilder: builderOff });
    expect(parserOff.parse("<root>&copy;</root>").root).toBe("&copy;");

    const evpOn = new EntitiesValueParser({ default: true, external: true });
    evpOn.addEntity("copy", "©");
    const builderOn = new JsObjBuilder();
    builderOn.registerValueParser("entity", evpOn);
    const parserOn = new XMLParser({ OutputBuilder: builderOn });
    expect(parserOn.parse("<root>&copy;</root>").root).toBe("©");
  });

  it("should throw when entity key contains '&'", function () {
    const evp = new EntitiesValueParser();
    expect(() => evp.addEntity("&copy", "©")).toThrow();
  });

  it("should throw when entity key contains ';'", function () {
    const evp = new EntitiesValueParser();
    expect(() => evp.addEntity("copy;", "©")).toThrow();
  });

  it("should throw when entity value contains '&'", function () {
    const evp = new EntitiesValueParser();
    expect(() => evp.addEntity("bad", "a & b")).toThrow();
  });

  it("external entity coexists with docType entity — both replaced", function () {
    const evp = new EntitiesValueParser({ default: true });
    evp.addEntity("ext", "external");
    const builder = new JsObjBuilder();
    builder.registerValueParser("entity", evp);
    const parser = new XMLParser({
      doctypeOptions: { enabled: true },
      OutputBuilder: builder,
    });
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
// 8. Security — maxEntityCount (doctypeOptions)
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
    { doctypeOptions: { enabled: true, maxEntityCount: 2 } }
  );

  runAcrossAllInputSourcesWithFactory(
    "should not throw when entity count equals maxEntityCount",
    `<!DOCTYPE root [
      <!ENTITY e1 "a">
      <!ENTITY e2 "b">
    ]><root>&e1;&e2;</root>`,
    (result) => {
      expect(result.root).toBe("ab");
    },
    () => makeParser({ enabled: true, maxEntityCount: 2 })
  );

  runAcrossAllInputSourcesWithFactory(
    "maxEntityCount: 0 (unlimited) — many entities allowed",
    `<!DOCTYPE root [
      <!ENTITY e1 "a"><!ENTITY e2 "b"><!ENTITY e3 "c">
      <!ENTITY e4 "d"><!ENTITY e5 "e">
    ]><root>&e1;&e2;&e3;&e4;&e5;</root>`,
    (result) => {
      expect(result.root).toBe("abcde");
    },
    () => makeParser({ enabled: true, maxEntityCount: 0 })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Security — maxEntitySize (doctypeOptions)
// ─────────────────────────────────────────────────────────────────────────────
describe("Security — maxEntitySize", function () {

  runAcrossAllInputSourcesWithException(
    "should throw when an entity definition exceeds maxEntitySize",
    `<!DOCTYPE root [
      <!ENTITY big "123456789012345">
    ]><root>&big;</root>`,
    /Entity.*size.*exceeds maximum/,
    { doctypeOptions: { enabled: true, maxEntitySize: 10 } }
  );

  runAcrossAllInputSourcesWithFactory(
    "should not throw when entity definition is exactly at maxEntitySize",
    `<!DOCTYPE root [
      <!ENTITY exact "1234567890">
    ]><root>&exact;</root>`,
    (result) => {
      expect(result.root).toBe(1234567890);
    },
    () => makeParser({ enabled: true, maxEntitySize: 10 })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Security — maxTotalExpansions (EntitiesValueParser)
// ─────────────────────────────────────────────────────────────────────────────
describe("Security — maxTotalExpansions", function () {

  // maxTotalExpansions lives on EntitiesValueParser, so we need a factory.
  // runAcrossAllInputSourcesWithFactory doesn't support throw expectations,
  // so we write the three input-type cases inline.
  const throwXml = `<!DOCTYPE root [<!ENTITY e "x">]><root>&e;&e;&e;&e;&e;&e;</root>`;
  ["string", "buffer", "feedable"].forEach((inputType) => {
    it(`should throw when total expansions exceeds limit [${inputType}]`, function () {
      const parser = makeParser({ enabled: true }, { maxTotalExpansions: 3 });
      expect(() => createInputSource(throwXml, inputType).parse(parser))
        .toThrowError(/expansion limit exceeded/);
    });
  });

  runAcrossAllInputSourcesWithFactory(
    "should not throw when expansions are within limit",
    `<!DOCTYPE root [
      <!ENTITY e "x">
    ]><root>&e;&e;&e;</root>`,
    (result) => {
      expect(result.root).toBe("xxx");
    },
    () => makeParser({ enabled: true }, { maxTotalExpansions: 3 })
  );

  it("maxTotalExpansions counts external entity expansions too", function () {
    const evp = new EntitiesValueParser({ default: true, external: true, maxTotalExpansions: 2 });
    evp.addEntity("e", "x");
    const builder = new JsObjBuilder();
    builder.registerValueParser("entity", evp);
    const parser = new XMLParser({ OutputBuilder: builder });
    expect(() => parser.parse("<root>&e;&e;&e;</root>")).toThrowError(
      "Entity expansion limit exceeded: 3 > 2"
    );
  });

  runAcrossAllInputSourcesWithFactory(
    "maxTotalExpansions: 0 — unlimited",
    `<!DOCTYPE root [
      <!ENTITY e "x">
    ]><root>&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;</root>`,
    (result) => {
      expect(result.root).toBe("xxxxxxxxxx");
    },
    () => makeParser({ enabled: true }, { maxTotalExpansions: 0 })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Security — maxExpandedLength (EntitiesValueParser)
// ─────────────────────────────────────────────────────────────────────────────
describe("Security — maxExpandedLength", function () {

  runAcrossAllInputSourcesWithFactory(
    "should not throw when expanded length is within limit",
    `<!DOCTYPE root [
      <!ENTITY e "0123456789">
    ]><root>&e;</root>`,
    (result) => {
      expect(result.root).toBe(123456789); // numeric coercion
    },
    () => makeParser({ enabled: true }, { maxExpandedLength: 15 })
  );

  runAcrossAllInputSourcesWithFactory(
    "maxExpandedLength: 0 — unlimited",
    `<!DOCTYPE root [
      <!ENTITY e "abcdefghij">
    ]><root>&e;&e;&e;&e;&e;</root>`,
    (result) => {
      expect(result.root).toBe("abcdefghijabcdefghijabcdefghijabcdefghijabcdefghij");
    },
    () => makeParser({ enabled: true }, { maxExpandedLength: 0 })
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Security — Billion Laughs (entity explosion attack)
// ─────────────────────────────────────────────────────────────────────────────
describe("Security — Billion Laughs mitigation", function () {

  it("entity values containing '&' are silently discarded (no recursive expansion)", function () {
    const evp = new EntitiesValueParser({ default: true });
    const builder = new JsObjBuilder();
    builder.registerValueParser("entity", evp);
    const parser = new XMLParser({
      doctypeOptions: { enabled: true },
      OutputBuilder: builder,
    });
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
    const evp = new EntitiesValueParser({ default: true, maxTotalExpansions: 100 });
    const builder = new JsObjBuilder();
    builder.registerValueParser("entity", evp);
    const parser = new XMLParser({
      doctypeOptions: { enabled: true },
      OutputBuilder: builder,
    });
    const refs = "&e;".repeat(200);
    expect(() =>
      parser.parse(`<!DOCTYPE root [<!ENTITY e "x">]><root>${refs}</root>`)
    ).toThrowError("Entity expansion limit exceeded: 200 > 100");
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Per-parse isolation — counters reset between parses
// ─────────────────────────────────────────────────────────────────────────────
describe("Per-parse isolation", function () {

  it("expansion counters reset between parses — second parse should not carry over", function () {
    const evp = new EntitiesValueParser({ default: true, maxTotalExpansions: 5 });
    const builder = new JsObjBuilder();
    builder.registerValueParser("entity", evp);
    const parser = new XMLParser({
      doctypeOptions: { enabled: true },
      OutputBuilder: builder,
    });
    const xml = `<!DOCTYPE root [<!ENTITY e "x">]><root>&e;&e;&e;&e;&e;</root>`;
    const r1 = parser.parse(xml);
    expect(r1.root).toBe("xxxxx");

    // Second parse — counters reset automatically in addDocTypeEntities()
    const r2 = parser.parse(xml);
    expect(r2.root).toBe("xxxxx");
  });


});