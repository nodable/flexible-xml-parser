/**
 * position-metadata_spec.js — FXP
 *
 * Tests for the position-metadata contract (CLAUDE.md §14):
 *   - TagDetail.index now points at '<' (not past '>') — index-only, no line/col
 *   - TagDetail.openEnd — offset right after the opening tag's '>'
 *   - closeElement(matcher, closeMeta) — new 2nd arg
 *   - addAttribute(name, value, matcher, attrMeta) — new 4th arg
 *   - onStopNode(tagDetail, raw, matcher, stopEnd) — new 4th arg
 *
 * Pattern: subclass CompactBuilder to record intercepted args into an
 * `events` array attached to the XMLParser instance, so testFn can read
 * it after parsing. This follows customOutputBuilder_spec.js convention
 * and correctly handles the closure scope of runAcrossAllInputSourcesWithFactory
 * (parserFactory() is called fresh per input-source type; testFn reads
 * parser._events which is the array created in *that* factory call).
 */

import XMLParser from "../src/XMLParser.js";
import { CompactBuilderFactory, CompactBuilder } from "@nodable/compact-builder";
import {
  frunAcrossAllInputSourcesWithFactory,
  runAcrossAllInputSourcesWithFactory,
} from "./helpers/testRunner.js";

// ─── Helper ──────────────────────────────────────────────────────────────────
// Wraps a recording CompactBuilder subclass into a minimal factory.
// `events` is created fresh per parserFactory() call and attached to the
// returned XMLParser so testFn(result, inputType, parser) can read it via
// parser._events — no cross-run closure pollution.
function makeRecordingParser(SubclassFn, parserOptions = {}) {
  const events = [];
  const factory = {
    getInstance(parserOpts, readonlyMatcher) {
      const base = new CompactBuilderFactory();
      return new (SubclassFn(events))(
        parserOpts, base.builderOptions, readonlyMatcher, base.registry
      );
    }
  };
  const parser = new XMLParser({ ...parserOptions, OutputBuilder: factory });
  parser._events = events;
  return parser;
}


// ══════════════════════════════════════════════════════════════════════════════
describe("Position metadata — TagDetail.index points at '<'", function () {

  runAcrossAllInputSourcesWithFactory(
    "root tag index should be 0 (position of '<', not past '>')",
    `<root><child>x</child></root>`,
    (result, inputType, parser) => {
      const evts = parser._events;
      const root = evts.find(e => e.name === "root");
      const child = evts.find(e => e.name === "child");
      expect(root.index).toBe(0);
      // <child> starts right after <root> (6 chars)
      expect(child.index).toBe(6);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      addElement(tag, matcher) {
        events.push({ name: tag.name, index: tag.index });
        super.addElement(tag, matcher);
      }
    })
  );

  runAcrossAllInputSourcesWithFactory(
    "index keeps advancing correctly across a newline",
    `<root>\n  <child>x</child>\n</root>`,
    (result, inputType, parser) => {
      const evts = parser._events;
      const child = evts.find(e => e.name === "child");
      // <root>\n  = 6 + 1 + 2 = 9 chars before <child>
      expect(child.index).toBe(9);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      addElement(tag, matcher) {
        events.push({ name: tag.name, index: tag.index });
        super.addElement(tag, matcher);
      }
    })
  );

});


