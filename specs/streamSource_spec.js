import { Readable } from 'stream';
import XMLParser from '../src/XMLParser.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a Node.js Readable stream from an array of string chunks.
 * Each chunk is pushed in a separate tick so the parser receives them
 * one at a time — identical to how fs.createReadStream delivers data.
 */
function makeStream(chunks) {
  return new Readable({
    read() {
      const chunk = chunks.shift();
      if (chunk === undefined) {
        this.push(null); // EOF
      } else {
        this.push(chunk);
      }
    }
  });
}

/**
 * Split a string into chunks of exactly `size` characters.
 */
function chunkString(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) {
    out.push(str.slice(i, i + size));
  }
  return out;
}

// ─── Basic parseStream behaviour ─────────────────────────────────────────────

describe('parseStream — basic', () => {

  it('resolves with a parsed JS object from a well-formed stream', async () => {
    const xml = '<root><tag>value</tag></root>';
    const result = await new XMLParser().parseStream(makeStream([xml]));
    expect(result.root.tag).toBe('value');
  });

  it('handles multiple chunks that align on tag boundaries', async () => {
    const chunks = ['<root>', '<item>one</item>', '<item>two</item>', '</root>'];
    const result = await new XMLParser().parseStream(makeStream(chunks));
    expect(Array.isArray(result.root.item)).toBe(true);
    expect(result.root.item[0]).toBe('one');
    expect(result.root.item[1]).toBe('two');
  });

  it('handles a single-character-per-chunk stream', async () => {
    const xml = '<root><tag>hello</tag></root>';
    const result = await new XMLParser().parseStream(makeStream(chunkString(xml, 1)));
    expect(result.root.tag).toBe('hello');
  });

  it('handles Buffer chunks', async () => {
    const xml = '<root><val>42</val></root>';
    const stream = Readable.from([Buffer.from(xml)]);
    const result = await new XMLParser().parseStream(stream);
    expect(result.root.val).toBe(42);
  });

  it('returns a Promise', () => {
    const xml = '<root/>';
    const result = new XMLParser().parseStream(makeStream([xml]));
    expect(result instanceof Promise).toBe(true);
    return result;
  });

  it('throws synchronously for non-stream input', () => {
    expect(() => new XMLParser().parseStream('not a stream')).toThrow();
    expect(() => new XMLParser().parseStream(null)).toThrow();
    expect(() => new XMLParser().parseStream({})).toThrow();
  });

});

// ─── Chunk-boundary stress tests ─────────────────────────────────────────────

describe('parseStream — chunk boundaries', () => {

  it('handles a chunk boundary mid tag-name', async () => {
    // '<ro' ... 'ot><child>x</child></root>'
    const xml = '<root><child>x</child></root>';
    const result = await new XMLParser().parseStream(makeStream(chunkString(xml, 3)));
    expect(result.root.child).toBe('x');
  });

  it('handles a chunk boundary inside an attribute value', async () => {
    const xml = '<root id="hello world"><tag>v</tag></root>';
    const result = await new XMLParser({ skip: { attributes: false } })
      .parseStream(makeStream(chunkString(xml, 7)));
    expect(result.root.tag).toBe('v');
  });

  it('handles a chunk boundary inside a text node', async () => {
    // text 'hello world' split across chunks
    const xml = '<root>hello world</root>';
    const result = await new XMLParser().parseStream(makeStream(chunkString(xml, 4)));
    expect(result.root).toBe('hello world');
  });

  it('handles a chunk boundary inside CDATA', async () => {
    const xml = '<root><![CDATA[hel]]><![CDATA[lo]]></root>';
    const result = await new XMLParser().parseStream(makeStream(chunkString(xml, 5)));
    expect(result.root).toBe('hello');
  });

  it('handles a chunk boundary inside a comment', async () => {
    const xml = '<root><!--this is a comment-->val</root>';
    const result = await new XMLParser({ nameFor: { comment: '#comment' } })
      .parseStream(makeStream(chunkString(xml, 6)));
    expect(result.root['#text']).toBe('val');
  });

  it('handles a chunk boundary inside a closing tag', async () => {
    const xml = '<root><item>1</item></root>';
    // chunks chosen so '</roo' and 't>' fall in separate chunks
    const result = await new XMLParser().parseStream(makeStream(chunkString(xml, 13)));
    expect(result.root.item).toBe(1);
  });

  it('handles 2-byte chunks across a deeply nested document', async () => {
    const xml = '<a><b><c><d>deep</d></c></b></a>';
    const result = await new XMLParser().parseStream(makeStream(chunkString(xml, 2)));
    expect(result.a.b.c.d).toBe('deep');
  });

});

