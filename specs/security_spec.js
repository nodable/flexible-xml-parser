import XMLParser from "../src/XMLParser.js";
import { runAcrossAllInputSources, runAcrossAllInputSourcesWithException } from "./helpers/testRunner.js";
import { criticalProperties, DANGEROUS_PROPERTY_NAMES } from "../src/util.js";


describe("Security - Prototype Pollution Prevention", function () {

  // ─── CRITICAL PROPERTIES ────────────────────────────────────────────────────
  // __proto__, constructor, prototype  →  always throw; no recovery possible

  // Tag names
  for (let prop of criticalProperties) {
    runAcrossAllInputSourcesWithException(
      `should reject '${prop}' as tag name`,
      `<${prop}>malicious</${prop}>`,
      `[SECURITY] Invalid name: "${prop}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }

  // Attribute names (attributes must be enabled to trigger the check)
  for (let prop of criticalProperties) {
    runAcrossAllInputSourcesWithException(
      `should reject '${prop}' as attribute name`,
      `<root ${prop}="malicious"></root>`,
      `[SECURITY] Invalid name: "${prop}" is a reserved JavaScript keyword that could cause prototype pollution`,
      { skip: { attributes: false } }
    );
  }

  // ─── DANGEROUS PROPERTIES ───────────────────────────────────────────────────
  // hasOwnProperty, toString, valueOf, __defineGetter__, etc.
  // These are sanitized (prefixed with __) rather than rejected outright.

  // Default sanitisation: __ prefix on tag names
  for (let prop of DANGEROUS_PROPERTY_NAMES) {
    runAcrossAllInputSources(
      `should sanitize dangerous tag name '${prop}' with default handler`,
      `<${prop}>value</${prop}>`,
      (result) => {
        expect(result[`__${prop}`]).toBe("value");
      }
    );
  }

  // Default sanitisation: __ prefix on attribute names
  for (let prop of DANGEROUS_PROPERTY_NAMES) {
    runAcrossAllInputSources(
      `should sanitize dangerous attribute name '${prop}' with default handler`,
      `<root ${prop}="value"></root>`,
      (result) => {
        expect(result.root[`__${prop}`]).toBe("value");
      },
      { attributes: { prefix: "" }, skip: { attributes: false } }
    );
  }

  // Custom onDangerousProperty handler: tag names
  for (let prop of DANGEROUS_PROPERTY_NAMES) {
    runAcrossAllInputSources(
      `should sanitize dangerous tag name '${prop}' with custom onDangerousProperty`,
      `<${prop}>value</${prop}>`,
      (result) => {
        expect(result[`#${prop}`]).toBe("value");
      },
      { onDangerousProperty: (name) => `#${name}` }
    );
  }

  // Custom onDangerousProperty handler: attribute names
  for (let prop of DANGEROUS_PROPERTY_NAMES) {
    runAcrossAllInputSources(
      `should sanitize dangerous attribute name '${prop}' with custom onDangerousProperty`,
      `<root ${prop} = "value" ></root > `,
      (result) => {
        expect(result.root[`#${prop}`]).toBe("value");
      },
      { attributes: { prefix: "" }, onDangerousProperty: (name) => `#${name}`, skip: { attributes: false } }
    );
  }

  // ─── OPTION-LEVEL PROPERTY NAME VALIDATION ──────────────────────────────────
  // Critical names must be rejected when used as nameFor.*, attributes.prefix,
  // or attributes.groupBy values.

  it("should reject a critical name as nameFor.text", function () {
    expect(() => {
      new XMLParser({ nameFor: { text: "__proto__" } });
    }).toThrowError("SECURITY: '__proto__' is a reserved JavaScript keyword and cannot be used as nameFor.text");
  });

  it("should reject a dangerous name as nameFor.cdata", function () {
    expect(() => {
      new XMLParser({ nameFor: { cdata: "__defineGetter__" } });
    }).toThrowError("SECURITY: '__defineGetter__' is a reserved JavaScript keyword and cannot be used as nameFor.cdata");
  });

  it("should reject a dangerous name as nameFor.comment", function () {
    expect(() => {
      new XMLParser({ nameFor: { comment: "__defineSetter__" } });
    }).toThrowError("SECURITY: '__defineSetter__' is a reserved JavaScript keyword and cannot be used as nameFor.comment");
  });

  it("should reject a critical name as attributes.prefix", function () {
    expect(() => {
      new XMLParser({ attributes: { prefix: "constructor" } });
    }).toThrowError("SECURITY: 'constructor' is a reserved JavaScript keyword and cannot be used as attributes.prefix");
  });

  it("should reject a critical name as attributes.groupBy", function () {
    expect(() => {
      new XMLParser({ attributes: { groupBy: "prototype" } });
    }).toThrowError("SECURITY: 'prototype' is a reserved JavaScript keyword and cannot be used as attributes.groupBy");
  });

  // ─── STRICT RESERVED NAMES ──────────────────────────────────────────────────
  // When strictReservedNames: true, a tag/attribute name that collides with
  // a nameFor.* value must throw, even when it wouldn't normally be dangerous.

  it("should throw when strictReservedNames is true and a tag name matches nameFor.text", function () {
    expect(() => {
      const parser = new XMLParser({
        strictReservedNames: true,
        nameFor: { text: "abc" },
      });
      parser.parse("<abc>normal</abc>");
    }).toThrowError(/Restricted tag name: abc/);
  });

  it("should throw when strictReservedNames is true and a tag name matches nameFor.cdata", function () {
    expect(() => {
      const parser = new XMLParser({
        strictReservedNames: true,
        nameFor: { cdata: "mydata" },
      });
      parser.parse("<mydata><![CDATA[content]]></mydata>");
    }).toThrowError(/Restricted tag name: mydata/);
  });

  it("should throw when strictReservedNames is true and a tag name matches nameFor.comment", function () {
    expect(() => {
      const parser = new XMLParser({
        strictReservedNames: true,
        nameFor: { comment: "note" },
      });
      parser.parse("<note>text</note>");
    }).toThrowError(/Restricted tag name: note/);
  });

  it("should throw when strictReservedNames is true and an attribute name matches attributes.groupBy", function () {
    expect(() => {
      const parser = new XMLParser({
        strictReservedNames: true,
        attributes: { groupBy: "meta", prefix: "" },
        skip: { attributes: false },
      });
      parser.parse(`<root meta="value"></root>`);
    }).toThrowError(/Restricted attribute name: meta/);
  });

  // ─── sanitizeNames: false ────────────────────────────────────────────────
  // Fully disables the dangerous-name/prototype-pollution check for trusted
  // input. Must not touch strictReservedNames, a separate concern.

  it("should let a dangerous tag name through unprefixed when sanitizeNames is false", function () {
    const parser = new XMLParser({ sanitizeNames: false });
    const result = parser.parse("<hasOwnProperty>value</hasOwnProperty>");
    expect(Object.prototype.hasOwnProperty.call(result, "hasOwnProperty")).toBe(true);
    expect(result["hasOwnProperty"]).toBe("value");
  });

  it("should let a dangerous attribute name through unprefixed when sanitizeNames is false", function () {
    const parser = new XMLParser({
      sanitizeNames: false,
      attributes: { prefix: "" },
      skip: { attributes: false },
    });
    const result = parser.parse(`<root hasOwnProperty="value"></root>`);
    expect(result.root["hasOwnProperty"]).toBe("value");
  });

  it("should still throw on a critical name even when sanitizeNames is false (not skippable)", function () {
    const parser = new XMLParser({ sanitizeNames: false });
    expect(() => parser.parse("<__proto__>value</__proto__>")).toThrowError(
      /is a reserved JavaScript keyword that could cause prototype pollution/
    );
  });

  it("should still enforce strictReservedNames when sanitizeNames is false", function () {
    const parser = new XMLParser({
      sanitizeNames: false,
      strictReservedNames: true,
      nameFor: { text: "abc" },
    });
    expect(() => parser.parse("<abc>normal</abc>")).toThrowError(/Restricted tag name: abc/);
  });

  // ─── name cache correctness ──────────────────────────────────────────────
  // A cache must never change *what* is thrown/returned — only skip repeat
  // work. These guard against "only sanitized/validated on first sight".

  it("should sanitize a dangerous tag name identically on every repeated occurrence", function () {
    const parser = new XMLParser();
    const result = parser.parse(
      "<root><toString>a</toString><toString>b</toString><toString>c</toString></root>"
    );
    expect(result.root.__toString).toEqual(["a", "b", "c"]);
  });

  it("should keep throwing on a critical tag name across repeated parse() calls, not just the first", function () {
    const parser = new XMLParser();
    expect(() => parser.parse("<constructor>x</constructor>")).toThrowError(/prototype pollution/);
    expect(() => parser.parse("<constructor>y</constructor>")).toThrowError(/prototype pollution/);
    expect(() => parser.parse("<constructor>z</constructor>")).toThrowError(/prototype pollution/);
  });

  it("should keep throwing on a strictReservedNames collision across repeated parse() calls", function () {
    const parser = new XMLParser({ strictReservedNames: true, nameFor: { text: "abc" } });
    expect(() => parser.parse("<abc>1</abc>")).toThrowError(/Restricted tag name: abc/);
    expect(() => parser.parse("<abc>2</abc>")).toThrowError(/Restricted tag name: abc/);
  });

  it("should reuse the same name cache across repeated parse() calls on one XMLParser instance", function () {
    // Not observable behavior per se, but pins down the documented design:
    // options._nameCache is created once and shared by every Xml2JsParser
    // this XMLParser instance spawns.
    const parser = new XMLParser();
    parser.parse("<root><a>1</a></root>");
    const cacheAfterFirst = parser.options._nameCache;
    expect(cacheAfterFirst).toBeDefined();
    parser.parse("<root><a>2</a></root>");
    expect(parser.options._nameCache).toBe(cacheAfterFirst);
    expect(cacheAfterFirst.tags.has("root")).toBe(true);
    expect(cacheAfterFirst.tags.has("a")).toBe(true);
  });

  it("should give two separate XMLParser instances two separate name caches", function () {
    const parserA = new XMLParser();
    const parserB = new XMLParser();
    expect(parserA.options._nameCache).not.toBe(parserB.options._nameCache);
  });

});


// NOTE: Entity expansion limit tests (maxEntityCount, maxEntitySize, maxTotalExpansions,
// maxExpandedLength, Billion Laughs mitigation, per-parse isolation) are covered
// comprehensively in doctype_spec.js. They are not duplicated here.
