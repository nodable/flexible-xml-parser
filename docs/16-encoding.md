# Encoding support

FXP intelligently handles many different character encodings, not just UTF‑8. 

## Quick usage

```js
// Auto-detect (default) — sniffs a BOM or an <?xml ... encoding="..."?>
// declaration; falls back to UTF-8 if neither is present.
new XMLParser().parseBytesArr(buffer);

// Explicit — skips detection entirely.
new XMLParser({ decoding: { encoding: 'utf16le' } }).parseBytesArr(buffer);

// Custom encoding FXP doesn't ship natively (e.g. Shift_JIS via iconv-lite).
new XMLParser({
  decoding: {
    encoding: 'shift_jis',
    customDecoders: {
      shift_jis: {
        createDecoder: () => iconv.getDecoder('shift_jis'),
        selfSynchronizing: false, // see "Adding an encoding" below
      },
    },
  },
});
```

## 1. Default Behaviour: Auto‑Detection

If you don’t specify anything, the parser figures out the encoding for you:

- It first looks for a **Byte Order Mark (BOM)** at the very beginning of the file/stream (e.g. `EF BB BF` for UTF‑8, `FF FE` for UTF‑16LE).
- If no BOM is found, it peeks at the first 200 bytes and tries to find an **XML declaration** like `<?xml version="1.0" encoding="UTF‑8"?>` and reads the `encoding` attribute.
- If neither exists, it falls back to **UTF‑8** (the XML spec default).

All of this happens automatically – you just call `.parse()` or `.parseBytesArr()` as usual.

```js
const parser = new XMLParser();
const result = parser.parseBytesArr(buffer);   // auto‑detects
```

## 2. Explicitly Setting an Encoding

You can skip auto‑detection and tell the parser which encoding to use. This is useful when you already know the encoding or want to force a specific one.

```js
const parser = new XMLParser({
  decoding: { encoding: 'utf16le' } //'auto' (default)
});
const result = parser.parseBytesArr(buffer);
```

The parser then uses that encoding directly – no BOM/declaration sniffing.

Supported built‑in encodings:  
`'utf8'`, `'ascii'`, `'latin1'` (also `'iso‑8859‑1'`), `'utf16le'`, `'utf16be'` (Node.js doesn’t have a native UTF‑16BE decoder, so FXP implements one by byte‑swapping).

## 3. Custom Encodings (e.g. Shift_JIS, GBK)

If you need an encoding not built in (like Japanese Shift_JIS), you can register a custom decoder. The decoder must follow Node’s `StringDecoder` interface – it has `write(buffer)` and `end()` methods.

You supply it via the `customDecoders` option, scoped to a single parser instance:

```js
import iconv from 'iconv-lite';

const parser = new XMLParser({
  decoding: {
    encoding: 'shift_jis',
    customDecoders: {
      shift_jis: {
        createDecoder: () => iconv.getDecoder('shift_jis'),
        selfSynchronizing: false   // important – read below
      }
    }
  }
});
```

The `selfSynchronizing` flag tells the parser whether it’s safe to scan the raw bytes for angle brackets (`<`, `>`, `"`, `'`).  
**Most multi‑byte encodings are NOT self‑synchronizing** – an ASCII delimiter byte can accidentally appear inside a multi‑byte character, causing the parser to mis‑identify tag boundaries.  
**Only set `selfSynchronizing: true` if you are absolutely sure** – the default `false` is safe (it decodes everything first, which is slightly slower but correct).

## 4. How It Works Internally (Two Scanning Strategies)

The parser has two completely different ways to read your XML, chosen once per document based on the encoding:

- **Byte‑scanning (fast)** – used for self‑synchronizing encodings (UTF‑8, ASCII, Latin‑1).  
  It walks through the raw bytes, looking for delimiter bytes (`<`, `>`, etc.). This is extremely fast, but only works because we know those byte values can never appear as part of a longer character.

- **Character‑scanning (slower but safe)** – used for encodings that are *not* self‑synchronizing (UTF‑16, custom multi‑byte).  
  The parser first decodes the entire input into a JavaScript string, then scans that string character‑by‑character. This is the same algorithm used for `StringSource` input, so it’s proven correct.

You don’t have to choose – FXP picks the right one based on the encoding you’ve set or auto‑detected.

For streaming input (`feed()`/`end()` or `parseStream()`), the parser buffers a small amount of raw bytes until it can determine the encoding, then decodes and continues. This ensures auto‑detection works even when the declaration is split across chunks.

## 5. Error Positions (Line/Column) Are Now Correct for UTF‑8

Previously, when an error occurred, the reported column number was based on **bytes**, not **characters**. For UTF‑8 text with multi‑byte characters (like `é` or `🎉`), the column could be off by one or more.

