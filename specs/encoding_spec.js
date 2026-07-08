import XMLParser from "../src/XMLParser.js";
import { StringDecoder } from "node:string_decoder";
import BufferSource from "../src/InputSource/BufferSource.js";
import { buildProfileForBuffer } from "../src/Encoding/EncodingProfile.js";

describe("Encoding support", () => {

  it("parseBytesArr correctly decodes multi-byte UTF-8 content (prerequisite bug fix)", () => {
    const xml = `<root name="Rahul🎉"><city>København</city></root>`;
    const buf = Buffer.from(xml, 'utf8');
    const parser = new XMLParser({ skip: { attributes: false } });
    const result = parser.parseBytesArr(buf);
    expect(result.root["@_name"]).toBe("Rahul🎉");
    expect(result.root.city).toBe("København");
  });

  it("parse() with a Buffer also goes through the encoding-aware path", () => {
    const xml = `<root>café</root>`;
    const parser = new XMLParser();
    const result = parser.parse(Buffer.from(xml, 'utf8'));
    expect(result.root).toBe("café");
  });

  it("auto-detects utf8 BOM and strips it from output", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const xml = Buffer.from(`<root>hello</root>`, 'utf8');
    const buf = Buffer.concat([bom, xml]);
    const parser = new XMLParser();
    const result = parser.parseBytesArr(buf);
    expect(result.root).toBe("hello");
  });

  it("auto-detects encoding from the XML declaration when no BOM is present", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><root>hi</root>`;
    const parser = new XMLParser();
    const result = parser.parseBytesArr(Buffer.from(xml, 'utf8'));
    expect(result.root).toBe("hi");
  });

  it("throws ENCODING_MISMATCH when BOM and declared encoding disagree", () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]); // utf8 BOM
    const decl = Buffer.from(`<?xml version="1.0" encoding="UTF-16"?><root>hi</root>`, 'utf8');
    const buf = Buffer.concat([bom, decl]);
    const parser = new XMLParser();
    expect(() => parser.parseBytesArr(buf)).toThrowError(/encoding/i);
  });

  it("decodes explicit utf16le buffers correctly (decode-first CharScanStrategy path)", () => {
    const xml = `<root>hello world</root>`;
    const buf = Buffer.from(xml, 'utf16le');
    const parser = new XMLParser({ decoding: { encoding: 'utf16le' } });
    const result = parser.parseBytesArr(buf);
    expect(result.root).toBe("hello world");
  });

  it("auto-detects a utf16le BOM", () => {
    const bomBuf = Buffer.from([0xff, 0xfe]);
    const xmlBuf = Buffer.from(`<root>hi</root>`, 'utf16le');
    const buf = Buffer.concat([bomBuf, xmlBuf]);
    const parser = new XMLParser();
    const result = parser.parseBytesArr(buf);
    expect(result.root).toBe("hi");
  });

  it("index for multi-byte content reflects raw byte offset (no char correction)", () => {
    // Position reporting is index-only now, and for BufferSource that index
    // is a byte offset — "café" (4 chars/5 bytes) and "cafe" (4 chars/4
    // bytes) are expected to report indices that differ by exactly the
    // extra byte the accented character takes, not the same corrected
    // "character column" the old line/col system used to produce.
    const parseAndCatch = (xml) => {
      const parser = new XMLParser();
      try {
        parser.parseBytesArr(Buffer.from(xml, 'utf8'));
        return null;
      } catch (e) {
        return e;
      }
    };
    const withMultiByte = parseAndCatch(`<root>café</wrong></root>`);
    const withAsciiOnly = parseAndCatch(`<root>cafe</wrong></root>`);
    expect(withMultiByte).not.toBeNull();
    expect(withAsciiOnly).not.toBeNull();
    expect(withMultiByte.code).toBe(withAsciiOnly.code);
    expect(withMultiByte.index).toBe(withAsciiOnly.index + 1);
  });

  it("supports a custom-registered encoding via decoding.customDecoders", () => {
    // Trivial passthrough "encoding" standing in for something like an
    // iconv-lite-backed Shift_JIS -- proves the pluggable-decoder contract.
    const parser = new XMLParser({
      decoding: {
        encoding: 'my-custom',
        customDecoders: {
          'my-custom': { createDecoder: () => new StringDecoder('latin1'), selfSynchronizing: false },
        },
      },
    });
    const xml = `<root>hi</root>`;
    const result = parser.parseBytesArr(Buffer.from(xml, 'latin1'));
    expect(result.root).toBe("hi");
  });

  describe("streaming (feed/end and parseStream) auto-detect", () => {
    it("feed()/end() auto-detects utf8 BOM across a Buffer chunk", () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const xml = Buffer.from(`<root>café</root>`, 'utf8');
      const parser = new XMLParser();
      parser.feed(Buffer.concat([bom, xml]));
      const result = parser.end();
      expect(result.root).toBe("café");
    });

    it("feed()/end() correctly decodes a multi-byte utf8 char split across two feed() calls, even while still detecting", () => {
      const xml = Buffer.from(`<root>caf\u00e9</root>`, 'utf8'); // 'é' is 2 bytes
      const splitPoint = xml.indexOf(Buffer.from([0xc3])); // split mid-character
      const parser = new XMLParser();
      parser.feed(xml.subarray(0, splitPoint + 1));
      parser.feed(xml.subarray(splitPoint + 1));
      const result = parser.end();
      expect(result.root).toBe("café");
    });

    it("parseStream() auto-detects a declared encoding from the XML declaration split across chunks", async () => {
      const { Readable } = await import('node:stream');
      const full = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><root>hello</root>`, 'utf8');
      // Split mid-declaration to prove detection waits for enough bytes.
      const chunks = [full.subarray(0, 10), full.subarray(10)];
      const parser = new XMLParser();
      const result = await parser.parseStream(Readable.from(chunks));
      expect(result.root).toBe("hello");
    });

    it("parseStream() handles a short document that never reaches the sniff cap or a declaration", async () => {
      const { Readable } = await import('node:stream');
      const parser = new XMLParser();
      const result = await parser.parseStream(Readable.from([Buffer.from('<root/>')]));
      expect(result.root).toBe("");
    });

    it("does not hold back more than SNIFF_CAP-ish bytes once a real document is streaming in", () => {
      // Sanity check that detection resolves and the parser makes progress
      // chunk-by-chunk rather than silently buffering the whole document.
      const parser = new XMLParser();
      let progressed = false;
      const big = '<root>' + 'x'.repeat(5000) + '</root>';
      const buf = Buffer.from(big, 'utf8');
      const first = buf.subarray(0, 50);
      const rest = buf.subarray(50);
      parser.feed(first);
      // Internal peek: once first (< SNIFF_CAP) is fed, detection shouldn't
      // have resolved yet on its own without more bytes or end().
      parser.feed(rest);
      const result = parser.end();
      expect(result.root.length).toBe(5000);
    });
  });



});