// ══════════════════════════════════════════════════════════════════════════════
describe("Position metadata — TagDetail.openEnd", function () {

  runAcrossAllInputSourcesWithFactory(
    "openEnd should be the offset right after the opening tag's '>'",
    `<root><tag id="1">v</tag></root>`,
    (result, inputType, parser) => {
      const evts = parser._events;
      // <root> is 6 chars — openEnd = 6
      expect(evts.find(e => e.name === "root").openEnd).toBe(6);
      // <tag id="1"> is 12 chars, starts at 6 — openEnd = 18
      expect(evts.find(e => e.name === "tag").openEnd).toBe(6 + `<tag id="1">`.length);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      addElement(tag, matcher) {
        events.push({ name: tag.name, openEnd: tag.openEnd });
        super.addElement(tag, matcher);
      }
    }, { skip: { attributes: false } })
  );

  runAcrossAllInputSourcesWithFactory(
    "openEnd for self-closing tag should be right after '/>'",
    `<root><br/></root>`,
    (result, inputType, parser) => {
      const br = parser._events.find(e => e.name === "br");
      // <br/> starts at 6, is 5 chars — openEnd = 11
      expect(br.index).toBe(6);
      expect(br.openEnd).toBe(11);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      addElement(tag, matcher) {
        events.push({ name: tag.name, index: tag.index, openEnd: tag.openEnd });
        super.addElement(tag, matcher);
      }
    })
  );

  runAcrossAllInputSourcesWithFactory(
    "openEnd and index should together span the full opening tag expression",
    `<root><item a="1" b="2">v</item></root>`,
    (result, inputType, parser) => {
      const item = parser._events.find(e => e.name === "item");
      const tagStr = `<item a="1" b="2">`;
      expect(item.openEnd - item.index).toBe(tagStr.length);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      addElement(tag, matcher) {
        events.push({ name: tag.name, index: tag.index, openEnd: tag.openEnd });
        super.addElement(tag, matcher);
      }
    }, { skip: { attributes: false } })
  );

});


// ══════════════════════════════════════════════════════════════════════════════
describe("Position metadata — closeElement closeMeta", function () {

  runAcrossAllInputSourcesWithFactory(
    "closeMeta.name must always equal the name arg for every close",
    `<root><a>1</a><b>2</b></root>`,
    (result, inputType, parser) => {
      const evts = parser._events;
      expect(evts.map(e => e.name)).toEqual(["a", "b", "root"]);
      for (const e of evts) expect(e.metaName).toBe(e.name);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      closeElement(matcher, closeMeta) {
        events.push({ name: closeMeta?.name, metaName: closeMeta?.name });
        super.closeElement(matcher, closeMeta);
      }
    })
  );

  runAcrossAllInputSourcesWithFactory(
    "normal closing tag provides index (start of '</'), closeEnd (right after '>')",
    `<root><tag>v</tag></root>`,
    (result, inputType, parser) => {
      const tag = parser._events.find(e => e.name === "tag");
      // '</tag>' starts at index 12, ends at 18
      expect(tag.index).toBe(12);
      expect(tag.closeEnd).toBe(18);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      closeElement(matcher, closeMeta) {
        if (closeMeta?.name === "tag") events.push({ name: closeMeta.name, index: closeMeta.index, closeEnd: closeMeta.closeEnd });
        super.closeElement(matcher, closeMeta);
      }
    })
  );

  runAcrossAllInputSourcesWithFactory(
    "self-closing tag closeMeta reuses opening tag position (no separate close token)",
    `<root><item/></root>`,
    (result, inputType, parser) => {
      const item = parser._events.find(e => e.name === "item");
      // <item/> starts at 6, is 7 chars — both index and closeEnd come from open tag
      expect(item.index).toBe(6);
      expect(item.closeEnd).toBe(13);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      closeElement(matcher, closeMeta) {
        events.push({ name: closeMeta?.name, index: closeMeta?.index, closeEnd: closeMeta?.closeEnd });
        super.closeElement(matcher, closeMeta);
      }
    })
  );

  runAcrossAllInputSourcesWithFactory(
    "unpaired tag closeMeta reuses opening tag position",
    `<root><br></root>`,
    (result, inputType, parser) => {
      const br = parser._events.find(e => e.name === "br");
      // <br> starts at 6, is 4 chars
      expect(br.index).toBe(6);
      expect(br.closeEnd).toBe(10);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      closeElement(matcher, closeMeta) {
        events.push({ name: closeMeta?.name, index: closeMeta?.index, closeEnd: closeMeta?.closeEnd });
        super.closeElement(matcher, closeMeta);
      }
    }, { tags: { unpaired: ["br"] } })
  );

  runAcrossAllInputSourcesWithFactory(
    "stop-node closeMeta has only {name, closeEnd} — no fabricated index",
    `<root><script>x</script></root>`,
    (result, inputType, parser) => {
      const script = parser._events.find(e => e.name === "script");
      expect(script.name).toBe("script");
      expect(typeof script.closeEnd).toBe("number");
      // StopNodeProcessor doesn't track '</script' start — this must be absent
      expect(script.index).toBeUndefined();
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      closeElement(matcher, closeMeta) {
        events.push({ ...closeMeta });
        super.closeElement(matcher, closeMeta);
      }
    }, { tags: { stopNodes: ["root.script"] } })
  );

  runAcrossAllInputSourcesWithFactory(
    "autoClose EOF close provides only {name}, no position (no real closing tag was read)",
    `<root><a>1</a><b>2`,  // <b> and <root> never closed
    (result, inputType, parser) => {
      const b = parser._events.find(e => e.name === "b");
      expect(b.name).toBe("b");
      expect(b.index).toBeUndefined();
      expect(b.closeEnd).toBeUndefined();
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      closeElement(matcher, closeMeta) {
        events.push({ ...closeMeta });
        super.closeElement(matcher, closeMeta);
      }
    }, { autoClose: { onEof: "closeAll" } })
  );

});


