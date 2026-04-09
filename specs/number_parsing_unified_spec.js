import XMLParser from "../src/XMLParser.js";
import { CompactBuilderFactory } from "@nodable/compact-builder"
import { numberParser } from "@nodable/base-output-builder";
import { runAcrossAllInputSources, createInputSource, describeAcrossAllInputSources } from "./helpers/testRunner.js";

// Helper: build a parser with a custom numberParser configuration.
const makeParser = (numOpts = {}, parserOpts = {}) => {
  const builder = new CompactBuilderFactory();
  builder.registerValueParser("number", new numberParser(numOpts));
  return new XMLParser({ ...parserOpts, OutputBuilder: builder });
};

describe("Number Parsing - Unified Tests Across All Input Sources", function () {

  // Basic integer parsing — default number parser handles these
  runAcrossAllInputSources(
    "should parse positive integers",
    "<root><num>123</num></root>",
    (result) => {
      expect(result.root.num).toBe(123);
      expect(typeof result.root.num).toBe('number');
    }
  );

  runAcrossAllInputSources(
    "should parse negative integers",
    "<root><num>-456</num></root>",
    (result) => {
      expect(result.root.num).toBe(-456);
    }
  );

  // Floating point numbers
  runAcrossAllInputSources(
    "should parse floating point numbers",
    "<root><num>123.456</num></root>",
    (result) => {
      expect(result.root.num).toBe(123.456);
    }
  );

  runAcrossAllInputSources(
    "should parse numbers with leading decimal",
    "<root><num>0.789</num></root>",
    (result) => {
      expect(result.root.num).toBe(0.789);
    }
  );

  // Hexadecimal numbers
  ["string", "buffer", "feedable"].forEach((inputType) => {
    it(`should parse hexadecimal numbers when enabled [${inputType}]`, function () {
      const parser = makeParser({ hex: true });
      const result = createInputSource("<root><num>0xFF</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe(255);
    });

    it(`should not parse hexadecimal when disabled [${inputType}]`, function () {
      const parser = makeParser({ hex: false });
      const result = createInputSource("<root><num>0xFF</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe("0xFF");
      expect(typeof result.root.num).toBe('string');
    });
  });

  // Leading zeros
  ["string", "buffer", "feedable"].forEach((inputType) => {
    it(`should parse numbers with leading zeros when enabled [${inputType}]`, function () {
      const parser = makeParser({ leadingZeros: true });
      const result = createInputSource("<root><num>007</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe(7);
    });

    it(`should reject leading zeros when disabled [${inputType}]`, function () {
      const parser = makeParser({ leadingZeros: false });
      const result = createInputSource("<root><num>007</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe("007");
      expect(typeof result.root.num).toBe('string');
    });
  });

  // E-notation
  ["string", "buffer", "feedable"].forEach((inputType) => {
    it(`should parse e-notation when enabled [${inputType}]`, function () {
      const parser = makeParser({ eNotation: true });
      const result = createInputSource("<root><num>1.5e3</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe(1500);
    });

    it(`should not parse e-notation when disabled [${inputType}]`, function () {
      const parser = makeParser({ eNotation: false });
      const result = createInputSource("<root><num>1.5e3</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe("1.5e3");
    });
  });

  // Infinity handling
  ["string", "buffer", "feedable"].forEach((inputType) => {
    it(`should handle infinity with 'original' option (default) [${inputType}]`, function () {
      const parser = makeParser({ infinity: "original" });
      const result = createInputSource("<root><num>1e1000</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe("1e1000");
      expect(typeof result.root.num).toBe('string');
    });

    it(`should handle infinity with 'infinity' option [${inputType}]`, function () {
      const parser = makeParser({ infinity: "infinity" });
      const result = createInputSource("<root><num>1e1000</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe(Infinity);
    });

    it(`should handle infinity with 'string' option [${inputType}]`, function () {
      const parser = makeParser({ infinity: "string" });
      const result = createInputSource("<root><num>1e1000</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe("Infinity");
      expect(typeof result.root.num).toBe('string');
    });

    it(`should handle infinity with 'null' option [${inputType}]`, function () {
      const parser = makeParser({ infinity: "null" });
      const result = createInputSource("<root><num>1e1000</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe(null);
    });
  });

  // Edge cases — default parser handles these
  runAcrossAllInputSources(
    "should parse zero",
    "<root><num>0</num></root>",
    (result) => {
      expect(result.root.num).toBe(0);
    }
  );

  runAcrossAllInputSources(
    "should not parse non-numeric strings",
    "<root><num>abc</num></root>",
    (result) => {
      expect(result.root.num).toBe("abc");
      expect(typeof result.root.num).toBe('string');
    }
  );

  runAcrossAllInputSources(
    "should handle mixed alphanumeric",
    "<root><num>123abc</num></root>",
    (result) => {
      expect(result.root.num).toBe("123abc");
      expect(typeof result.root.num).toBe('string');
    }
  );

  // Multiple numbers in same document
  ["string", "buffer", "feedable"].forEach((inputType) => {
    it(`should parse multiple numbers correctly [${inputType}]`, function () {
      const parser = makeParser({ hex: true });
      const result = createInputSource(
        "<root><a>123</a><b>456.789</b><c>0xFF</c></root>",
        inputType
      ).parse(parser);
      expect(result.root.a).toBe(123);
      expect(result.root.b).toBe(456.789);
      expect(result.root.c).toBe(255);
    });
  });

});

// Example of using describeAcrossAllInputSources
describeAcrossAllInputSources("Advanced Number Parsing Scenarios", function (parse, inputType) {

  it("should handle complex XML with multiple number formats", function () {
    const xml = `
      <data>
        <int>42</int>
        <float>3.14159</float>
        <hex>0xDEADBEEF</hex>
        <scientific>6.022e23</scientific>
        <negative>-273.15</negative>
      </data>
    `;

    // describeAcrossAllInputSources uses XMLParser directly via parse(), so we
    // can't inject a custom builder. Create a parser manually for this test.
    const builder = new CompactBuilderFactory();
    builder.registerValueParser("number", new numberParser({ hex: true }));
    const parser = new XMLParser({ OutputBuilder: builder });
    const result = createInputSource(xml, inputType).parse(parser);

    expect(result.data.int).toBe(42);
    expect(result.data.float).toBeCloseTo(3.14159, 5);
    expect(result.data.hex).toBe(3735928559);
    expect(result.data.scientific).toBe(6.022e23);
    expect(result.data.negative).toBe(-273.15);
  });

  it("should preserve strings that look like numbers when tags.valueParsers is empty", function () {
    const xml = "<root><num>123</num></root>";
    const result = parse(xml, { tags: { valueParsers: [] } });
    expect(result.root.num).toBe("123");
    expect(typeof result.root.num).toBe('string');
  });

  it(`should work consistently for ${inputType} input type`, function () {
    expect(inputType).toMatch(/^(string|buffer|feedable)$/);
  });

});

describe("Security - Infinity Handling", function () {

  // Default parser uses 'original' — Infinity stays as string
  runAcrossAllInputSources(
    "should prevent DoS from infinite values (default: original)",
    "<root><num>1e1000</num></root>",
    (result) => {
      expect(result.root.num).toBe("1e1000");
      expect(typeof result.root.num).toBe('string');
      expect(Number.isFinite(result.root.num)).toBe(false);
    }
  );

  runAcrossAllInputSources(
    "should handle negative infinity safely",
    "<root><num>-1e1000</num></root>",
    (result) => {
      expect(result.root.num).toBe("-1e1000");
      expect(typeof result.root.num).toBe('string');
    }
  );

  ["string", "buffer", "feedable"].forEach((inputType) => {
    it(`should allow explicit infinity conversion when opted in [${inputType}]`, function () {
      const parser = makeParser({ infinity: "infinity" });
      const result = createInputSource("<root><num>1e1000</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe(Infinity);
    });

    it(`should convert infinity to null when configured [${inputType}]`, function () {
      const parser = makeParser({ infinity: "null" });
      const result = createInputSource("<root><num>1e1000</num></root>", inputType).parse(parser);
      expect(result.root.num).toBe(null);
    });
  });

});