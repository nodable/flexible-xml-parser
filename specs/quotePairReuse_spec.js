'use strict';
import XMLParser from '../src/XMLParser.js';
import { runAcrossAllInputSources } from './helpers/testRunner.js';

// Regression coverage for the tag-end scanner sharing quote positions with
// AttributeProcessor.parseAttributes() instead of re-scanning for quotes.
// See SAVEPOINT_quote_reuse.md for the design this implements.

describe('quote-pair reuse in attribute parsing', function () {
  runAcrossAllInputSources(
    'mixed single/double quotes, including a quote nested inside the other type',
    `<root a="double" b='single' c="it's a value" d='she said "hi"'/>`,
    (result) => {
      expect(result.root['@_a']).toBe('double');
      expect(result.root['@_b']).toBe('single');
      expect(result.root['@_c']).toBe("it's a value");
      expect(result.root['@_d']).toBe('she said "hi"');
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    'boolean attributes interleaved with quoted ones stay in sync',
    `<root x disabled y="val1" checked z='val2' readonly/>`,
    (result) => {
      expect(result.root['@_x']).toBe(true);
      expect(result.root['@_disabled']).toBe(true);
      expect(result.root['@_y']).toBe('val1');
      expect(result.root['@_checked']).toBe(true);
      expect(result.root['@_z']).toBe('val2');
      expect(result.root['@_readonly']).toBe(true);
    },
    { skip: { attributes: false }, attributes: { booleanType: true } }
  );

  runAcrossAllInputSources(
    'newline/CR inside a quoted value is still normalized to a space',
    `<root a="line1\nline2\rline3"/>`,
    (result) => {
      expect(result.root['@_a']).toBe('line1 line2 line3');
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    'skip.attributes: true drops attributes without building quote pairs (functional check)',
    `<root a="1" b='2'>text</root>`,
    (result) => {
      expect(result.root).toBe('text');
    },
    { skip: { attributes: true } }
  );

  runAcrossAllInputSources(
    'multi-byte UTF-8 content before and inside a quoted attribute value',
    `<root café="1" note="caf\u00e9 \u2603 done"/>`,
    (result) => {
      expect(result.root['@_café']).toBe(1);
      expect(result.root['@_note']).toBe('café ☃ done');
    },
    { skip: { attributes: false } }
  );

  runAcrossAllInputSources(
    'many attributes on one tag keep name/value pairing correct',
    `<root a1="v1" a2='v2' a3="v3" a4='v4' a5="v5" a6='v6' a7="v7" a8='v8'/>`,
    (result) => {
      for (let i = 1; i <= 8; i++) {
        expect(result.root[`@_a${i}`]).toBe(`v${i}`);
      }
    },
    { skip: { attributes: false } }
  );

  it('latin1-encoded buffer input (fixed-width byte scan) reuses quote pairs correctly', function () {
    const xml = `<root a="hello" b='world'/>`;
    const parser = new XMLParser({
      skip: { attributes: false },
      decoding: { encoding: 'latin1' },
    });
    const result = parser.parse(Buffer.from(xml, 'latin1'));
    expect(result.root['@_a']).toBe('hello');
    expect(result.root['@_b']).toBe('world');
  });

  it('a value split exactly at the closing quote across feed() chunks still parses correctly', function () {
    const xml = `<root a="hello world" b="second"/>`;
    const parser = new XMLParser({ skip: { attributes: false } });
    // Split right after the opening quote of `a`, and again mid-value, to
    // force UNEXPECTED_END + rewind while quote pairs were being collected.
    const splitAt = xml.indexOf('"hello') + 4;
    parser.feed(xml.slice(0, splitAt));
    parser.feed(xml.slice(splitAt));
    const result = parser.end();
    expect(result.root['@_a']).toBe('hello world');
    expect(result.root['@_b']).toBe('second');
  });
});