FXP now tracks both a **byte column** and a **character column** simultaneously while scanning, at no extra cost. When an error is reported, it picks the correct one:

- For UTF‑8 → uses the character column (so `"café"` and `"cafe"` show the same column for the same error).
- For single‑byte encodings → byte column = character column, so no difference.

This fix is also important because the parser records the start position of every tag (for `Xml2JsParser`), so correcting the column prevents off‑by‑one errors in nested structures.

## 6. Important Limitations & Caveats

- **BOM vs declared encoding mismatch** – If the BOM says UTF‑8 but the XML declaration says `encoding="UTF‑16"`, the parser throws a hard error (`ENCODING_MISMATCH`). It does not silently pick one – that would be ambiguous and error‑prone.
- **Streaming auto‑detection** – The parser may hold back up to ~200 bytes of the stream until it has enough to detect the encoding. This is usually fine, but for very small documents (shorter than that) it resolves at `end()`.
- **Custom encoders must be correctly implemented** – If your `createDecoder()` doesn’t return an object with `write` and `end`, the parser throws immediately during registration, not later during parsing.
- **`selfSynchronizing: true` is an advanced opt‑in** – Only set it if you are 100% sure that no byte that looks like `<`, `>`, `"`, or `'` can appear inside a multi‑byte character in that encoding. Getting it wrong will cause silent data corruption, not a crash.
- **Input types** – The encoding features apply to `Buffer` or `Uint8Array` inputs. If you pass a JavaScript string already, no decoding is needed.
- **Performance** – For UTF‑8/ASCII/Latin‑1, the byte‑scanning path is as fast as before (zero overhead). For other encodings, the parser decodes the whole document upfront (for buffer input) or decodes incrementally (for streams), which may be slower for very large documents.

---

## 7. Summary

| Aspect | What FXP does |
|--------|---------------|
| **Auto‑detect** | BOM → XML declaration → UTF‑8 |
| **Explicit** | Set `decoding.encoding` to any supported/custom name |
| **Custom** | Register via `customDecoders` with a `StringDecoder`‑compatible factory |
| **Fast path** | Byte‑scanning for self‑synchronizing encodings (UTF‑8, ASCII, Latin‑1) |
| **Safe path** | Char‑scanning for everything else (UTF‑16, Shift_JIS, etc.) |
| **Error columns** | Correct for multi‑byte characters (UTF‑8) |
| **Conflict handling** | BOM vs declared encoding mismatch → throws error |

You can use the parser with any encoding you need, and the complexity is hidden behind a clean API. The default “just works” behaviour for UTF‑8 remains unchanged, while power users can plug in any encoding supported by the Node ecosystem.

---

Buffer/typed-array input to `parse()` is routed through the same encoding-aware
path as `parseBytesArr()` — it no longer does an unconditional UTF-8
`toString()` before FXP ever sees it.

## Why this needed more than "pick a decoder"

FXP has three input sources, and they don't all work the same way underneath:

- **`StringSource`** — input is already a JS string. Nothing to decode.
- **`FeedableSource` / `StreamSource`** — bytes are decoded to a JS string
  incrementally (`node:string_decoder`) *before* any scanning happens. All
  tag/attribute/text scanning already runs on decoded characters.
- **`BufferSource`** — scans the raw `Buffer` directly, byte by byte, for
  speed (`scanTagExpEnd`, `readUpto*`). This is only safe for
  **self-synchronizing** encodings — ones where an ASCII delimiter byte
  (`<`, `>`, `"`, `'`) can never occur as part of a different character's
  bytes. That's true for UTF-8 and any single-byte encoding, but **false**
  for UTF-16 and several legacy multi-byte encodings (Shift_JIS, GBK/GB18030,
  Big5, EUC-JP/KR all have byte ranges that collide with ASCII delimiter
  values).

So this isn't just a decoder swap — `BufferSource` has two genuinely different
ways to scan, chosen once per document, not per character.

## Architecture (`src/Encoding/`)

```
EncodingRegistry.js       — descriptors (utf8/ascii/latin1/utf16le/utf16be by
                             default) + register()/resolve(), fail-fast validated
EncodingDetector.js       — pure function: sniff(bytes, registry) -> {encoding, bomLength}
EncodingProfile.js        — the one place that turns "which encoding" into
                             concrete strategy objects, for BufferSource
ScanStrategy/
  ByteScanStrategy.js      — byte-indexed scanning, for self-synchronizing
                             encodings (utf8/ascii/latin1)
  CharScanStrategy.js      — char-indexed scanning on an eagerly-decoded
                             string, for everything else (utf16le/be, or a
                             custom encoding that isn't self-synchronizing)
PositionCorrector/
  PositionCorrectors.js    — O(1) pick() between byte-column and char-column
                             (see "Error positions" below)
```

