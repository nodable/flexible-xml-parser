import { runAcrossAllInputSources } from './helpers/testRunner.js';
import XMLParser from '../src/XMLParser.js';

describe("Test Runner Check", function () {
  runAcrossAllInputSources(
    "should work",
    "<root>test</root>",
    (result) => {
      expect(result.root).toBe("test");
    }
  );
});