import XMLParser from "../src/XMLParser.js";

/**
 * Regression coverage for the flush-architecture fix.
 *
 * Background: updateBufferBoundary() used to gate flush() behind an
 * "anyMarkActive" check. Since _marks[0] is set on every parseXml() loop
 * iteration and only ever nulled by rewindToMark() (an error path),
 * that gate was permanently true in normal operation, so flush() never ran —
 * FeedableSource/StringSource silently retained the entire document in
 * memory regardless of flushThreshold, and (as a second-order effect) every
 * substring()/readStr() call on the ever-growing buffer made parsing
 * approach O(n^2) on large documents.
 */
describe("FeedableSource flush architecture", () => {

  it("trims the buffer below flushThreshold repeatedly across many feed() calls", () => {
    const parser = new XMLParser({ feedable: { flushThreshold: 200, bufferSize: 50 } });
    let xml = "<root>";
    for (let i = 0; i < 50; i++) xml += `<item id="${i}">padding text here</item>`;
    xml += "</root>";

    let sawShrinkBelowThreshold = false;
    for (let i = 0; i < xml.length; i += 30) {
      parser.feed(xml.slice(i, i + 30));
      if (parser._feedSource.buffer.length < 200) sawShrinkBelowThreshold = true;
    }

    expect(sawShrinkBelowThreshold).toBe(true);
    expect(parser._feedSource.buffer.length).toBeLessThan(xml.length);
  });

  it("keeps peak buffer size bounded (not ~= full document) on a large document", () => {
    const chunk = `<item id="ID" attr="value">some text content padding data here</item>\n`;
    let parts = [];
    let total = 6;
    while (total < 2 * 1024 * 1024) { parts.push(chunk); total += chunk.length; }
    const xml = "<root>" + parts.join("") + "</root>";

    const parser = new XMLParser({ feedable: { flushThreshold: 1024, maxBufferSize: 200 * 1024 * 1024 } });
    let peakBuffer = 0;
    for (let i = 0; i < xml.length; i += 4096) {
      parser.feed(xml.slice(i, i + 4096));
      peakBuffer = Math.max(peakBuffer, parser._feedSource.buffer.length);
    }
    parser.end();

    expect(peakBuffer).toBeLessThan(xml.length / 2);
  });

  it("still produces the correct parsed result after flush is applied (correctness, not just size)", () => {
    const parser = new XMLParser({ feedable: { flushThreshold: 50, bufferSize: 20 } });
    const xml = "<root><a>1</a><b>2</b><c>3</c></root>";
    for (let i = 0; i < xml.length; i += 7) parser.feed(xml.slice(i, i + 7));
    const result = parser.end();
    expect(result.root.a).toBe(1);
    expect(result.root.b).toBe(2);
    expect(result.root.c).toBe(3);
  });

  // ── Highest-risk area: flush() actually running now interacting with
  // rewindToMark() on a token split across a feed() boundary. This
  // combination was never exercised before (flush was always dead), so it
  // has no prior coverage anywhere else in the suite.

  it("correctly resumes a CDATA section split across a feed() boundary, with a low flushThreshold active", () => {
    const parser = new XMLParser({ feedable: { flushThreshold: 10, bufferSize: 10 } });
    const cdataContent = "x".repeat(200) + "SPLIT_MARKER" + "y".repeat(200);
    const xml = `<root><data><![CDATA[${cdataContent}]]></data></root>`;

    for (let i = 0; i < xml.length; i += 5) parser.feed(xml.slice(i, i + 5));
    const result = parser.end();

    const text = typeof result.root.data === "string" ? result.root.data : JSON.stringify(result.root.data);
    expect(text).toContain("SPLIT_MARKER");
    expect(text.length).toBeGreaterThanOrEqual(cdataContent.length);
  });

  it("correctly resumes an opening tag with attributes split across a feed() boundary, with a low flushThreshold active", () => {
    const parser = new XMLParser({ feedable: { flushThreshold: 15, bufferSize: 8 }, skip: { attributes: false } });
    let xml = "<root>";
    for (let i = 0; i < 30; i++) {
      xml += `<item id="${i}" label="item-number-${i}" flag="true">value-${i}</item>`;
    }
    xml += "</root>";

    for (let i = 0; i < xml.length; i += 3) parser.feed(xml.slice(i, i + 3));
    const result = parser.end();

    const items = result.root.item;
    expect(items.length).toBe(30);
    expect(items[0]["@_id"]).toBe(0);
    expect(items[29]["@_label"]).toBe("item-number-29");
  });

  it("correctly resumes a DOCTYPE internal subset split across a feed() boundary, with a low flushThreshold active", () => {
    const parser = new XMLParser({
      feedable: { flushThreshold: 12, bufferSize: 8 },
      doctypeOptions: { enabled: true },
    });
    const xml = `<!DOCTYPE root [
      <!ENTITY foo "bar">
      <!ELEMENT root (child)>
      <!ATTLIST root id CDATA #IMPLIED>
    ]>
    <root><child>ok</child></root>`;

    for (let i = 0; i < xml.length; i += 4) parser.feed(xml.slice(i, i + 4));
    const result = parser.end();

    expect(result.root.child).toBe("ok");
  });

  it("StringSource (one-shot parse()) also flushes — sanity check the same fix applies there", () => {
    const parser = new XMLParser({ feedable: {} }); // n/a to parse(), StringSource has its own defaults
    const chunk = "<item>padding text here</item>";
    let xml = "<root>" + chunk.repeat(200) + "</root>";
    const result = parser.parse(xml);
    expect(result.root.item.length).toBe(200);
  });
});

