import XMLParser from '../src/XMLParser.js';
import { runAcrossAllInputSources, runAcrossAllInputSourcesWithException } from './helpers/testRunner.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Default behaviour — still throws (no regression)
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — default behaviour (throw)', function () {

  runAcrossAllInputSourcesWithException(
    'should throw when a tag is not closed at EOF',
    '<root><a><b></b>',
    /Unexpected data in the end of document/
  );

  runAcrossAllInputSourcesWithException(
    'should throw on mismatched closing tag',
    '<root><a></b></root>',
    /Unexpected closing tag/
  );

  it('should throw a proper Error (not ReferenceError) for incomplete closing tag', function () {
    expect(() => new XMLParser().parse('<div></div')).toThrowError(Error);
    expect(() => new XMLParser().parse('<div></div')).not.toThrowError(ReferenceError);
  });

  it('should throw a proper Error for incomplete mismatched closing tag', function () {
    expect(() => new XMLParser().parse('<div></p')).toThrowError(/Unexpected/);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. onEof: 'closeAll'
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — onEof: closeAll', function () {

  const opts = { autoClose: { onEof: 'closeAll' } };

  runAcrossAllInputSources(
    'should close a single unclosed tag at EOF',
    '<root><a></a>',
    (result) => { expect(result.root).toBeDefined(); },
    opts
  );

  runAcrossAllInputSources(
    'should close multiple unclosed tags at EOF',
    '<root><a><b>hello</b>',
    (result) => { expect(result.root.a.b).toBe('hello'); },
    opts
  );

  runAcrossAllInputSources(
    'should handle deeply truncated document',
    '<root><a><b><c><d>text</d>',
    (result) => { expect(result.root.a.b.c.d).toBe('text'); },
    opts
  );

  runAcrossAllInputSources(
    'should handle text inside unclosed tag',
    '<root><a><b>hello',
    (result) => { expect(result.root.a.b).toBe('hello'); },
    opts
  );

  runAcrossAllInputSources(
    'should not affect a fully valid document',
    '<root><a>1</a><b>2</b></root>',
    (result) => {
      expect(result.root.a).toBe(1);
      expect(result.root.b).toBe(2);
    },
    opts
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. onMismatch: 'recover'
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — onMismatch: recover', function () {

  const opts = { autoClose: { onMismatch: 'recover' } };

  runAcrossAllInputSources(
    'should recover when inner tag is not closed before parent closes',
    '<root><outer><inner>text</outer></root>',
    (result) => { expect(result.root.outer.inner).toBe('text'); },
    opts
  );

  runAcrossAllInputSources(
    'should recover when closing tag matches an ancestor not the direct parent',
    '<root><a><b><c>val</c></a></root>',
    (result) => { expect(result.root.a.b.c).toBe('val'); },
    opts
  );

  runAcrossAllInputSources(
    'should not affect a valid document',
    '<root><a><b>x</b></a></root>',
    (result) => { expect(result.root.a.b).toBe('x'); },
    opts
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. onMismatch: 'discard'
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — onMismatch: discard', function () {

  runAcrossAllInputSources(
    'should discard a mismatched closing tag and continue',
    '<root><a>text</a></z><b>more</b></root>',
    (result) => {
      expect(result.root.a).toBe('text');
      expect(result.root.b).toBe('more');
    },
    { autoClose: { onMismatch: 'discard' } }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Phantom close tag
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — phantom close tag', function () {

  it('should discard a phantom closing tag and log it', function () {
    const parser = new XMLParser({ autoClose: { onMismatch: 'recover', collectErrors: true } });
    parser.parse('<root><a>text</a></z></root>');
    const errors = parser.getParseErrors();
    expect(errors.some(e => e.type === 'phantom-close' && e.tag === 'z')).toBe(true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. collectErrors — getParseErrors() API
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — collectErrors / getParseErrors()', function () {

  it('should return errors via getParseErrors() for unclosed-eof', function () {
    const parser = new XMLParser({
      autoClose: { onEof: 'closeAll', collectErrors: true },
    });
    parser.parse('<root><a><b>hi</b>');
    const errors = parser.getParseErrors();
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
    const err = errors[0];
    expect(err.type).toBe('unclosed-eof');
    expect(err.tag).toBe('a');
    expect(typeof err.line).toBe('number');
    expect(typeof err.col).toBe('number');
    expect(typeof err.index).toBe('number');
  });

  it('should return errors via getParseErrors() for mismatched-close', function () {
    const parser = new XMLParser({
      autoClose: { onMismatch: 'recover', collectErrors: true },
    });
    parser.parse('<root><outer><inner>x</outer></root>');
    const errors = parser.getParseErrors();
    const err = errors.find(e => e.type === 'mismatched-close');
    expect(err).toBeDefined();
    expect(err.tag).toBe('inner');
  });

  it('should return empty array when collectErrors is false', function () {
    const parser = new XMLParser({
      autoClose: { onEof: 'closeAll', collectErrors: false },
    });
    parser.parse('<root><a>');
    expect(parser.getParseErrors()).toEqual([]);
  });

  it('should return empty array when document is valid', function () {
    const parser = new XMLParser({
      autoClose: { onEof: 'closeAll', collectErrors: true },
    });
    parser.parse('<root><a>ok</a></root>');
    expect(parser.getParseErrors()).toEqual([]);
  });

  it('should not pollute the result object', function () {
    const parser = new XMLParser({
      autoClose: { onEof: 'closeAll', collectErrors: true },
    });
    const result = parser.parse('<root><a>');
    expect(result.__parseErrors).toBeUndefined();
  });

  it('getParseErrors() returns empty array when autoClose is not configured', function () {
    const parser = new XMLParser();
    parser.parse('<root><a>ok</a></root>');
    expect(parser.getParseErrors()).toEqual([]);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. HTML preset
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — html preset', function () {

  it('should parse HTML fragment with unclosed tags without throwing', function () {
    const parser = new XMLParser({ autoClose: 'html' });
    const result = parser.parse('<html><body><p>Hello<br>World</body></html>');
    expect(result.html.body.p).toBeDefined();
    expect(result.html.body.p.br).toBe('');
  });

  it('should handle text inside unclosed tags', function () {
    const parser = new XMLParser({ autoClose: 'html' });
    const result = parser.parse('<div><p>text');
    expect(result.div.p).toBe('text');
  });

  it('should handle truncated document with no content', function () {
    const parser = new XMLParser({ autoClose: 'html' });
    const result = parser.parse('<div><p>partial');
    expect(result.div.p).toBe('partial');
  });

  it('should include HTML void elements in unpaired list', function () {
    const parser = new XMLParser({ autoClose: 'html', skip: { attributes: false } });
    const result = parser.parse(
      '<html><head><meta charset="UTF-8"><link rel="stylesheet" href="a.css"></head></html>'
    );
    expect(result.html.head.meta['@_charset']).toBe('UTF-8');
    expect(result.html.head.link['@_rel']).toBe('stylesheet');
  });

  it('should collect errors accessible via getParseErrors()', function () {
    const parser = new XMLParser({ autoClose: 'html' });
    parser.parse('<div><p>text');
    expect(parser.getParseErrors().some(e => e.type === 'unclosed-eof')).toBe(true);
  });

  it('should not put __parseErrors on the result', function () {
    const parser = new XMLParser({ autoClose: 'html' });
    const result = parser.parse('<div><p>text');
    expect(result.__parseErrors).toBeUndefined();
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Position tracking
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — position tracking', function () {

  it('should record non-zero index for unclosed tags', function () {
    const parser = new XMLParser({
      autoClose: { onEof: 'closeAll', collectErrors: true },
    });
    parser.parse('<root>\n  <child>text</child>\n  <open>');
    const err = parser.getParseErrors().find(e => e.tag === 'open');
    expect(err).toBeDefined();
    expect(err.index).toBeGreaterThan(0);
  });

  it('should record position for mismatched-close errors', function () {
    const parser = new XMLParser({
      autoClose: { onMismatch: 'recover', collectErrors: true },
    });
    parser.parse('<root><a><b>x</a></root>');
    const err = parser.getParseErrors().find(e => e.type === 'mismatched-close');
    expect(err).toBeDefined();
    expect(err.index).toBeGreaterThan(0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Combined onEof + onMismatch
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — combined onEof + onMismatch', function () {

  it('should handle mismatched tag and unclosed EOF in same document', function () {
    const parser = new XMLParser({
      autoClose: { onEof: 'closeAll', onMismatch: 'recover', collectErrors: true },
    });
    const result = parser.parse('<root><a><b>x</a><c>y</c>');
    expect(result.root.a.b).toBe('x');
    expect(result.root.c).toBe('y');
    const errors = parser.getParseErrors();
    expect(errors.some(e => e.type === 'mismatched-close')).toBe(true);
    expect(errors.some(e => e.type === 'unclosed-eof')).toBe(true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Partial tag — source exhausted mid-token
// ─────────────────────────────────────────────────────────────────────────────
describe('autoClose — partial tag (truncated mid-token)', function () {

  it('should throw by default when opening tag is incomplete', function () {
    expect(() => new XMLParser().parse('<div><p')).toThrow();
  });

  it('should throw a proper Error (not ReferenceError) for incomplete closing tag', function () {
    expect(() => new XMLParser().parse('<div></div')).toThrowError(Error);
    expect(() => new XMLParser().parse('<div></div')).not.toThrowError(ReferenceError);
  });

  it('should throw for </p with no match', function () {
    expect(() => new XMLParser().parse('<div></p')).toThrowError(/Unexpected/);
  });

  it('should recover from truncated opening tag, keeping prior content', function () {
    const parser = new XMLParser({ autoClose: { onEof: 'closeAll', collectErrors: true } });
    const result = parser.parse('<div><p>text</p><span');
    expect(result.div.p).toBe('text');
    expect(result.div.span).toBeUndefined();
    expect(parser.getParseErrors().some(e => e.type === 'partial-tag')).toBe(true);
    expect(parser.getParseErrors().some(e => e.type === 'unclosed-eof')).toBe(true);
  });

  it('should recover from truncated closing tag </div', function () {
    const parser = new XMLParser({ autoClose: { onEof: 'closeAll', collectErrors: true } });
    const result = parser.parse('<div><p>hello</p></div');
    expect(result.div.p).toBe('hello');
    expect(parser.getParseErrors().some(e => e.type === 'partial-tag')).toBe(true);
  });

  it('should recover from truncated mismatched closing tag </p', function () {
    const parser = new XMLParser({
      autoClose: { onEof: 'closeAll', onMismatch: 'recover', collectErrors: true },
    });
    const result = parser.parse('<div></p');
    expect(result.div).toBeDefined();
    expect(parser.getParseErrors().some(e => e.type === 'partial-tag')).toBe(true);
  });

  it('should record the partial name for a truncated closing tag', function () {
    const parser = new XMLParser({ autoClose: { onEof: 'closeAll', collectErrors: true } });
    parser.parse('<root><item>val</item></roo');
    const err = parser.getParseErrors().find(e => e.type === 'partial-tag');
    expect(err).toBeDefined();
    expect(err.tag).toBe('roo');
  });

  it('should record null tag name for a truncated opening tag', function () {
    const parser = new XMLParser({ autoClose: { onEof: 'closeAll', collectErrors: true } });
    parser.parse('<root><ite');
    const err = parser.getParseErrors().find(e => e.type === 'partial-tag');
    expect(err).toBeDefined();
    expect(err.tag).toBeNull();
  });

  it('html preset should recover from truncated opening tag', function () {
    const parser = new XMLParser({ autoClose: 'html' });
    const result = parser.parse('<div><p>text</p><span');
    expect(result.div.p).toBe('text');
    expect(parser.getParseErrors().some(e => e.type === 'partial-tag')).toBe(true);
  });

  it('html preset: <div><p>text — text inside unclosed tags', function () {
    const parser = new XMLParser({ autoClose: 'html' });
    const result = parser.parse('<div><p>text');
    expect(result.div.p).toBe('text');
    expect(Array.isArray(parser.getParseErrors())).toBe(true);
  });

  it('should not put __parseErrors on result even for partial-tag errors', function () {
    const parser = new XMLParser({ autoClose: { onEof: 'closeAll', collectErrors: true } });
    const result = parser.parse('<div><p');
    expect(result.__parseErrors).toBeUndefined();
  });

});