# Understanding Mark, Rewind, and Flush in the XML Parser

This document explains how the parser handles incremental input (chunked/streaming) and memory management using a two‑level **mark** system, **rewind**, and **flush**. The same parser logic works with four input sources:

- **StringSource** – full document in memory (string)
- **BufferSource** – full document in a Node.js `Buffer`
- **FeedableSource** – incremental string/Buffer via `feed()`
- **StreamSource** – Node.js Readable stream (extends `FeedableSource`)

All sources implement a common interface with `markTokenStart(level)`, `rewindToMark()`, `flush()`, and the core reading methods. The parser (`Xml2JsParser`) uses these unconditionally, making it source‑agnostic.

> **Exception:** `BufferSource` does not actually implement two independent slots — its `markTokenStart(level)` ignores the `level` argument entirely and writes a single `_tokenStart` field. This is harmless today only because `parseBytesArr()` is never chunked (no rewind is ever needed, so the outer/inner distinction is moot for that source) — see the Source‑Specific Behaviour table below.

---

## Two‑Level Marks

Each source maintains **two independent mark slots**:

| Level | Who sets it | Purpose |
|-------|-------------|---------|
| **0** (outer) | `parseXml()` main loop, just before reading the next character | The position to **rewind to** when input is exhausted mid‑token. This ensures the whole tag (including its `<`, `<!`, `</`, etc.) is replayed on the next chunk. |
| **1** (inner) | Individual reader functions (`readTagExp`, `readClosingTagName`, `readCdata`, etc.) at the start of their logic | The position **flush()** uses to protect an in‑progress token – the buffer is never trimmed before any active inner mark. |

> **Why two levels?**  
> Without two levels, an inner mark would overwrite the outer mark, and `rewindToMark()` would rewind to the middle of the tag, causing lost prefix characters (`<`, `!`, `[`, etc.). By keeping them separate, the outer mark is safe.

---

## How Rewind Handles Chunk Boundaries

When a reader tries to read beyond the available buffer (e.g. `canRead()` returns `false` or a scan function returns `-1`), it throws `UNEXPECTED_END`. The parser catches this error in `XMLParser.feed()` (or `StreamSource.onChunk`) and calls `source.rewindToMark()`.

- `rewindToMark()` restores `startIndex` (and line/col) to the outer mark (level 0).
- The source’s buffer still contains the incomplete token because **flushing** never crosses an active mark.
- On the next `feed()` with more data, the parser re‑reads the entire tag from the beginning, now with enough data to complete it.

**Example:**

```javascript
const parser = new XMLParser();
parser.feed('<root>');        // buffer now "<root>"
parser.feed('<tag>value');    // "value" is incomplete (no closing </tag>)
parser.feed('</tag></root>'); // completes
parser.end();
```

When the second `feed()` (`<tag>value`) arrives, the reader for the opening tag succeeds, then `readUpto` for `</tag>` throws `UNEXPECTED_END` because the closing tag isn’t there yet. The source is rewound to the outer mark set at the `<` of the opening tag, so on the third `feed()` the parser re‑reads `<tag>value` and then continues to `</tag>` successfully.

---

## How Flush Frees Memory

**Flushing** discards already‑parsed data from the front of the buffer to prevent unbounded memory growth in long‑running incremental parses.

- In `FeedableSource` and `StringSource`, `flush()` trims the buffer up to the **minimum** of all active marks or `startIndex` if none are set.
- Any active mark (level 0 or 1) acts as a **boundary** – data before the earliest mark is safe to remove because no in‑progress token extends before that point.
- After trimming, mark positions are adjusted by subtracting the trimmed amount.

**Auto‑flush** triggers in `updateBufferBoundary()` when:
- `autoFlush` is enabled,
- the processed portion (`startIndex`) exceeds `flushThreshold`.

The `flush()` method then safely trims the buffer: it discards everything before the minimum of all active marks (or `startIndex` if no marks are set). This ensures any in‑progress token is never truncated – the marks act as a **boundary**, not as a precondition for calling `flush()`.

For `StringSource` and `BufferSource` (full‑document sources), flushing is purely an optimisation – the whole document is already in memory, but auto‑flush can still free the parsed prefix.

---

## Source‑Specific Behaviour

| Source | `rewindToMark()` | `flush()` Behaviour |
|--------|------------------|----------------------|
| **StringSource** | No‑op (full document available) | Trims the string using `substring()`. Marks preserved. |
| **BufferSource** | No‑op (full document available) — single `_tokenStart` slot, not two-level | Trims the `Buffer` using `subarray()` and copies to a new `Buffer` so the original can be GC’d. Guarded by `_tokenStart < 0`, since flushing repeatedly here would mean an `O(n)` copy per `flushThreshold` bytes for a buffer that's fixed-size from construction, not incrementally grown — worth leaving conservative unless chunked Buffer input is added later. |
| **FeedableSource** | Restores to outer mark (level 0) and clears both marks | Trims the string using `substring()`; marks adjusted. |
| **StreamSource** | Same as FeedableSource | Same as FeedableSource |