// ══════════════════════════════════════════════════════════════════════════════
describe("Position metadata — addAttribute attrMeta", function () {

  runAcrossAllInputSourcesWithFactory(
    "attrMeta.index is the absolute document offset of the attribute name",
    // <root id="1" name="x"/>
    //       ^6     ^13
    `<root id="1" name="x"/>`,
    (result, inputType, parser) => {
      const evts = parser._events;
      expect(evts.find(e => e.name === "id").index).toBe(6);
      expect(evts.find(e => e.name === "name").index).toBe(13);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      addAttribute(name, value, matcher, meta) {
        events.push({ name, index: meta?.index });
        super.addAttribute(name, value, matcher);
      }
    }, { skip: { attributes: false }, attributes: { prefix: "" } })
  );

  runAcrossAllInputSourcesWithFactory(
    "attrMeta.index is correct for the second tag in a document, not just the first",
    // <root><tag a="1" b="2"/></root>
    //             ^11  ^17
    `<root><tag a="1" b="2"/></root>`,
    (result, inputType, parser) => {
      const evts = parser._events;
      expect(evts.find(e => e.name === "a").index).toBe(11);
      expect(evts.find(e => e.name === "b").index).toBe(17);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      addAttribute(name, value, matcher, meta) {
        events.push({ name, index: meta?.index });
        super.addAttribute(name, value, matcher);
      }
    }, { skip: { attributes: false }, attributes: { prefix: "" } })
  );

  runAcrossAllInputSourcesWithFactory(
    "attrMeta is present for boolean (valueless) attributes",
    // <root><input disabled/>
    //              ^13
    `<root><input disabled/></root>`,
    (result, inputType, parser) => {
      const disabled = parser._events.find(e => e.name === "disabled");
      expect(disabled.value).toBe(true);
      expect(disabled.index).toBe(13);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      addAttribute(name, value, matcher, meta) {
        events.push({ name, value, index: meta?.index });
        super.addAttribute(name, value, matcher);
      }
    }, { skip: { attributes: false }, attributes: { prefix: "" } })
  );

  runAcrossAllInputSourcesWithFactory(
    "existing builders that override addAttribute(name, value, matcher) still work (backward compat)",
    `<root id="1"/>`,
    (result) => {
      // Old 3-arg override — 4th arg is simply ignored by JS
      expect(result.root["@_id"]).toBe(1);
    },
    () => {
      const base = new CompactBuilderFactory();
      class OldStyleBuilder extends CompactBuilder {
        addAttribute(name, value, matcher) { // no 4th param — must still work
          super.addAttribute(name, value, matcher);
        }
      }
      return new XMLParser({
        skip: { attributes: false },
        OutputBuilder: {
          getInstance: (p, m) => new OldStyleBuilder(p, base.builderOptions, m, base.registry)
        }
      });
    }
  );

});


