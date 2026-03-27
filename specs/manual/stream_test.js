import XMLParser from '../../src/XMLParser.js';

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the file URL of the current module
const __filename = fileURLToPath(import.meta.url);

// Derive the directory name
const __dirname = dirname(__filename);

describe("XMLParser", function () {

  it("should parse when Buffer is given as input", function () {

    const fileNamePath = path.join(__dirname, "assets/mini-sample.xml");

    const expected = {
      "?xml": '',
      "any_name": {
        "person": [
          {
            "phone": [
              122233344550,
              122233344551
            ],
            "name": "Jack",
            "age": 33,
            "emptyNode": "",
            "booleanNode": [
              false,
              true
            ],
            "selfclosing": ""
          },
          {
            "phone": [
              122233344553,
              122233344554
            ],
            "name": "Boris"
          }
        ]
      }
    };
    const parser = new XMLParser();
    const result = parser.parseStream(fs.createReadStream(fileNamePath));
    expect(result).toEqual(expected);
  });

});