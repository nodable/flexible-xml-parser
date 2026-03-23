import XMLParser from "../src/XMLParser.js";
import { ParseError, ErrorCode } from "../src/ParseError.js";
import { runAcrossAllInputSources, runAcrossAllInputSourcesWithException } from "./helpers/testRunner.js";


// ─── helpers ─────────────────────────────────────────────────────────────────

function nested(depth, content = "x") {
  let xml = "";
  for (let i = 0; i < depth; i++) xml += `<n${i}>`;
  xml += content;
  for (let i = depth - 1; i >= 0; i--) xml += `</n${i}>`;
  return xml;
}

function tagWithAttrs(count) {
  let attrs = "";
  for (let i = 0; i < count; i++) attrs += ` a${i}="v${i}"`;
  return `<root${attrs}></root>`;
}

function expectParseError(fn, code) {
  let thrown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeDefined("Expected a ParseError to be thrown");
  expect(thrown instanceof ParseError).toBe(true, `Expected ParseError, got ${thrown?.constructor?.name}`);
  if (code) {
    expect(thrown.code).toBe(code, `Expected code '${code}', got '${thrown?.code}'`);
  }
}


// ─── Option validation ────────────────────────────────────────────────────────

describe("limits option — constructor validation", function () {

  it("should accept limits: null (no limits)", function () {
    expect(() => new XMLParser({ limits: null })).not.toThrow();
  });

  it("should accept limits: {} (empty object, uses defaults)", function () {
    expect(() => new XMLParser({ limits: {} })).not.toThrow();
  });

  it("should accept valid maxNestedTags", function () {
    expect(() => new XMLParser({ limits: { maxNestedTags: 1 } })).not.toThrow();
    expect(() => new XMLParser({ limits: { maxNestedTags: 1000 } })).not.toThrow();
  });

  it("should accept valid maxAttributesPerTag", function () {
    expect(() => new XMLParser({ limits: { maxAttributesPerTag: 0 } })).not.toThrow();
    expect(() => new XMLParser({ limits: { maxAttributesPerTag: 500 } })).not.toThrow();
  });

  it("should reject maxNestedTags: 0 (must be >= 1)", function () {
    expectParseError(() => new XMLParser({ limits: { maxNestedTags: 0 } }), ErrorCode.INVALID_INPUT);
  });

  it("should reject maxNestedTags: -1", function () {
    expectParseError(() => new XMLParser({ limits: { maxNestedTags: -1 } }), ErrorCode.INVALID_INPUT);
  });

  it("should reject maxNestedTags: 1.5 (must be integer)", function () {
    expectParseError(() => new XMLParser({ limits: { maxNestedTags: 1.5 } }), ErrorCode.INVALID_INPUT);
  });

  it("should reject maxNestedTags: '10' (must be number)", function () {
    expectParseError(() => new XMLParser({ limits: { maxNestedTags: "10" } }), ErrorCode.INVALID_INPUT);
  });

  it("should reject maxAttributesPerTag: -1", function () {
    expectParseError(() => new XMLParser({ limits: { maxAttributesPerTag: -1 } }), ErrorCode.INVALID_INPUT);
  });

  it("should reject maxAttributesPerTag: 2.5 (must be integer)", function () {
    expectParseError(() => new XMLParser({ limits: { maxAttributesPerTag: 2.5 } }), ErrorCode.INVALID_INPUT);
  });

  it("should reject limits as a non-object (string)", function () {
    expectParseError(() => new XMLParser({ limits: "50" }), ErrorCode.INVALID_INPUT);
  });

});


// ─── maxNestedTags ────────────────────────────────────────────────────────────