// ─── Parser options forwarded correctly ──────────────────────────────────────

describe('parseStream — parser options', () => {

  it('applies number parsing', async () => {
    const xml = '<root><n>42</n><f>3.14</f></root>';
    const result = await new XMLParser().parseStream(makeStream([xml]));
    expect(result.root.n).toBe(42);
    expect(result.root.f).toBeCloseTo(3.14);
  });

  it('applies boolean parsing', async () => {
    const xml = '<root><a>true</a><b>false</b></root>';
    const result = await new XMLParser().parseStream(makeStream([xml]));
    expect(result.root.a).toBe(true);
    expect(result.root.b).toBe(false);
  });

  it('respects skip.declaration', async () => {
    const xml = '<?xml version="1.0"?><root><v>1</v></root>';
    const r1 = await new XMLParser({ skip: { declaration: false } }).parseStream(makeStream([xml]));
    const r2 = await new XMLParser({ skip: { declaration: true } }).parseStream(makeStream([xml]));
    expect(r1['?xml']).toBeDefined();
    expect(r2['?xml']).toBeUndefined();
  });

  it('respects skip.attributes = false', async () => {
    const xml = '<root id="123"><tag>v</tag></root>';
    const result = await new XMLParser({ skip: { attributes: false } })
      .parseStream(makeStream([xml]));
    expect(result.root['@_id']).toBe(123);
  });

  it('respects stopNodes', async () => {
    const xml = '<root><raw><b>bold</b></raw></root>';
    const result = await new XMLParser({ tags: { stopNodes: ['*.raw'] } })
      .parseStream(makeStream([xml]));
    expect(result.root.raw).toBe('<b>bold</b>');
  });

  it('uses a custom OutputBuilder', async () => {
    // Simple builder that just counts tags
    const counts = {};
    const CustomBuilder = {
      getInstance() {
        return {
          registeredValParsers: {},
          addElement(tag) { counts[tag.name] = (counts[tag.name] || 0) + 1; },
          closeElement() { },
          addValue() { },
          addAttribute() { },
          addComment() { },
          addLiteral() { },
          addDeclaration() { },
          addInstruction() { },
          addDocType() { },
          getOutput() { return counts; },
        };
      },
      registerValueParser() { },
    };

    const xml = '<root><item/><item/><item/></root>';
    const result = await new XMLParser({ OutputBuilder: CustomBuilder })
      .parseStream(makeStream([xml]));
    expect(result.item).toBe(3);
  });

});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('parseStream — error handling', () => {

  it('rejects on malformed XML', async () => {
    const xml = '<root><unclosed>';
    await expectAsync(
      new XMLParser().parseStream(makeStream([xml]))
    ).toBeRejected();
  });

  it('rejects when the stream emits an error event', async () => {
    const stream = new Readable({ read() { } });
    const promise = new XMLParser().parseStream(stream);
    stream.emit('error', new Error('disk read failure'));
    await expectAsync(promise).toBeRejectedWithError('disk read failure');
  });

  it('rejects when feedable.maxBufferSize is exceeded', async () => {
    const xml = '<root>' + 'x'.repeat(200) + '</root>';
    const stream = makeStream([xml]);
    await expectAsync(
      new XMLParser({ feedable: { maxBufferSize: 100 } }).parseStream(stream)
    ).toBeRejected();
  });

  it('does not reject valid XML just because chunks arrive slowly', async () => {
    // Simulate slow stream with setTimeout between pushes
    const xml = '<root><tag>ok</tag></root>';
    const stream = new Readable({ read() { } });
    const promise = new XMLParser().parseStream(stream);

    await new Promise(r => setTimeout(r, 10));
    stream.push(xml.slice(0, 10));
    await new Promise(r => setTimeout(r, 10));
    stream.push(xml.slice(10));
    await new Promise(r => setTimeout(r, 5));
    stream.push(null);

    const result = await promise;
    expect(result.root.tag).toBe('ok');
  });

});

// ─── feed()/end() regression — unchanged behaviour ───────────────────────────