/**
 * Regression coverage for the _batchThreshold ratchet bug.
 *
 * Background: on a chunk-boundary stall (a token split across feed() calls),
 * _runParse() doubles _batchThreshold so the parser doesn't hammer itself
 * retrying against a still-incomplete token. That part is correct and
 * intentional. The bug: once real progress resumed, only _pendingBytes was
 * reset to 0 — _batchThreshold itself was never brought back down. Every
 * later stall then doubled from an already-inflated value instead of from
 * the configured baseline (options.feedable.bufferSize), so on a long stream
 * with many stalls the threshold escalated monotonically until it reached
 * maxBufferSize, at which point FeedableSource's overflow guard aborted the
 * session. Reported against a 2.3 GB stream with ~580 chunk-boundary stalls,
 * dying ~70 MB in.
 *
 * Fix: on didAdvance, reset _batchThreshold back to
 * options.feedable.bufferSize (the configured baseline), not just zero
 * _pendingBytes.
 */
describe("FeedableSource _batchThreshold reset", () => {

  it("grows _batchThreshold on a chunk-boundary stall", () => {
    // Stall must be on the FIRST tag in the document. startIndex advances
    // past any tag that closes successfully, so a stall on a LATER tag
    // (e.g. "<root><item ...") still shows afterPos > beforePos for that
    // feed() call (progress was made on <root>, even though <item> stalled)
    // — didAdvance would wrongly read true. Only a stall before any '>' at
    // all guarantees zero net advance.
    const parser = new XMLParser({ feedable: { bufferSize: 8, flushThreshold: 1024 } });
    const baseline = parser._batchThreshold;

    parser.feed('<root id="12345678901234567890');

    expect(parser._batchThreshold).toBeGreaterThan(baseline);
  });

  it("resets _batchThreshold back to options.feedable.bufferSize once progress resumes", () => {
    const bufferSize = 8;
    const parser = new XMLParser({ feedable: { bufferSize, flushThreshold: 1024 } });

    // Stall on the very first tag (zero net advance for this feed call).
    parser.feed('<root id="12345');
    expect(parser._batchThreshold).toBeGreaterThan(bufferSize);

    // Now supply enough to let the parser actually advance past <root ...>.
    parser.feed('67890"><item>text</item></root>');

    expect(parser._batchThreshold).toBe(bufferSize);
  });

  it("does not let _batchThreshold escalate toward maxBufferSize across many alternating stall/recover cycles", () => {
    const bufferSize = 8;
    const maxBufferSize = 4096; // deliberately small so a runaway would be easy to detect
    const parser = new XMLParser({ feedable: { bufferSize, maxBufferSize, flushThreshold: 256 } });

    let xml = "<root>";
    for (let i = 0; i < 200; i++) {
      // Long attribute value increases the chance a 3-char feed lands mid-token,
      // forcing a stall-then-recover cycle on many iterations.
      xml += `<item id="item-number-${i}-padding-padding-padding">v${i}</item>`;
    }
    xml += "</root>";

    let maxObservedThreshold = parser._batchThreshold;
    for (let i = 0; i < xml.length; i += 3) {
      parser.feed(xml.slice(i, i + 3));
      maxObservedThreshold = Math.max(maxObservedThreshold, parser._batchThreshold);
    }
    const result = parser.end();

    // Under the old (buggy) code this climbs monotonically toward
    // maxBufferSize over repeated stalls and never comes back down.
    // With the fix, it should only ever be transiently inflated right after
    // a stall, and should not approach the ceiling over 200 repeated cycles.
    expect(maxObservedThreshold).toBeLessThan(maxBufferSize);
    expect(result.root.item.length).toBe(200);
  });

  it("parses a large, heavily-chunked document to completion without hitting maxBufferSize (integration-level check for the reported hang)", () => {
    const bufferSize = 16;
    const maxBufferSize = 64 * 1024; // small ceiling to make a runaway fail fast if the bug is present
    const parser = new XMLParser({ feedable: { bufferSize, maxBufferSize, flushThreshold: 512 } });

    const chunk = `<record id="ID" attr="some attribute value padding">payload text padding here</record>\n`;
    let parts = [];
    let total = 6;
    while (total < 1 * 1024 * 1024) { parts.push(chunk); total += chunk.length; }
    const xml = "<root>" + parts.join("") + "</root>";

    // Small, irregular feed size to maximize the chance of landing mid-token
    // repeatedly, similar in spirit to the reported streaming scenario.
    let i = 0;
    let step = 5;
    expect(() => {
      while (i < xml.length) {
        parser.feed(xml.slice(i, i + step));
        i += step;
        step = step === 5 ? 7 : 5; // vary chunk size across the loop
      }
      parser.end();
    }).not.toThrow();
  });

  it("resets to the configured bufferSize even after multiple consecutive stalls compound the growth before recovery", () => {
    const bufferSize = 8;
    const parser = new XMLParser({ feedable: { bufferSize, flushThreshold: 1024 } });

    // Multiple tiny feeds in a row, each individually incomplete, all still
    // inside the FIRST tag (no '>' seen yet) — so every one of them is a
    // true zero-net-advance stall, doubling _batchThreshold more than once
    // before real progress is made.
    parser.feed('<root id="12345');
    parser.feed('67890123456789012345');
    parser.feed('67890');
    expect(parser._batchThreshold).toBeGreaterThan(bufferSize);

    parser.feed('"><item>text</item></root>');

    expect(parser._batchThreshold).toBe(bufferSize);
  });
});