> **Important:** Even though `rewindToMark()` is a no‑op for full‑document sources, the parser still calls it unconditionally – it does not need to know the source type.

---

## Typical Flow (Incremental Parse)

1. **Parser loop** (`parseXml()`):
   - `markTokenStart(0)` – store current position.
   - Read a character. If it’s `<`, dispatch to appropriate reader.
2. **Reader** (e.g. `readTagExp`):
   - `markTokenStart(1)` – store its start.
   - Scan for `>`.
   - If buffer ends, throw `UNEXPECTED_END`.
3. **Caller (`feed()`)**:
   - Catches `UNEXPECTED_END`.
   - Calls `source.rewindToMark()` – resets to level 0 mark.
   - Returns, waiting for more data.
4. **Next `feed()`**:
   - Appends new data.
   - Calls `parseXml()` again.
   - The loop re‑reads the same tag from the outer mark (now with complete data).
5. **Successful completion**:
   - After consuming the tag, `updateBufferBoundary()` advances `startIndex` and may trigger auto‑flush.
   - Flush trims the buffer behind the earliest mark, freeing memory.

---

## Debugging Tip: Checking Marks

If you suspect a mark is preventing flush or causing a rewind to the wrong position, inspect the source’s `_marks` array:

```javascript
console.log(source._marks); // [ { startIndex, line, cols }, { startIndex, line, cols } ]
```

For `StringSource`, marks are stored as plain numbers (`startIndex` only), because line/col are not needed for rewind (it’s a no‑op), but they are still used for flush boundaries.

---

## Summary

- **Marks** provide the parser with a way to **retry** incomplete tokens and to **safely trim** the buffer without losing data.
- **Two levels** keep the outer loop’s position separate from inner readers.
- **Rewind** resets to the outer mark when a chunk boundary is hit, ensuring the full tag is re‑parsed.
- **Flush** frees memory behind the earliest active mark, keeping the buffer bounded.

With this understanding, you can examine the implementation for any bugs related to mark placement, adjustment after flush, or the interaction between auto‑flush and marks.

---

# Example

Let's trace exactly how the two mark slots (`_marks[0]` = outer, `_marks[1]` = inner) change during parsing, for both a **valid** (complete) input and an **invalid** (chunk‑boundary) input.

I'll use **FeedableSource** (the incremental one) because it exercises all mechanics. The buffer is a string, `startIndex` points to the next byte to read, and `_marks` is an array of two slots.

---

## Scenario 1: Valid Input – No Rewind

**Input** (one `feed()` call): `<root></root>`

| Step | Action | `buffer` (relevant part) | `startIndex` | `_marks[0]` (outer) | `_marks[1]` (inner) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 0 | Initial | `<root></root>` | `0` | `null` | `null` |
| 1 | `parseXml()` loop – before reading next char | — | `0` | `{ startIndex: 0 }` | `null` |
| 2 | Reads `<`, sees `r` → calls `readOpeningTag()`<br>Inside `readTagExp()` | — | `1` | `{ startIndex: 0 }` | `{ startIndex: 1 }` |
| 3 | `scanTagExpEnd()` finds `>` at offset `4` (relative).<br>`readTagExp` returns, `updateBufferBoundary(5)` advances | — | `6` | `{ startIndex: 0 }` | `{ startIndex: 1 }` |
| 4 | End of current tag. `parseXml()` loop continues.<br>**Before next char**, it overwrites the outer mark: `markTokenStart(0)` | — | `6` | `{ startIndex: 6 }` | `{ startIndex: 1 }` |
| 5 | Reads `<`, sees `/` → calls `readClosingTag()`<br>Inside `readClosingTagName()` | — | `7` | `{ startIndex: 6 }` | `{ startIndex: 7 }` |
| 6 | Reads `root>`, `updateBufferBoundary(5)` advances | — | `12` | `{ startIndex: 6 }` | `{ startIndex: 7 }` |
| 7 | Parsing finishes. Marks remain set (they are just stale).<br>No `rewind` ever occurred. | — | `12` | `{ startIndex: 6 }` | `{ startIndex: 7 }` |

> **Observation**: On the success path, marks are never cleared (except by overwrite). The inner mark (`[1]`) stays at the start of the last opened reader. This is fine because its only job is to act as a **flush boundary** – it prevents `flush()` from trimming data that an in‑progress reader might still need. Since the parse is complete, no further flush will happen.

---

## Scenario 2: Invalid / Chunk Boundary – Rewind Triggered

**Input** (split across two `feed()` calls):

- Feed 1: `<root><tag`    (incomplete – no `>`)
- Feed 2: `>value</tag></root>`

### State after Feed 1 (`<root><tag`)

