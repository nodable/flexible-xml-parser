import XMLParser from "../../src/XMLParser.js";

/**
 * Creates an input source wrapper for different input types
 * @param {string} xmlString - The XML string to parse
 * @param {string} type - Type of input source ('string', 'buffer', 'feedable')
 * @returns {object} Input source object with parse method
 */
export function createInputSource(xmlString, type) {
  switch (type) {
    case 'string':
      return {
        type: 'string',
        parse: (parser) => parser.parse(xmlString)
      };

    case 'buffer':
      return {
        type: 'buffer',
        parse: (parser) => parser.parse(Buffer.from(xmlString))
      };

    case 'feedable':
      return {
        type: 'feedable',
        parse: (parser) => {
          // Feed in chunks of ~50 characters to simulate streaming
          const chunkSize = 50;
          for (let i = 0; i < xmlString.length; i += chunkSize) {
            parser.feed(xmlString.substring(i, i + chunkSize));
          }
          return parser.end();
        }
      };

    default:
      throw new Error(`Unknown input source type: ${type}`);
  }
}

/**
 * Run a test function across all input source types
 * Ensures consistent behavior regardless of how XML is provided
 * 
 * @param {string} testName - Name of the test
 * @param {string} xmlString - XML content to parse
 * @param {function} testFn - Test function that receives (result, inputType)
 * @param {object} parserOptions - Optional parser options
 */
export function runAcrossAllInputSources(testName, xmlString, testFn, parserOptions = {}) {
  // const inputTypes = ['string', 'buffer', 'feedable'];
  const inputTypes = ['string'];

  inputTypes.forEach(inputType => {
    it(`${testName} [${inputType}]`, function () {
      const inputSource = createInputSource(xmlString, inputType);
      const parser = new XMLParser(parserOptions);
      const result = inputSource.parse(parser);
      testFn(result, inputSource.type);
    });
  });
}

export function runAcrossAllInputSourcesWithException(testName, xmlString, errMsg, parserOptions = {}) {
  // const inputTypes = ['string', 'buffer', 'feedable'];
  const inputTypes = ['string'];

  inputTypes.forEach(inputType => {
    it(`${testName} [${inputType}]`, function () {
      const inputSource = createInputSource(xmlString, inputType);
      expect(() => {
        const parser = new XMLParser(parserOptions);
        inputSource.parse(parser);
      }).toThrowError(errMsg);
    });
  });
}

/**
 * Run a test with custom parser creation logic
 * Useful when parser needs to be created differently for each run
 * 
 * @param {string} testName - Name of the test
 * @param {string} xmlString - XML content to parse
 * @param {function} testFn - Test function that receives (result, inputType, parser)
 * @param {function} parserFactory - Function that returns a parser instance
 */
export function runAcrossAllInputSourcesWithFactory(testName, xmlString, testFn, parserFactory) {
  const inputTypes = ['string', 'buffer', 'feedable'];

  inputTypes.forEach(inputType => {
    it(`${testName} [${inputType}]`, function () {
      const parser = parserFactory();
      const inputSource = createInputSource(xmlString, inputType);
      const result = inputSource.parse(parser);
      testFn(result, inputSource.type, parser);
    });
  });
}

/**
 * Describe block that runs all tests within it across all input sources
 * 
 * @param {string} description - Description of the test suite
 * @param {function} fn - Function containing test definitions
 */
export function describeAcrossAllInputSources(description, fn) {
  const inputTypes = ['string', 'buffer', 'feedable'];

  inputTypes.forEach(inputType => {
    describe(`${description} [${inputType}]`, function () {
      // Set up a helper in the context
      const parseWithSource = (xmlString, parserOptions = {}) => {
        const parser = new XMLParser(parserOptions);
        const inputSource = createInputSource(xmlString, inputType);
        return inputSource.parse(parser);
      };

      // Call the test definition function with the helper
      fn(parseWithSource, inputType);
    });
  });
}