`BufferSource` never branches on an encoding name. At construction it's handed
a resolved `profile` (from `EncodingProfile.buildProfileForBuffer`) and does
`Object.assign(this, profile.scanStrategy)` once — every `readCh`/`readStr`/
`scanTagExpEnd`/etc. call afterward just runs whichever strategy was assigned,
with zero per-call overhead or branching.

`FeedableSource`/`StreamSource` don't need a scan-strategy fork at all (they're
always decode-first) — they just need the right decoder, resolved the same way
via the registry, or via the auto-detect state machine described below.

## Auto-detection

Follows XML 1.0 Appendix F: check for a known BOM first; if none, ASCII-sniff
far enough to read `encoding="..."` out of a leading `<?xml ... ?>`
declaration; if neither, default to UTF-8. A BOM and a declared encoding that
disagree is a hard error (`ErrorCode.ENCODING_MISMATCH`), not silently
resolved one way.

- **`BufferSource`**: trivial — the whole buffer is available, so detection
  peeks the first ~200 bytes once.
- **`FeedableSource`/`StreamSource`**: can't decode immediately if `'auto'` is
  set — there may not be enough bytes yet to know the encoding. Raw
  (undecoded) bytes are buffered in `_sniffBuffer` until a BOM+enough bytes, a
  complete `<?xml ... ?>` declaration, or a 200-byte cap is reached, then
  detection resolves once, the real decoder is built, and the held bytes are
  decoded and handed off normally. A short document that never crosses the
  threshold resolves at `end()` instead.

## Error positions (`line`/`col`)

`BufferSource`'s byte-scan path counts `cols` in **bytes** internally for
speed (unchanged from before this feature) — that's wrong to report directly
for a multi-byte UTF-8 character. `ByteScanStrategy` maintains a *second*
counter, `_charCol`, incrementally at O(1) per character (and in the same
single pass `_advanceLineCol` already does for bulk text/attribute spans — no
extra traversal). `PositionCorrector.pick(byteCol, charCol)` just returns
whichever one is actually accurate for the active encoding — a plain field
read, not a recomputation.

*(An earlier version of this correction recomputed the column by rescanning
the buffer, planned as "only pay at error time." That was wrong: FXP captures
position once per **character**, not just on errors — Xml2JsParser's main
loop uses it to record the accurate start of every tag. Rescanning per
character turned an O(1) operation into O(line length), i.e. O(n²) overall.
Fixed by tracking the character column incrementally instead. If you're
touching this code, check every call site of a "corrector" or similar before
assuming a lazy/error-path-only cost model is safe — it usually isn't unless
you've actually verified nothing else calls it.)*

## Adding a new encoding

```js
import EncodingRegistry, { defaultEncodingRegistry } from './src/Encoding/EncodingRegistry.js';

defaultEncodingRegistry.register({
  name: 'shift_jis',
  selfSynchronizing: false, // see below — default and safe unless proven otherwise
  variableWidth: true,
  createDecoder: () => iconv.getDecoder('shift_jis'), // { write(buf)->str, end()->str }
});
```

or scoped to one `XMLParser` instance via `decoding.customDecoders` (shown
above) — this builds a private registry for that instance so it doesn't leak
into other `XMLParser`s in the same process.

`createDecoder()` must return an object shaped like Node's own
`StringDecoder`: `{ write(buf): string, end(): string }`. Validated at
registration time — a broken shape throws immediately
(`ErrorCode.INVALID_DECODER`), not on first use three parses later.

**`selfSynchronizing`**: only set this to `true` if you've actually verified
an ASCII delimiter byte value can never appear as part of one of your
encoding's multi-byte sequences. Getting this wrong makes `BufferSource`
misidentify tag/attribute boundaries — a correctness bug, not a crash, which
is exactly why the default is `false` (safe, slightly slower decode-first
path) and speed is opt-in, not assumed.

## What this does *not* cover yet

- No dedicated regression spec isolating the `BufferSource` prerequisite fix
  (readCh/readChAt disagreeing with readStr on multi-byte content) — it's
  covered indirectly by the general encoding specs, but a standalone spec
  would pin it down more precisely if it ever regresses.
- `readPiExp()` (processing instructions) and `DocTypeReader.js` were
  investigated as a possible gap and found to already be encoding-safe: both
  only ever call `source.readCh()/.readChAt()/.canRead()`, never index the
  raw buffer directly, so whichever scan strategy `BufferSource` was
  constructed with already applies to them automatically. No changes were
  needed there. (A separate, encoding-*independent* inconsistency in
  `canRead(n)`'s offset formula on `BufferSource`/`StringSource` — unrelated
  to this feature — has since been fixed; see the main project map's
  architecture notes.)