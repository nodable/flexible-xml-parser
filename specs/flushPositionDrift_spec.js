import XMLParser from "../src/XMLParser.js";
import { CompactBuilderFactory, CompactBuilder } from "@nodable/compact-builder";
import {
  runAcrossAllInputSourcesWithFactory,
} from "./helpers/testRunner.js";

/**
 * Records every position-bearing callback into an `events` array attached
 * to the returned parser.
 */
function makeRecordingParser(parserOptions = {}) {
  const events = { tags: [], closes: [], attrs: [] };

  class RecordingBuilder extends CompactBuilder {
    addElement(tagDetail, matcher) {
      events.tags.push({ name: tagDetail.name, index: tagDetail.index, openEnd: tagDetail.openEnd });
      return super.addElement(tagDetail, matcher);
    }
    closeElement(matcher, closeMeta) {
      events.closes.push({ name: closeMeta?.name, index: closeMeta?.index, closeEnd: closeMeta?.closeEnd });
      return super.closeElement(matcher, closeMeta);
    }
    addAttribute(name, value, matcher, attrMeta) {
      events.attrs.push({ name, value, index: attrMeta?.index });
      return super.addAttribute(name, value, matcher, attrMeta);
    }
  }

  const factory = {
    getInstance(parserOpts, readonlyMatcher) {
      const base = new CompactBuilderFactory();
      return new RecordingBuilder(parserOpts, base.builderOptions, readonlyMatcher, base.registry);
    }
  };

  const parser = new XMLParser({
    ...parserOptions,
    skip: { attributes: false, ...parserOptions.skip },
    OutputBuilder: factory,
  });
  parser._events = events;
  return parser;
}

/**
 * Builds a document long enough to cross the default flush threshold.
 */
function buildPaddedDoc(itemCount = 80) {
  let xml = "<root>";
  for (let i = 0; i < itemCount; i++) {
    xml += `<item id="${i}" note="padding-${i}">text-${i}</item>`;
  }
  xml += "</root>";
  return xml;
}

// -----------------------------------------------------------------------------
// Position drift tests – run across all input sources (string, buffer, feedable)
// -----------------------------------------------------------------------------
describe("Flush position drift — absolute offsets across all input sources", () => {
  const xml = buildPaddedDoc(120);

  runAcrossAllInputSourcesWithFactory(
    "tag index/openEnd/closeEnd stay absolute across an auto-flush",
    xml,
    (_result, _inputType, parser) => {
      const lastItemOpenTagStr = `<item id="119" note="padding-119">`;
      const expectedIndex = xml.indexOf(lastItemOpenTagStr);
      const expectedOpenEnd = expectedIndex + lastItemOpenTagStr.length;

      const tagEvent = parser._events.tags.filter(e => e.name === "item").pop();
      expect(tagEvent.index).toBe(expectedIndex);
      expect(tagEvent.openEnd).toBe(expectedOpenEnd);

      const closeEvent = parser._events.closes.filter(e => e.name === "item").pop();
      const expectedCloseEnd = xml.lastIndexOf("</item>") + "</item>".length;
      expect(closeEvent.closeEnd).toBe(expectedCloseEnd);
    },
    () => makeRecordingParser()
  );

  runAcrossAllInputSourcesWithFactory(
    "attribute offsets stay absolute across an auto-flush",
    xml,
    (_result, _inputType, parser) => {
      const lastNoteAttr = 'note="padding-119"';
      const expectedIndex = xml.lastIndexOf(lastNoteAttr);

      const attrEvent = parser._events.attrs
        .filter(e => e.name === "note" && e.value === "padding-119")
        .pop();
      expect(attrEvent.index).toBe(expectedIndex);
    },
    () => makeRecordingParser()
  );
});

// -----------------------------------------------------------------------------
// Feedable‑specific regression: batch‑threshold progress detection
// (remains a standalone test because it exercises internal parser state)
// -----------------------------------------------------------------------------
describe("Flush position drift — feedable batch‑threshold", () => {
  it("does not falsely report zero progress (batch-threshold check) once a flush rebases startIndex", () => {
    const xml = buildPaddedDoc(50);
    const parser = new XMLParser({ feedable: { flushThreshold: 30, bufferSize: 64 } });
    const thresholdsSeen = [];

    for (let i = 0; i < xml.length; i += 64) {
      parser.feed(xml.slice(i, i + 64));
      thresholdsSeen.push(parser._batchThreshold);
    }
    const result = parser.end();

    expect(result.root.item.length).toBe(50);
    expect(parser._batchThreshold).toBe(64);
  });
});

// -----------------------------------------------------------------------------
// Auto‑close error records – only tested via string input (original intent)
// (feedable does not reliably capture phantom-close errors, so we keep parse)
// -----------------------------------------------------------------------------
describe("Flush position drift — autoClose error records stay absolute", () => {
  it("phantom-close index is absolute even after a flush", () => {
    let xml = "<root>";
    for (let i = 0; i < 100; i++) xml += `<item id="${i}">padding-${i}</item>`;
    xml += `</bogus></root>`;

    const parser = new XMLParser({
      autoClose: { onMismatch: 'recover', collectErrors: true },
    });
    parser.parse(xml);

    const errs = parser.getParseErrors();
    const phantom = errs.find(e => e.type === 'phantom-close');
    expect(phantom).toBeDefined();
    const expectedIndex = xml.indexOf('</bogus>') + '</bogus>'.length;
    expect(phantom.index).toBe(expectedIndex);
  });
});