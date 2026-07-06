import { buildProfileForBuffer } from "../src/Encoding/EncodingProfile.js";
import BufferSource from "../src/InputSource/BufferSource.js";
import FeedableSource from "../src/InputSource/FeedableSource.js";
import StringSource from "../src/InputSource/StringSource.js";

describe("BufferSource + EncodingProfile wiring", () => {

  it("readCh and readStr agree on multi-byte UTF-8 at character boundaries", () => {
    const xml = 'café'; // 4 characters, 5 bytes
    const buf = Buffer.from(xml, 'utf8');
    const profile = buildProfileForBuffer(buf, { encoding: 'utf8' });
    // profile is the 3rd constructor argument, not the 2nd ("options").
    // Passing it as the 2nd argument compiles and even passes for utf8,
    // because utf8 is also BufferSource's built-in zero-config default when
    // no profile is given at all — so the mistake is invisible for utf8
    // specifically, and would silently misbehave for any other encoding.
    const source = new BufferSource(buf, {}, profile);

    const chars = [];
    while (source.canRead()) chars.push(source.readCh());
    expect(chars.join('')).toBe('café');

    source.startIndex = 0;
    expect(source.readStr(buf.length)).toBe('café');

    source.startIndex = 0;
    source.readCh(); source.readCh(); source.readCh(); // 'c','a','f'
    const startOfE = source.startIndex;
    expect(source.readCh()).toBe('é');
    expect(source.startIndex).toBe(5);

    source.startIndex = startOfE;
    expect(source.readStr(2)).toBe('é');
  });

  it("demonstrates why the profile's argument position matters for a non-default encoding", () => {
    const buf = Buffer.from('hi', 'utf16le'); // bytes look nothing like utf8 "hi"
    const profile = buildProfileForBuffer(buf, { encoding: 'utf16le' });

    const wrongSlot = new BufferSource(buf, profile); // profile treated as "options"
    let out1 = '';
    while (wrongSlot.canRead()) out1 += wrongSlot.readCh();
    expect(out1).not.toBe('hi'); // silently wrong -- decoded as utf8, not utf16le

    const correctSlot = new BufferSource(buf, {}, profile);
    let out2 = '';
    while (correctSlot.canRead()) out2 += correctSlot.readCh();
    expect(out2).toBe('hi');
  });

});

describe("canRead(n) formula — all sources agree, relative to current position", () => {
  // All three sources now check startIndex + n < buffer.length -- "how many
  // more characters from here", not "how big is the whole document".

  it("BufferSource answers relative to how far it has already read", () => {
    const buf = Buffer.from('0123456789'); // 10 bytes total
    const source = new BufferSource(buf);
    source.startIndex = 8; // only 2 characters left: '8', '9'

    expect(source.canRead(3)).toBe(false); // correct: only 2 remain
    expect(source.canRead(1)).toBe(true);  // correct: 1 remains after this one
    expect(source.canRead()).toBe(true);   // still fine (2 left)
  });

  it("StringSource answers relative to how far it has already read", () => {
    const source = new StringSource('0123456789');
    source.startIndex = 8; // only 2 characters left

    expect(source.canRead(3)).toBe(false);
    expect(source.canRead(1)).toBe(true);
    expect(source.canRead()).toBe(true);
  });

  it("FeedableSource answers the same question the same way", () => {
    const source = new FeedableSource();
    source.feed('0123456789');
    source.startIndex = 8; // only 2 characters left

    expect(source.canRead(3)).toBe(false); // correct: only 2 remain
    expect(source.canRead(1)).toBe(true);  // correct: 1 remains after this one
  });

  it("BufferSource readCh and readStr agree on multi-byte UTF-8 at character boundaries", () => {
    const xml = 'café'; // 4 chars, 5 bytes
    const buf = Buffer.from(xml, 'utf8');
    const profile = buildProfileForBuffer(buf, { encoding: 'utf8' });
    const source = new BufferSource(buf, profile);

    // 1. Read the whole buffer char-by-char and join → should be "café"
    const chars = [];
    while (source.canRead()) {
      chars.push(source.readCh());
    }
    expect(chars.join('')).toBe('café');

    // 2. Reset and read the same string via readStr with the full byte length
    source.startIndex = 0;
    const fullString = source.readStr(buf.length); // 5 bytes
    expect(fullString).toBe('café');

    // 3. Test a single multi-byte character: 'é' (2 bytes)
    source.startIndex = 0; // reset
    // Read first three single-byte chars: 'c', 'a', 'f'
    source.readCh(); // 'c'
    source.readCh(); // 'a'
    source.readCh(); // 'f'
    // Now at byte offset 3 (after 'caf')
    const startOfE = source.startIndex; // should be 3
    // Read 'é' with readCh() – it returns 'é' and advances startIndex by 2
    const charFromReadCh = source.readCh();
    expect(charFromReadCh).toBe('é');
    expect(source.startIndex).toBe(5); // byte offset after é

    // Reset to start of é and read via readStr(2)
    source.startIndex = startOfE;
    const charFromReadStr = source.readStr(2); // 2 bytes = 'é'
    expect(charFromReadStr).toBe('é');
    // readStr does NOT update startIndex, so it remains at startOfE
    // (but we don't care; we verified the string)
  });
});
