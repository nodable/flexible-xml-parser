import { Readable } from 'stream';
import XMLParser from '../src/XMLParser.js';
import FeedableSource from '../src/InputSource/FeedableSource.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Split a Buffer into two Buffers at an exact BYTE offset (not a string/char
 * index) so a multi-byte UTF-8 sequence can be deliberately cut mid-character
 * — this is the scenario Buffer#toString() gets wrong per chunk.
 */
function splitBufferAtByte(buf, byteOffset) {
  return [buf.subarray(0, byteOffset), buf.subarray(byteOffset)];
}

function makeBufferStream(chunks) {
  return new Readable({
    read() {
      const chunk = chunks.shift();
      if (chunk === undefined) this.push(null);
      else this.push(chunk);
    }
  });
}

// 'é' = 0xC3 0xA9 (2 bytes), '中' = 0xE4 0xB8 0xAD (3 bytes),
// '😀' = 0xF0 0x9F 0x98 0x80 (4 bytes, surrogate pair in UTF-16)
const TWO_BYTE = 'café';       // é is 2-byte
const THREE_BYTE = '中文测试';   // each char is 3-byte
const FOUR_BYTE = 'hi😀bye';    // 😀 is 4-byte (astral)

describe('multi-byte UTF-8 across chunk boundaries', () => {

  describe('FeedableSource.feed() — direct', () => {
    it('reassembles a 2-byte character split 1 byte / 1 byte', () => {
      const buf = Buffer.from(`<a>${TWO_BYTE}</a>`, 'utf8');
      // find the byte offset that lands inside the 2-byte é
      const idx = buf.indexOf(Buffer.from('é', 'utf8'));
      const [c1, c2] = splitBufferAtByte(buf, idx + 1); // split mid-character

      const source = new FeedableSource();
      source.feed(c1);
      source.feed(c2);
      source.end();
      expect(source.buffer).toBe(`<a>${TWO_BYTE}</a>`);
    });

    it('reassembles a 3-byte character split at every possible byte offset', () => {
      const full = `<a>${THREE_BYTE}</a>`;
      const buf = Buffer.from(full, 'utf8');
      const charStart = buf.indexOf(Buffer.from('中', 'utf8'));

      for (let cut = charStart + 1; cut <= charStart + 2; cut++) {
        const [c1, c2] = splitBufferAtByte(buf, cut);
        const source = new FeedableSource();
        source.feed(c1);
        source.feed(c2);
        source.end();
        expect(source.buffer).toBe(full);
      }
    });

    it('reassembles a 4-byte (astral) character split across chunks', () => {
      const full = `<a>${FOUR_BYTE}</a>`;
      const buf = Buffer.from(full, 'utf8');
      const charStart = buf.indexOf(Buffer.from('😀', 'utf8'));

      for (let cut = charStart + 1; cut <= charStart + 3; cut++) {
        const [c1, c2] = splitBufferAtByte(buf, cut);
        const source = new FeedableSource();
        source.feed(c1);
        source.feed(c2);
        source.end();
        expect(source.buffer).toBe(full);
      }
    });

    it('splits across three feed() calls, not just two', () => {
      const full = `<a>${THREE_BYTE}</a>`;
      const buf = Buffer.from(full, 'utf8');
      const charStart = buf.indexOf(Buffer.from('文', 'utf8'));

      const source = new FeedableSource();
      source.feed(buf.subarray(0, charStart + 1));      // ends mid-char
      source.feed(buf.subarray(charStart + 1, charStart + 2)); // still mid-char
      source.feed(buf.subarray(charStart + 2));          // completes it + rest
      source.end();
      expect(source.buffer).toBe(full);
    });

    it('still accepts plain strings unchanged (no regression)', () => {
      const source = new FeedableSource();
      source.feed('<a>hello</a>');
      source.end();
      expect(source.buffer).toBe('<a>hello</a>');
    });

    it('throws DATA_MUST_BE_STRING for unsupported input', () => {
      const source = new FeedableSource();
      const noToString = Object.create(null); // no .toString at all
      expect(() => source.feed(noToString)).toThrowError(/string or Buffer/);
    });
  });

  describe('XMLParser.feed()/end() API', () => {
    it('parses correctly when a multi-byte char is split across feed() Buffer chunks', () => {
      const full = `<root><val>${THREE_BYTE} ${FOUR_BYTE} ${TWO_BYTE}</val></root>`;
      const buf = Buffer.from(full, 'utf8');
      const parser = new XMLParser();

      // Feed one byte at a time — the worst case, guarantees every
      // multi-byte character gets split across chunk boundaries.
      for (let i = 0; i < buf.length; i++) {
        parser.feed(buf.subarray(i, i + 1));
      }
      const result = parser.end();
      expect(result.root.val).toBe(`${THREE_BYTE} ${FOUR_BYTE} ${TWO_BYTE}`);
    });
  });

  describe('XMLParser.parseStream()', () => {
    it('parses correctly when a multi-byte char is split across stream chunk boundaries', async () => {
      const full = `<root><val>${THREE_BYTE} ${FOUR_BYTE} ${TWO_BYTE}</val></root>`;
      const buf = Buffer.from(full, 'utf8');

      // Chop into fixed-size byte chunks; with size=1 this guarantees every
      // multi-byte character is split, exercising the exact reported bug.
      const chunks = [];
      for (let i = 0; i < buf.length; i += 3) {
        chunks.push(buf.subarray(i, i + 3));
      }

      const parser = new XMLParser();
      const result = await parser.parseStream(makeBufferStream(chunks));
      expect(result.root.val).toBe(`${THREE_BYTE} ${FOUR_BYTE} ${TWO_BYTE}`);
    });
  });
});