| Step | Action | `buffer` | `startIndex` | `_marks[0]` (outer) | `_marks[1]` (inner) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 0 | Initial | `<root><tag` | `0` | `null` | `null` |
| 1 | `parseXml()` loop – before `<root>` | — | `0` | `{ startIndex: 0 }` | `null` |
| 2 | Reads `<`, sees `r` → `readOpeningTag`<br>`readTagExp` sets inner mark | — | `1` | `{ startIndex: 0 }` | `{ startIndex: 1 }` |
| 3 | `scanTagExpEnd` finds `>` at `5`, returns. `updateBufferBoundary(5)` → `startIndex = 6` | — | `6` | `{ startIndex: 0 }` | `{ startIndex: 1 }` |
| 4 | Loop continues. **Before reading `<tag`**, overwrites outer mark: `markTokenStart(0)` | — | `6` | `{ startIndex: 6 }` | `{ startIndex: 1 }` |
| 5 | Reads `<`, sees `t` → `readOpeningTag`<br>`readTagExp` sets inner mark | — | `7` | `{ startIndex: 6 }` | `{ startIndex: 7 }` |
| 6 | `scanTagExpEnd()` scans from `7`.<br>Reads `t`, `a`, `g`… reaches buffer end → returns `-1`. | — | `7` | `{ startIndex: 6 }` | `{ startIndex: 7 }` |
| 7 | `readTagExp` throws `UNEXPECTED_END`.<br>`feed()` catches it and calls **`rewindToMark()`**. | — | **← reset to `6`** | **`null`** (cleared) | **`null`** (cleared) |
| **After rewind** | The source is restored to the outer mark of the `<tag` token. | `<root><tag` | `6` | `null` | `null` |

### State after Feed 2 (`>value</tag></root`) – Resume

Now `buffer` becomes `<root><tag>value</tag></root>`. `startIndex` is still `6`.

| Step | Action | `buffer` (relevant) | `startIndex` | `_marks[0]` (outer) | `_marks[1]` (inner) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 8 | `parseXml()` loop – **before re‑reading `<tag`**, sets outer mark | — | `6` | `{ startIndex: 6 }` | `null` |
| 9 | Reads `<`, sees `t` → `readOpeningTag`<br>`readTagExp` sets inner mark | — | `7` | `{ startIndex: 6 }` | `{ startIndex: 7 }` |
| 10 | `scanTagExpEnd` now finds `>` at index `10` (relative `3`).<br>`updateBufferBoundary(4)` → `startIndex = 11` | — | `11` | `{ startIndex: 6 }` | `{ startIndex: 7 }` |
| 11 | Parser continues reading `value`, then `</tag>`, then `</root>`.<br>Each new token overwrites the outer mark (`[0]`). | — | … | overwritten | overwritten |
| 12 | Parse completes successfully. No further rewind. | — | `end` | stale | stale |

---

## Why Two Levels Are Critical (Visualised)

Look at **Step 4** in Scenario 2. The outer mark (`[0]`) was **moved** from the start of `<root>` to the start of `<tag>` (index `6`).

Now imagine if there were only **one** mark slot, and `readTagExp` for `<tag` overwrote it at Step 5. When `rewind` runs at Step 7, it would restore `startIndex` to `7` (the inner mark) instead of `6`.  
The parser would then re‑read `ag` (missing the leading `<`) on the next chunk, instantly causing a syntax error.

Because we have two levels:

- Outer (`[0]`) is preserved for the **rewind**.
- Inner (`[1]`) is preserved for the **flush** boundary (so flush doesn’t trim the incomplete token from the buffer).

---

## How Flush Interacts with These Marks

Suppose the incomplete tag was very large (e.g. `<root><tag attr="giant...`). While waiting for the next chunk, `updateBufferBoundary` might call `flush()`.

- `flush()` in FeedableSource computes `origin = min(startIndex, _marks[0].startIndex, _marks[1].startIndex)`.
- At Step 6 before rewind, `startIndex = 7`, `_marks[0] = 6`, `_marks[1] = 7`. The minimum is `6` – so flush will **keep everything from index `6` onward**, discarding only the fully‑parsed `<root>` prefix.
- If the inner mark were not there, `origin` would be `min(7, 6)` = `6` anyway (thanks to the outer mark). But when the outer mark is overwritten at Step 4, `_marks[0]` moves to `6`. The inner mark (`7`) is the one that protects the bytes of the `<tag` token itself from being trimmed as the parser reads inside it.

> **In short**:  
> - **Mark 0** = _where to rewind to_ (saves the `<`).  
> - **Mark 1** = _where not to flush past_ (saves the unread part of the token).

---

## Summary Table of Mark Lifecycle

| Scenario | `_marks[0]` (outer) | `_marks[1]` (inner) | Effect |
| :--- | :--- | :--- | :--- |
| **Valid parse** | Overwritten each loop iteration. | Overwritten by each reader. | Rewind not called. Flush trims behind the minimum of the two. |
| **Chunk boundary** | Set to the start of the current tag (including `<`). | Set to the exact start of the reader (e.g. after `<`). | Rewind restores to `[0]`. Flush protects `[1]`. |
| **After rewind** | Cleared. | Cleared. | The next loop iteration sets fresh marks, replaying the tag from its outer position. |