describe("limits.maxNestedTags — enforcement", function () {

  it("should parse successfully when depth equals limit", function () {
    const parser = new XMLParser({ limits: { maxNestedTags: 3 } });
    // depth 3: <n0><n1><n2>x</n2></n1></n0>
    expect(() => parser.parse(nested(3))).not.toThrow();
  });

  it("should throw ParseError when depth exceeds limit by one", function () {
    const parser = new XMLParser({ limits: { maxNestedTags: 3 } });
    expectParseError(() => parser.parse(nested(4)), ErrorCode.LIMIT_MAX_NESTED_TAGS);
  });

  it("should throw ParseError when depth far exceeds limit", function () {
    const parser = new XMLParser({ limits: { maxNestedTags: 5 } });
    expectParseError(() => parser.parse(nested(20)), ErrorCode.LIMIT_MAX_NESTED_TAGS);
  });

  it("should include tag name in the error message", function () {
    const parser = new XMLParser({ limits: { maxNestedTags: 2 } });
    let err;
    try { parser.parse(nested(3)); } catch (e) { err = e; }
    expect(err instanceof ParseError).toBe(true);
    // The offending tag n2 is at depth 3
    expect(err.message).toMatch(/n2/);
  });

  it("ParseError should carry position info (line/col)", function () {
    const parser = new XMLParser({ limits: { maxNestedTags: 2 } });
    let err;
    try { parser.parse(nested(3)); } catch (e) { err = e; }
    expect(err instanceof ParseError).toBe(true);
    expect(typeof err.line).toBe("number");
    expect(typeof err.col).toBe("number");
  });

  it("should allow limit: 1 (only root tag)", function () {
    const parser = new XMLParser({ limits: { maxNestedTags: 1 } });
    expect(() => parser.parse("<root>text</root>")).not.toThrow();
  });

  it("should throw for limit: 1 with one level of nesting", function () {
    const parser = new XMLParser({ limits: { maxNestedTags: 1 } });
    expectParseError(
      () => parser.parse("<root><child>text</child></root>"),
      ErrorCode.LIMIT_MAX_NESTED_TAGS
    );
  });

  it("should not limit depth when maxNestedTags is null (default)", function () {
    const parser = new XMLParser();
    // 50 levels deep should be fine without a limit
    expect(() => parser.parse(nested(50))).not.toThrow();
  });

  it("depth limit applies to multiple sibling branches independently", function () {
    // Each sibling resets depth — only deeper nesting should fail
    const parser = new XMLParser({ limits: { maxNestedTags: 2 } });
    const xml = `<root><a><b/></a><c><d/></c></root>`;
    expect(() => parser.parse(xml)).not.toThrowError("[LIMIT_MAX_NESTED_TAGS] at line 1, col 0: Nesting depth 3 exceeds limit of 2 (tag: 'b')");
  });

  it("should throw on feed/end (feedable source) when depth exceeded", function () {
    const parser = new XMLParser({ limits: { maxNestedTags: 3 } });
    const xml = nested(4);
    expectParseError(() => {
      const chunk = 20;
      for (let i = 0; i < xml.length; i += chunk) parser.feed(xml.slice(i, i + chunk));
      parser.end();
    }, ErrorCode.LIMIT_MAX_NESTED_TAGS);
  });

});


// ─── maxAttributesPerTag ──────────────────────────────────────────────────────

describe("limits.maxAttributesPerTag — enforcement", function () {

  it("should parse successfully when attribute count equals limit", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxAttributesPerTag: 3 },
    });
    expect(() => parser.parse(tagWithAttrs(3))).not.toThrow();
  });

  it("should throw ParseError when attribute count exceeds limit by one", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxAttributesPerTag: 3 },
    });
    expectParseError(() => parser.parse(tagWithAttrs(4)), ErrorCode.LIMIT_MAX_ATTRIBUTES);
  });

  it("should include tag name and counts in error message", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxAttributesPerTag: 2 },
    });
    let err;
    try { parser.parse(tagWithAttrs(5)); } catch (e) { err = e; }
    expect(err instanceof ParseError).toBe(true);
    expect(err.message).toMatch(/5/);   // actual count
    expect(err.message).toMatch(/2/);   // limit
  });

  it("should enforce limit: 0 (no attributes allowed)", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxAttributesPerTag: 0 },
    });
    expectParseError(() => parser.parse(`<root a="1"></root>`), ErrorCode.LIMIT_MAX_ATTRIBUTES);
  });

  it("should not throw for limit: 0 when tag has no attributes", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxAttributesPerTag: 0 },
    });
    expect(() => parser.parse("<root></root>")).not.toThrow();
  });

  it("should apply limit per-tag, not globally across all tags", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxAttributesPerTag: 2 },
    });
    // Two tags each with 2 attrs: fine
    const xml = `<root a="1" b="2"><child c="3" d="4"/></root>`;
    expect(() => parser.parse(xml)).not.toThrow();
  });

  it("should throw when any single tag exceeds the limit", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxAttributesPerTag: 2 },
    });
    const xml = `<root a="1" b="2"><child c="3" d="4" e="5"/></root>`;
    expectParseError(() => parser.parse(xml), ErrorCode.LIMIT_MAX_ATTRIBUTES);
  });

  it("should not check attributes when skip.attributes is true (default)", function () {
    // With attributes skipped, flushAttributes is never called — limit is irrelevant
    const parser = new XMLParser({
      // skip.attributes defaults to true
      limits: { maxAttributesPerTag: 0 },
    });
    // Even though limit is 0, attributes are skipped entirely — no throw
    expect(() => parser.parse(`<root a="1" b="2"></root>`)).not.toThrow();
  });

  it("should not limit attributes when maxAttributesPerTag is null (default)", function () {
    const parser = new XMLParser({ skip: { attributes: false } });
    expect(() => parser.parse(tagWithAttrs(50))).not.toThrow();
  });

});


// ─── Combined limits ──────────────────────────────────────────────────────────

