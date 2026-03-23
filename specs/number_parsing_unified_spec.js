import XMLParser from "../src/XMLParser.js";
import { runAcrossAllInputSources, createInputSource, describeAcrossAllInputSources } from "./helpers/testRunner.js";

describe("Number Parsing - Unified Tests Across All Input Sources", function () {

  // Basic integer parsing
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
  runAcrossAllInputSources(
    "should parse hexadecimal numbers when enabled",
    "<root><num>0xFF</num></root>",
    (result) => {
      expect(result.root.num).toBe(255);
    },
    { numberParseOptions: { hex: true } }
  );

  runAcrossAllInputSources(
    "should not parse hexadecimal when disabled",
    "<root><num>0xFF</num></root>",
    (result) => {
      expect(result.root.num).toBe("0xFF");
      expect(typeof result.root.num).toBe('string');
    },
    { numberParseOptions: { hex: false } }
  );

  // Leading zeros
  runAcrossAllInputSources(
    "should parse numbers with leading zeros when enabled",
    "<root><num>007</num></root>",
    (result) => {
      expect(result.root.num).toBe(7);
    },
    { numberParseOptions: { leadingZeros: true } }
  );

  runAcrossAllInputSources(
    "should reject leading zeros when disabled",
    "<root><num>007</num></root>",
    (result) => {
      expect(result.root.num).toBe("007");
      expect(typeof result.root.num).toBe('string');
    },
    { numberParseOptions: { leadingZeros: false } }
  );

  // E-notation
  runAcrossAllInputSources(
    "should parse e-notation when enabled",
    "<root><num>1.5e3</num></root>",
    (result) => {
      expect(result.root.num).toBe(1500);
    },
    { numberParseOptions: { eNotation: true } }
  );

  runAcrossAllInputSources(
    "should not parse e-notation when disabled",
    "<root><num>1.5e3</num></root>",
    (result) => {
      expect(result.root.num).toBe("1.5e3");
    },
    { numberParseOptions: { eNotation: false } }
  );

  // Infinity handling (NEW in strnum)
  runAcrossAllInputSources(
    "should handle infinity with 'original' option (default)",
    "<root><num>1e1000</num></root>",
    (result) => {
      expect(result.root.num).toBe("1e1000");
      expect(typeof result.root.num).toBe('string');
    },
    { numberParseOptions: { infinity: "original" } }
  );

  runAcrossAllInputSources(
    "should handle infinity with 'infinity' option",
    "<root><num>1e1000</num></root>",
    (result) => {
      expect(result.root.num).toBe(Infinity);
    },
    { numberParseOptions: { infinity: "infinity" } }
  );

  runAcrossAllInputSources(
    "should handle infinity with 'string' option",
    "<root><num>1e1000</num></root>",
    (result) => {
      expect(result.root.num).toBe("Infinity");
      expect(typeof result.root.num).toBe('string');
    },
    { numberParseOptions: { infinity: "string" } }
  );

  runAcrossAllInputSources(
    "should handle infinity with 'null' option",
    "<root><num>1e1000</num></root>",
    (result) => {
      expect(result.root.num).toBe(null);
    },
    { numberParseOptions: { infinity: "null" } }
  );

  // Edge cases
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
  runAcrossAllInputSources(
    "should parse multiple numbers correctly",
    "<root><a>123</a><b>456.789</b><c>0xFF</c></root>",
    (result) => {
      expect(result.root.a).toBe(123);
      expect(result.root.b).toBe(456.789);
      expect(result.root.c).toBe(255);
    },
    { numberParseOptions: { hex: true } }
  );

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

    const result = parse(xml, { numberParseOptions: { hex: true } });

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
    // Input-type-specific test if needed
    expect(inputType).toMatch(/^(string|buffer|feedable)$/);
  });

});

describe("Security - Infinity Handling", function () {

  runAcrossAllInputSources(
    "should prevent DoS from infinite values (default: original)",
    "<root><num>1e1000</num></root>",
    (result) => {
      // Default should NOT convert to Infinity
      expect(result.root.num).toBe("1e1000");
      expect(typeof result.root.num).toBe('string');
      expect(Number.isFinite(result.root.num)).toBe(false); // It's a string
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

  runAcrossAllInputSources(
    "should allow explicit infinity conversion when opted in",
    "<root><num>1e1000</num></root>",
    (result) => {
      expect(result.root.num).toBe(Infinity);
    },
    { numberParseOptions: { infinity: "infinity" } }
  );

  runAcrossAllInputSources(
    "should convert infinity to null when configured",
    "<root><num>1e1000</num></root>",
    (result) => {
      expect(result.root.num).toBe(null);
    },
    { numberParseOptions: { infinity: "null" } }
  );

});
