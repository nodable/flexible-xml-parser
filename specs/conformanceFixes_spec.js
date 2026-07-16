import XMLParser from "../src/XMLParser.js";
import { CompactBuilderFactory } from "@nodable/compact-builder";
import { ErrorCode } from "../src/ParseError.js";
import { sanitizeContent } from "../src/util.js";
import {
  runAcrossAllInputSources,
} from "./helpers/testRunner.js";

// Builder with no value-parser pipeline at all, so assertions see exactly
// what the parser core produced (no 'ws' collapsing, no entity decoding).
const rawBuilder = () => new CompactBuilderFactory({
  tags: { valueParsers: [] },
  attributes: { valueParsers: [] },
});

function expectCode(fn, code) {
  let thrown = null;
  try { fn(); } catch (err) { thrown = err; }
  expect(thrown).not.toBeNull();
  expect(thrown.code).toBe(code);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Line-ending normalization — text / CDATA / comment
// ─────────────────────────────────────────────────────────────────────────────
describe("Line-ending normalization", function () {

  runAcrossAllInputSources(
    "real CRLF in element text collapses to a single LF",
    `<root><a>line1\r\nline2</a></root>`,
    (result) => expect(result.root.a).toBe("line1\nline2"),
    { OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "lone CR in element text becomes LF",
    `<root><a>line1\rline2</a></root>`,
    (result) => expect(result.root.a).toBe("line1\nline2"),
    { OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "CRLF CRLF is not collapsed further than one LF each",
    `<root><a>a\r\n\r\nb</a></root>`,
    (result) => expect(result.root.a).toBe("a\n\nb"),
    { OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "xml:space=preserve still gets line-ending normalization",
    `<root><a xml:space="preserve">x\r\ny</a></root>`,
    (result) => expect(result.root.a["#text"]).toBe("x\ny"),
    { OutputBuilder: rawBuilder(), skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "a character reference like &#xD; is left untouched by this rule",
    `<root><a>x&#xD;y</a></root>`,
    (result) => expect(result.root.a).toBe("x&#xD;y"),
    { OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "CDATA content gets the same CRLF -> LF normalization",
    `<root><a><![CDATA[l1\r\nl2]]></a></root>`,
    (result) => expect(result.root.a).toBe("l1\nl2"),
    { OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "comment content gets the same CRLF -> LF normalization",
    `<root><!--c1\r\nc2--><a>x</a></root>`,
    (result) => expect(result.root["#comment"]).toBe("c1\nc2"),
    { OutputBuilder: rawBuilder(), nameFor: { comment: "#comment" } }
  );

  runAcrossAllInputSources(
    "a document with only LF is unaffected",
    `<root><a>l1\nl2</a></root>`,
    (result) => expect(result.root.a).toBe("l1\nl2"),
    { OutputBuilder: rawBuilder() }
  );

  it("sanitizeContent returns the same string reference when no CR is present (no reallocation)", function () {
    const s = "no carriage returns here\n\njust newlines";
    expect(sanitizeContent(s)).toBe(s);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2 & 3. Attribute value whitespace folding — CRLF -> one space, tab -> one space
// ─────────────────────────────────────────────────────────────────────────────
describe("Attribute value whitespace folding", function () {

  runAcrossAllInputSources(
    "a real CRLF pair inside an attribute value folds to exactly one space",
    `<e a="x\r\ny"/>`,
    (result) => expect(result.e["@_a"]).toBe("x y"),
    { skip: { attributes: false }, OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "a lone CR inside an attribute value folds to one space",
    `<e a="x\ry"/>`,
    (result) => expect(result.e["@_a"]).toBe("x y"),
    { skip: { attributes: false }, OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "a lone LF inside an attribute value folds to one space",
    `<e a="x\ny"/>`,
    (result) => expect(result.e["@_a"]).toBe("x y"),
    { skip: { attributes: false }, OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "two CRLF pairs inside an attribute value fold to exactly two spaces",
    `<e a="x\r\n\r\ny"/>`,
    (result) => expect(result.e["@_a"]).toBe("x  y"),
    { skip: { attributes: false }, OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "a literal tab inside an attribute value folds to one space",
    `<e a="x\ty"/>`,
    (result) => expect(result.e["@_a"]).toBe("x y"),
    { skip: { attributes: false }, OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "a &#9; reference inside an attribute value is left as a literal tab (differs from the raw-tab case above pre-entity-decoding)",
    `<e a="x&#9;y"/>`,
    (result) => expect(result.e["@_a"]).toBe("x&#9;y"),
    { skip: { attributes: false }, OutputBuilder: rawBuilder() }
  );

  runAcrossAllInputSources(
    "a literal tab immediately followed by a literal CRLF folds to two separate spaces",
    `<e a="x\t\r\ny"/>`,
    (result) => expect(result.e["@_a"]).toBe("x  y"),
    { skip: { attributes: false }, OutputBuilder: rawBuilder() }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Illegal literal control characters — always reject
// ─────────────────────────────────────────────────────────────────────────────
describe("Illegal literal control characters", function () {

  it("a raw NUL byte in element text throws ILLEGAL_CHARACTER", function () {
    expectCode(() => new XMLParser().parse(`<root>a\x00b</root>`), ErrorCode.ILLEGAL_CHARACTER);
  });

  it("a raw ESC byte in element text throws ILLEGAL_CHARACTER", function () {
    expectCode(() => new XMLParser().parse(`<root>a\x1Bb</root>`), ErrorCode.ILLEGAL_CHARACTER);
  });

  it("a raw control character in an attribute value throws ILLEGAL_CHARACTER", function () {
    expectCode(
      () => new XMLParser({ skip: { attributes: false } }).parse(`<e a="a\x01b"/>`),
      ErrorCode.ILLEGAL_CHARACTER
    );
  });

  it("a raw control character in CDATA content throws ILLEGAL_CHARACTER", function () {
    expectCode(() => new XMLParser().parse(`<root><![CDATA[a\x02b]]></root>`), ErrorCode.ILLEGAL_CHARACTER);
  });

  it("a raw control character in comment content throws ILLEGAL_CHARACTER", function () {
    expectCode(() => new XMLParser().parse(`<root><!--a\x03b--><x/></root>`), ErrorCode.ILLEGAL_CHARACTER);
  });

  it("tab, LF, and CR do not throw", function () {
    expect(() => new XMLParser().parse(`<root>a\tb\nc\rd</root>`)).not.toThrow();
  });

  it("&#0; (a reference, not a literal byte) does not throw via this check", function () {
    expect(() => new XMLParser().parse(`<root>a&#0;b</root>`)).not.toThrow();
  });

  it("throws the same way for a document declared XML 1.0", function () {
    expectCode(() => new XMLParser().parse(`<?xml version="1.0"?><root>a\x00b</root>`), ErrorCode.ILLEGAL_CHARACTER);
  });

  it("throws the same way for a document declared XML 1.1", function () {
    expectCode(() => new XMLParser().parse(`<?xml version="1.1"?><root>a\x00b</root>`), ErrorCode.ILLEGAL_CHARACTER);
  });

  it("still throws even when the parser is configured for lenient/HTML parsing", function () {
    expectCode(() => new XMLParser({ autoClose: 'html' }).parse(`<root>a\x00b`), ErrorCode.ILLEGAL_CHARACTER);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Duplicate attributes — attributes.duplicate
// ─────────────────────────────────────────────────────────────────────────────
describe("Duplicate attributes — attributes.duplicate", function () {

  runAcrossAllInputSources(
    "default (no setting passed): last occurrence wins",
    `<e a="1" a="2"/>`,
    (result) => expect(result.e["@_a"]).toBe(2),
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "'ignore': first occurrence wins, matcher and builder agree",
    `<e a="1" a="2"/>`,
    (result, _type, parser) => {
      expect(result.e["@_a"]).toBe(1);
    },
    { skip: { attributes: false }, attributes: { duplicate: 'ignore' } }
  );

  it("'ignore': the matcher itself sees the first value, not the second", function () {
    let seenValue;
    new XMLParser({
      skip: { attributes: false },
      attributes: { duplicate: 'ignore' },
      exitIf: (matcher) => { seenValue = matcher.getAttrValue('a'); return false; },
    }).parse(`<e a="1" a="2"></e>`);
    expect(seenValue).toBe('1');
  });

  it("'throw': rejects the document as soon as a repeat is found", function () {
    expectCode(
      () => new XMLParser({ skip: { attributes: false }, attributes: { duplicate: 'throw' } }).parse(`<e a="1" a="2"/>`),
      ErrorCode.DUPLICATE_ATTRIBUTE
    );
  });

  runAcrossAllInputSources(
    "three repeats — 'overwrite' still takes the last",
    `<e a="1" a="2" a="3"/>`,
    (result) => expect(result.e["@_a"]).toBe(3),
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "three repeats — 'ignore' still takes the first",
    `<e a="1" a="2" a="3"/>`,
    (result) => expect(result.e["@_a"]).toBe(1),
    { skip: { attributes: false }, attributes: { duplicate: 'ignore' } }
  );

  it("three repeats — 'throw' still rejects on the second occurrence", function () {
    expectCode(
      () => new XMLParser({ skip: { attributes: false }, attributes: { duplicate: 'throw' } }).parse(`<e a="1" a="2" a="3"/>`),
      ErrorCode.DUPLICATE_ATTRIBUTE
    );
  });

  runAcrossAllInputSources(
    "the same attribute name on sibling tags is never an error, under any mode",
    `<root><e a="1"/><e a="2"/></root>`,
    (result) => {
      expect(result.root.e[0]["@_a"]).toBe(1);
      expect(result.root.e[1]["@_a"]).toBe(2);
    },
    { skip: { attributes: false }, attributes: { duplicate: 'throw' } }
  );

  runAcrossAllInputSources(
    "the same attribute name on nested tags is never an error, under any mode",
    `<root a="1"><e a="2"/></root>`,
    (result) => {
      expect(result.root["@_a"]).toBe(1);
      expect(result.root.e["@_a"]).toBe(2);
    },
    { skip: { attributes: false }, attributes: { duplicate: 'throw' } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Unquoted attribute values — always reject, never configurable
// ─────────────────────────────────────────────────────────────────────────────
describe("Unquoted attribute values", function () {

  it("<e a=b/> throws UNQUOTED_ATTRIBUTE_VALUE", function () {
    expectCode(() => new XMLParser().parse(`<e a=b/>`), ErrorCode.UNQUOTED_ATTRIBUTE_VALUE);
  });

  it('<e a=b"c"/> throws UNQUOTED_ATTRIBUTE_VALUE', function () {
    expectCode(() => new XMLParser().parse(`<e a=b"c"/>`), ErrorCode.UNQUOTED_ATTRIBUTE_VALUE);
  });

  it("<e a=b=c/> throws UNQUOTED_ATTRIBUTE_VALUE", function () {
    expectCode(() => new XMLParser().parse(`<e a=b=c/>`), ErrorCode.UNQUOTED_ATTRIBUTE_VALUE);
  });

  it("<e name=amit gupta/> throws immediately, no attribute reaches output", function () {
    expectCode(() => new XMLParser({ skip: { attributes: false } }).parse(`<e name=amit gupta/>`), ErrorCode.UNQUOTED_ATTRIBUTE_VALUE);
  });

  runAcrossAllInputSources(
    "a properly quoted value containing '>' or '<' parses normally",
    `<e a="3 >= 4" b="4 < 5" />`,
    (result) => {
      expect(result.e["@_a"]).toBe("3 >= 4");
      expect(result.e["@_b"]).toBe("4 < 5");
    },
    { skip: { attributes: false } }
  );

  it("still throws when the parser is configured for lenient/HTML parsing", function () {
    expectCode(() => new XMLParser({ autoClose: 'html' }).parse(`<e a=b/>`), ErrorCode.UNQUOTED_ATTRIBUTE_VALUE);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. attributes.booleanType — replaces the previously-dead option
// ─────────────────────────────────────────────────────────────────────────────
describe("attributes.booleanType", function () {

  runAcrossAllInputSources(
    "'allow' (default, explicit): valueless attribute kept as true",
    `<e flag/>`,
    (result) => expect(result.e["@_flag"]).toBe(true),
    { skip: { attributes: false }, attributes: { booleanType: 'allow' } }
  );

  runAcrossAllInputSources(
    "no setting passed at all behaves as 'allow'",
    `<e flag/>`,
    (result) => expect(result.e["@_flag"]).toBe(true),
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "'ignore': valueless attribute dropped entirely",
    `<e flag/>`,
    (result) => expect(result.e["@_flag"]).toBeUndefined(),
    { skip: { attributes: false }, attributes: { booleanType: 'ignore' } }
  );

  it("'throw': rejects the document as soon as a valueless attribute is found", function () {
    expectCode(
      () => new XMLParser({ skip: { attributes: false }, attributes: { booleanType: 'throw' } }).parse(`<e flag/>`),
      ErrorCode.BOOLEAN_ATTRIBUTE_REJECTED
    );
  });

  runAcrossAllInputSources(
    "other attributes are unaffected under 'allow'",
    `<e a="1" flag b="2"/>`,
    (result) => { expect(result.e["@_a"]).toBe(1); expect(result.e["@_b"]).toBe(2); },
    { skip: { attributes: false }, attributes: { booleanType: 'allow' } }
  );

  runAcrossAllInputSources(
    "other attributes are unaffected under 'ignore'",
    `<e a="1" flag b="2"/>`,
    (result) => { expect(result.e["@_a"]).toBe(1); expect(result.e["@_b"]).toBe(2); expect(result.e["@_flag"]).toBeUndefined(); },
    { skip: { attributes: false }, attributes: { booleanType: 'ignore' } }
  );

  it("other attributes never reach the builder under 'throw' either (whole tag rejected)", function () {
    expectCode(
      () => new XMLParser({ skip: { attributes: false }, attributes: { booleanType: 'throw' } }).parse(`<e a="1" flag b="2"/>`),
      ErrorCode.BOOLEAN_ATTRIBUTE_REJECTED
    );
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Regression coverage — behavior that must NOT change
// ─────────────────────────────────────────────────────────────────────────────
describe("Regression coverage — unaffected by the conformance fixes", function () {

  runAcrossAllInputSources(
    "a literal '<' inside a quoted attribute value still parses",
    `<e a="3 < 4"/>`,
    (result) => expect(result.e["@_a"]).toBe("3 < 4"),
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    "a comment containing '--' unrelated to its close still parses unchanged",
    `<!-- a -- b --><root>x</root>`,
    (result) => expect(result["#comment"]).toBe(" a -- b "),
    { nameFor: { comment: "#comment" } }
  );

  runAcrossAllInputSources(
    "element text containing the literal sequence ']]>' outside CDATA parses unchanged",
    `<root><a>data]]>more</a></root>`,
    (result) => expect(result.root.a).toBe("data]]>more")
  );

  runAcrossAllInputSources(
    "more than one top-level element parses, both appear in the result",
    `<a>1</a><b>2</b>`,
    (result) => { expect(result.a).toBe(1); expect(result.b).toBe(2); }
  );

  it("an empty document parses without error", function () {
    expect(() => new XMLParser().parse(``)).not.toThrow();
  });

});