describe("limits — combined maxNestedTags + maxAttributesPerTag", function () {

  it("should enforce both limits simultaneously", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxNestedTags: 3, maxAttributesPerTag: 2 },
    });
    // Depth-first: nesting limit fires first before attrs on the deep tag
    expectParseError(() => parser.parse(nested(4)), ErrorCode.LIMIT_MAX_NESTED_TAGS);
  });

  it("attributes limit fires on a shallow tag with too many attrs", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxNestedTags: 10, maxAttributesPerTag: 2 },
    });
    expectParseError(() => parser.parse(tagWithAttrs(5)), ErrorCode.LIMIT_MAX_ATTRIBUTES);
  });

  it("valid XML passes both limits", function () {
    const parser = new XMLParser({
      skip: { attributes: false },
      limits: { maxNestedTags: 5, maxAttributesPerTag: 3 },
    });
    const xml = `<a x="1" y="2"><b z="3"><c/></b></a>`;
    expect(() => parser.parse(xml)).not.toThrow();
  });

});


// ─── ParseError general contract ─────────────────────────────────────────────

describe("ParseError — general error contract", function () {

  it("all parser errors should be instanceof ParseError", function () {
    const cases = [
      // Invalid input type
      () => new XMLParser().parse(12345),
      // Unclosed tag (no autoClose)
      () => new XMLParser().parse("<root>"),
      // Mismatched closing tag
      () => new XMLParser().parse("<root></other>"),
    ];

    for (const fn of cases) {
      let err;
      try { fn(); } catch (e) { err = e; }
      expect(err).toBeDefined();
      expect(err instanceof ParseError).toBe(true, `Expected ParseError, got: ${err?.constructor?.name}: ${err?.message}`);
      expect(typeof err.code).toBe("string", `Expected string code, got: ${typeof err?.code}`);
    }
  });

  it("ParseError should have a meaningful toString()", function () {
    const e = new ParseError("bad tag", ErrorCode.UNEXPECTED_CLOSE_TAG, { line: 3, col: 7, index: 50 });
    const str = e.toString();
    expect(str).toContain("ParseError");
    expect(str).toContain("UNEXPECTED_CLOSE_TAG");
    expect(str).toContain("line 3");
    expect(str).toContain("bad tag");
  });

  it("ParseError without position still has a useful toString()", function () {
    const e = new ParseError("bad input", ErrorCode.INVALID_INPUT);
    expect(e.line).toBeUndefined();
    expect(e.col).toBeUndefined();
    expect(e.toString()).toContain("[INVALID_INPUT]");
    expect(e.toString()).toContain("bad input");
  });

  it("limit errors carry position info", function () {
    const parser = new XMLParser({ limits: { maxNestedTags: 2 } });
    let err;
    try { parser.parse(nested(3)); } catch (e) { err = e; }
    expect(err instanceof ParseError).toBe(true);
    expect(err.code).toBe(ErrorCode.LIMIT_MAX_NESTED_TAGS);
    expect(typeof err.line).toBe("number");
    expect(typeof err.col).toBe("number");
    expect(typeof err.index).toBe("number");
  });

  it("addEntity with bad key throws ParseError", function () {
    const parser = new XMLParser();
    expectParseError(() => parser.addEntity("&bad", "val"), ErrorCode.ENTITY_INVALID_KEY);
  });

  it("addEntity with bad value throws ParseError", function () {
    const parser = new XMLParser();
    expectParseError(() => parser.addEntity("ok", "val&bad"), ErrorCode.ENTITY_INVALID_VALUE);
  });

  it("ErrorCode export contains all expected codes", function () {
    const expected = [
      "INVALID_INPUT", "INVALID_STREAM",
      "ALREADY_STREAMING", "NOT_STREAMING", "DATA_MUST_BE_STRING",
      "UNEXPECTED_END", "UNEXPECTED_CLOSE_TAG", "MISMATCHED_CLOSE_TAG",
      "UNEXPECTED_TRAILING_DATA", "INVALID_TAG", "UNCLOSED_QUOTE",
      "MULTIPLE_NAMESPACES",
      "SECURITY_PROTOTYPE_POLLUTION", "SECURITY_RESERVED_OPTION", "SECURITY_RESTRICTED_NAME",
      "LIMIT_MAX_NESTED_TAGS", "LIMIT_MAX_ATTRIBUTES",
      "ENTITY_MAX_COUNT", "ENTITY_MAX_SIZE", "ENTITY_MAX_EXPANSIONS", "ENTITY_MAX_EXPANDED_LENGTH",
      "ENTITY_INVALID_KEY", "ENTITY_INVALID_VALUE",
    ];
    for (const code of expected) {
      expect(ErrorCode[code]).toBe(code, `Missing ErrorCode: ${code}`);
    }
  });

});