describe('feed()/end() — regression', () => {

  it('works with whole-document feed', () => {
    const parser = new XMLParser();
    parser.feed('<root><tag>value</tag></root>');
    expect(parser.end().root.tag).toBe('value');
  });

  it('accumulates multiple chunks before parsing', () => {
    const parser = new XMLParser();
    parser.feed('<root>');
    parser.feed('<item>a</item>');
    parser.feed('<item>b</item>');
    parser.feed('</root>');
    const result = parser.end();
    expect(result.root.item).toEqual(['a', 'b']);
  });

  it('handles chunk boundary mid tag-name', () => {
    const parser = new XMLParser({ skip: { declaration: true } });
    parser.feed('<ro');
    parser.feed('ot/>');
    expect(parser.end().root).toBe('');
  });

  it('handles chunk boundary in CDATA', () => {
    const parser = new XMLParser({ skip: { declaration: true } });
    parser.feed('<root><![CDATA[hel');
    parser.feed('lo]]></root>');
    expect(parser.end().root).toBe('hello');
  });

  it('is chainable', () => {
    const parser = new XMLParser();
    const result = parser.feed('<r>').feed('<v>1</v>').feed('</r>').end();
    expect(result.r.v).toBe(1);
  });

  it('throws NOT_STREAMING when end() called without feed()', () => {
    expect(() => new XMLParser().end()).toThrow();
  });

  it('reads feedable options from parser config', () => {
    // maxBufferSize of 20 chars — a single large feed should throw
    const parser = new XMLParser({ feedable: { maxBufferSize: 20 } });
    expect(() => parser.feed('<root>' + 'x'.repeat(50) + '</root>')).toThrow();
  });

  it('allows a fresh feed/end session after end()', () => {
    const parser = new XMLParser();
    parser.feed('<a>1</a>');
    expect(parser.end().a).toBe(1);
    // Second session on the same parser instance
    parser.feed('<b>2</b>');
    expect(parser.end().b).toBe(2);
  });

});

// ─── feedable option group ────────────────────────────────────────────────────

describe('feedable options', () => {

  it('defaults apply when feedable is not specified', () => {
    // Should not throw — default maxBufferSize is 10 MB
    const parser = new XMLParser();
    const xml = '<root>' + 'x'.repeat(1000) + '</root>';
    parser.feed(xml);
    const result = parser.end();
    expect(typeof result.root).toBe('string');
  });

  it('feedable.maxBufferSize limits buffer growth', () => {
    const parser = new XMLParser({ feedable: { maxBufferSize: 50 } });
    expect(() => parser.feed('x'.repeat(100))).toThrow();
  });

  it('feedable.autoFlush: false keeps processed data in buffer (no error)', () => {
    // With autoFlush off, processed data stays but no error should be thrown
    // for a normal-sized document
    const parser = new XMLParser({ feedable: { autoFlush: false } });
    const xml = '<root><v>ok</v></root>';
    parser.feed(xml);
    expect(parser.end().root.v).toBe('ok');
  });

  it('feedable options are forwarded to parseStream', async () => {
    const xml = '<root>' + 'a'.repeat(200) + '</root>';
    await expectAsync(
      new XMLParser({ feedable: { maxBufferSize: 50 } })
        .parseStream(makeStream([xml]))
    ).toBeRejected();
  });

});

// ─── parseStream vs feed/end equivalence ─────────────────────────────────────

describe('parseStream / feed / parse equivalence', () => {

  const XML = `
    <catalog>
      <book id="1"><title>XML Primer</title><price>29.99</price></book>
      <book id="2"><title>Node Streams</title><price>34.50</price></book>
    </catalog>`.trim();

  it('parseStream and parse produce identical output', async () => {
    const opts = { skip: { attributes: false } };
    const expected = new XMLParser(opts).parse(XML);
    const actual = await new XMLParser(opts).parseStream(makeStream([XML]));
    expect(actual).toEqual(expected);
  });

  it('parseStream and feed/end produce identical output', async () => {
    const opts = { skip: { attributes: false } };

    const feedParser = new XMLParser(opts);
    chunkString(XML, 11).forEach(c => feedParser.feed(c));
    const feedResult = feedParser.end();

    const streamResult = await new XMLParser(opts)
      .parseStream(makeStream(chunkString(XML, 11)));

    expect(streamResult).toEqual(feedResult);
  });

});