// ══════════════════════════════════════════════════════════════════════════════
describe("Position metadata — onStopNode stopEnd", function () {

  runAcrossAllInputSourcesWithFactory(
    "stopEnd.index points right after the matched closing tag's '>'",
    `<root><script>var x = 1;</script></root>`,
    (result, inputType, parser) => {
      const evt = parser._events[0];
      expect(evt.tagName).toBe("script");
      // stopEnd is right after '</script>' — i.e. start of '</root>'
      expect(evt.stopEnd.index).toBe(`<root><script>var x = 1;</script>`.length);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      onStopNode(tagDetail, content, matcher, stopEnd) {
        events.push({ tagName: tagDetail.name, stopEnd });
        super.onStopNode(tagDetail, content, matcher);
      }
    }, { tags: { stopNodes: ["root.script"] } })
  );

  runAcrossAllInputSourcesWithFactory(
    "stopEnd.index is consistent with TagDetail.openEnd — openEnd < stopEnd",
    `<root><blob>raw content here</blob></root>`,
    (result, inputType, parser) => {
      const [open, stop] = parser._events;
      expect(open.openEnd).toBeLessThan(stop.stopEnd.index);
      // sanity: openEnd is right after '<blob>', stopEnd is right after '</blob>'
      expect(open.openEnd).toBe(`<root><blob>`.length);
      expect(stop.stopEnd.index).toBe(`<root><blob>raw content here</blob>`.length);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      addElement(tag, matcher) {
        if (tag.name === "blob") events.push({ openEnd: tag.openEnd });
        super.addElement(tag, matcher);
      }
      onStopNode(tagDetail, content, matcher, stopEnd) {
        events.push({ stopEnd });
        super.onStopNode(tagDetail, content, matcher);
      }
    }, { tags: { stopNodes: ["root.blob"] } })
  );

  runAcrossAllInputSourcesWithFactory(
    "nested stop node (nested:true) — stopEnd reflects the *outer* closing tag",
    `<root><box><box>inner</box></box></root>`,
    (result, inputType, parser) => {
      expect(parser._events.length).toBe(1); // outer box only
      const evt = parser._events[0];
      // stopEnd must be past the outer </box>, not the inner one
      expect(evt.stopEnd.index).toBe(`<root><box><box>inner</box></box>`.length);
    },
    () => makeRecordingParser(events => class extends CompactBuilder {
      onStopNode(tagDetail, content, matcher, stopEnd) {
        events.push({ stopEnd });
        super.onStopNode(tagDetail, content, matcher);
      }
    }, { tags: { stopNodes: [{ expression: "root.box", nested: true }] } })
  );

});


// ══════════════════════════════════════════════════════════════════════════════
describe("Position metadata — backward compatibility", function () {

  runAcrossAllInputSourcesWithFactory(
    "builder with old closeElement(matcher) single-arg signature still works",
    `<root><a>1</a><b>2</b></root>`,
    (result) => {
      expect(result.root.a).toBe(1);
      expect(result.root.b).toBe(2);
    },
    () => {
      const base = new CompactBuilderFactory();
      class OldCloseBuilder extends CompactBuilder {
        closeElement(matcher) { super.closeElement(matcher); } // ignores closeMeta — must still work
      }
      return new XMLParser({
        OutputBuilder: {
          getInstance: (p, m) => new OldCloseBuilder(p, base.builderOptions, m, base.registry)
        }
      });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "default CompactBuilder output is identical before and after v1.5.0",
    `<root><item id="1">value</item></root>`,
    (result) => {
      expect(result.root.item["@_id"]).toBe(1);
      expect(result.root.item["#text"]).toBe("value");
    },
    () => new XMLParser({ skip: { attributes: false } })
  );

});
