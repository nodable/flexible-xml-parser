

When the parser is reading the data, it marks the start of each unit, and flushes everything before it once it completes successfully.

The Core Idea is that every logical unit has a clear **start** and **end**:

|Unit|Starts at|Ends at|
|---|---|---|
|Opening tag|`<` before tag name|`>` closing it|
|Closing tag|`</`|`>`|
|CDATA|`<![CDATA[`|`]]>`|
|Comment|`<!--`|`-->`|
|PI tag|`<?`|`?>`|
|Text node|first non-`<` char|the `<` that ends it|


For example, if the input is `<root><child>value</child></root>`, the parser will:
1. Mark the start of the `root` unit.
2. Read the `child` unit.
3. Flush the `child` unit.
4. Flush the `root` unit.

```js
function readCdata(parser) {
  parser.source.markTokenStart();

  // read until ]]> is found
  // else error
}
```

For technical explanation

```js
parser.feed(`<b>hel<![CDATA[lo`);
```

`parseXml()` runs:

- Processes `<b>` → addTag
- Accumulates text `"hel"` (mark set at start of text)
- Hits `<![CDATA[` → `readCdata()` called, **mark set** (overwrites text mark)
- `readStr(6)` → reads `"CDATA["` ✓
- `readUpto("]]>")` → scans to end of buffer, no `]]>` found → **throws `UNEXPECTED_END`**
- Caught in `feed()` → `rewindToMark()` → `startIndex` resets to `<![CDATA[`
- Buffer now retains from `<![CDATA[lo` onward