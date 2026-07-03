import XMLParser from '../src/XMLParser.js';

describe('name-validator xmlVersion cache (getNameValidator premature memoization bug)', function () {

  const oneDotOneOnlyChar = '\u0487'; // Combining Cyrillic Millions Sign: valid NameChar in XML 1.1 only

  it('accepts an XML-1.1-only tag name when the document declares version="1.1"', function () {
    const parser = new XMLParser();
    const xml = `<?xml version="1.1"?><a${oneDotOneOnlyChar}>text</a${oneDotOneOnlyChar}>`;
    const result = parser.parse(xml);
    expect(result[`a${oneDotOneOnlyChar}`]).toBe('text');
  });

  it('still rejects that same name when no declaration (defaults to 1.0) is present', function () {
    const parser = new XMLParser();
    const xml = `<a${oneDotOneOnlyChar}>text</a${oneDotOneOnlyChar}>`;
    expect(() => parser.parse(xml)).toThrow();
  });

  it('still rejects that name when the document explicitly declares version="1.0"', function () {
    const parser = new XMLParser();
    const xml = `<?xml version="1.0"?><a${oneDotOneOnlyChar}>text</a${oneDotOneOnlyChar}>`;
    expect(() => parser.parse(xml)).toThrow();
  });

  it('accepts an XML-1.1-only attribute name when version="1.1" is declared', function () {
    const parser = new XMLParser({ skip: { attributes: false } });
    const xml = `<?xml version="1.1"?><root b${oneDotOneOnlyChar}="v">text</root>`;
    const result = parser.parse(xml);
    expect(result.root[`@_b${oneDotOneOnlyChar}`]).toBe('v');
  });

});
