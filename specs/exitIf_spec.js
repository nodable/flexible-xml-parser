import { Expression } from "path-expression-matcher";
import XMLParser from "../src/XMLParser.js";
import {
  runAcrossAllInputSources,
  frunAcrossAllInputSources,
  xrunAcrossAllInputSources,
  runAcrossAllInputSourcesWithException,
} from "./helpers/testRunner.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Basic exitIf — stop on tag name
// ─────────────────────────────────────────────────────────────────────────────
describe("exitIf — basic tag-name matching", function () {

  runAcrossAllInputSources(
    "stops parsing when exitIf returns true for a matching tag",
    `<root>
      <before>visible</before>
      <stop>this tag triggers exit</stop>
      <after>never reached</after>
    </root>`,
    (result) => {
      expect(result.root.before).toBe("visible");
      // <stop> opened → exitIf fires → parser closes all open tags immediately;
      // the text content of <stop> is not yet collected (we exited on open).
      // <after> is never reached.
      expect(result.root.after).toBeUndefined();
    },
    {
      exitIf(matcher) {
        return matcher.matches(new Expression("root.stop"));
      },
    }
  );

  runAcrossAllInputSources(
    "output before exit is fully intact",
    `<root>
      <a>one</a>
      <b>two</b>
      <c>three</c>
      <sentinel/>
      <d>four</d>
    </root>`,
    (result) => {
      expect(result.root.a).toBe("one");
      expect(result.root.b).toBe("two");
      expect(result.root.c).toBe("three");
      // <sentinel> is a self-closing tag — exitIf is NOT called for self-closing
      // tags; only regular pushed tags trigger the check.
      expect(result.root.d).toBeUndefined();
    },
    {
      exitIf(matcher) {
        return matcher.matches(new Expression("root.d"));
      },
    }
  );

  runAcrossAllInputSources(
    "exitIf never fires when condition is never true",
    `<root>
      <a>one</a>
      <b>two</b>
    </root>`,
    (result) => {
      expect(result.root.a).toBe("one");
      expect(result.root.b).toBe("two");
    },
    {
      exitIf(matcher) {
        return matcher.matches(new Expression("root.nonexistent"));
      },
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. wasExited reflection
// ─────────────────────────────────────────────────────────────────────────────
describe("exitIf — wasExited reflection", function () {

  it("wasExited returns true when exitIf fired", function () {
    const parser = new XMLParser({
      exitIf(matcher) {
        return matcher.matches(new Expression("root.stop"));
      },
    });
    parser.parse(`<root><before>ok</before><stop>here</stop><after>never</after></root>`);
    expect(parser.wasExited).toBe(true);
  });

  it("wasExited returns false when exitIf never fires", function () {
    const parser = new XMLParser({
      exitIf(matcher) {
        return false;
      },
    });
    parser.parse(`<root><a>ok</a></root>`);
    expect(parser.wasExited).toBe(false);
  });

  it("wasExited returns false when exitIf is not configured", function () {
    const parser = new XMLParser();
    parser.parse(`<root><a>ok</a></root>`);
    expect(parser.wasExited).toBe(false);
  });

  it("wasExited resets between consecutive parse() calls", function () {
    const parser = new XMLParser({
      exitIf(matcher) {
        return matcher.matches(new Expression("root.stop"));
      },
    });
    parser.parse(`<root><stop/></root>`);
    // Self-closing — exitIf not called on self-closing tags.
    // Parse a doc that actually triggers:
    parser.parse(`<root><stop>x</stop></root>`);
    expect(parser.wasExited).toBe(true);

    // Second parse with a doc that doesn't trigger
    parser.parse(`<root><a>ok</a></root>`);
    expect(parser.wasExited).toBe(false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Depth / nesting — exit at nested tag
// ─────────────────────────────────────────────────────────────────────────────
describe("exitIf — nested tags", function () {

  runAcrossAllInputSources(
    "exits at a deeply nested tag; ancestors are closed cleanly",
    `<root>
      <level1>
        <level2>
          <level3>deep</level3>
          <sibling>never</sibling>
        </level2>
      </level1>
      <after>never</after>
    </root>`,
    (result) => {
      // exitIf fires when <level3> opens; level3 gets no text content,
      // level2 and level1 are closed. <after> is never visited.
      expect(result.root.level1).toBeDefined();
      expect(result.root.level1.level2).toBeDefined();
      expect(result.root.after).toBeUndefined();
    },
    {
      exitIf(matcher) {
        return matcher.matches(new Expression("..level3"));
      },
    }
  );

  runAcrossAllInputSources(
    "exits on second occurrence of a repeated tag",
    `<root>
      <item>first</item>
      <item>second triggers exit</item>
      <item>third</item>
    </root>`,
    (result) => {
      // first <item> closes normally; second <item> open triggers exit.
      // Only one item in output (the completed first one).
      const items = Array.isArray(result.root.item)
        ? result.root.item
        : [result.root.item];
      expect(items.length).toBe(1);
      expect(items[0]).toBe("first");
    },
    {
      exitIf(matcher) {
        return matcher.matches(new Expression("root.item:nth(1)"))
      },
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. exitIf + attributes (matcher has attribute data)
// ─────────────────────────────────────────────────────────────────────────────
describe("exitIf — matching on attributes", function () {

  runAcrossAllInputSources(
    "exits when a specific attribute value is matched",
    `<root>
      <item id="1">one</item>
      <item id="2">two</item>
      <item id="stop">this triggers exit</item>
      <item id="4">four</item>
    </root>`,
    (result) => {
      // items id=1 and id=2 complete; id=stop opens → exit.
      const items = Array.isArray(result.root.item)
        ? result.root.item
        : result.root.item !== undefined ? [result.root.item] : [];
      expect(items.length).toBe(2);
    },
    {
      skip: { attributes: false },
      exitIf(matcher) {
        return matcher.matches(new Expression("root.item[id=stop]"))
      },
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. exitIf co-exists with other features
// ─────────────────────────────────────────────────────────────────────────────
describe("exitIf — coexistence with other features", function () {

  runAcrossAllInputSources(
    "exitIf works alongside skip.tags",
    `<root>
      <keep>visible</keep>
      <drop><secret>gone</secret></drop>
      <stop>exits here</stop>
      <after>never</after>
    </root>`,
    (result) => {
      expect(result.root.keep).toBe("visible");
      expect(result.root.drop).toBeUndefined();   // dropped by skip.tags
      expect(result.root.after).toBeUndefined();   // not reached due to exit
    },
    {
      skip: { tags: ["root.drop"] },
      exitIf(matcher) {
        return matcher.matches(new Expression("root.stop"));
      },
    }
  );

  runAcrossAllInputSources(
    "exitIf works alongside stop nodes",
    `<root>
      <script>alert(1)</script>
      <stop>exits here</stop>
      <after>never</after>
    </root>`,
    (result) => {
      expect(result.root.script).toBe("alert(1)");
      expect(result.root.after).toBeUndefined();
    },
    {
      tags: { stopNodes: ["root.script"] },
      exitIf(matcher) {
        return matcher.matches(new Expression("root.stop"));
      },
    }
  );

  runAcrossAllInputSources(
    "exitIf works alongside autoClose (tolerant parsing)",
    `<root>
      <a>one</a>
      <stop>exit here</stop>
      <b>never
    `,
    (result) => {
      expect(result.root.a).toBe("one");
      expect(result.root.b).toBeUndefined();
    },
    {
      autoClose: { onEof: "closeAll", onMismatch: "discard", collectErrors: false },
      exitIf(matcher) {
        return matcher.matches(new Expression("root.stop"));
      },
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 6. feedable (feed/end) input source
// ─────────────────────────────────────────────────────────────────────────────
describe("exitIf — feedable input source", function () {

  it("exits correctly when fed character by character", function () {
    const xml = `<root><before>ok</before><stop>here</stop><after>never</after></root>`;
    const parser = new XMLParser({
      exitIf(matcher) {
        return matcher.matches(new Expression("root.stop"));
      },
    });

    for (let i = 0; i < xml.length; i++) {
      parser.feed(xml[i]);
    }
    const result = parser.end();

    expect(result.root.before).toBe("ok");
    expect(result.root.after).toBeUndefined();
    expect(parser.wasExited).toBe(true);
  });

  it("exits correctly when fed in random-size chunks", function () {
    const xml = `<root><a>one</a><b>two</b><exit>stop</exit><c>three</c></root>`;
    const parser = new XMLParser({
      exitIf(matcher) {
        return matcher.matches(new Expression("root.exit"));
      },
    });

    // Feed in chunks of 7 chars
    for (let i = 0; i < xml.length; i += 7) {
      parser.feed(xml.slice(i, i + 7));
    }
    const result = parser.end();

    expect(result.root.a).toBe("one");
    expect(result.root.b).toBe("two");
    expect(result.root.c).toBeUndefined();
    expect(parser.wasExited).toBe(true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 7. onExit callback on CompactBuilder
// ─────────────────────────────────────────────────────────────────────────────
xdescribe("exitIf — onExit builder callback", function () {
  //TODO: create a custom output builder inherit CompactBuilder and add onExit callback
  xit("attaches non-enumerable __exitInfo to output root", function () {
    const parser = new XMLParser({
      exitIf(matcher) {
        return matcher.matches(new Expression("root.stop"));
      },
    });
    const result = parser.parse(
      `<root><before>ok</before><stop>here</stop><after>never</after></root>`
    );

    // __exitInfo is non-enumerable — invisible to JSON.stringify but accessible
    const info = Object.getOwnPropertyDescriptor(result, "__exitInfo");
    expect(info).toBeDefined();
    expect(info.enumerable).toBe(false);
    expect(info.value.tag).toBe("stop");
    expect(typeof info.value.line).toBe("number");
    expect(typeof info.value.col).toBe("number");
    expect(typeof info.value.index).toBe("number");
    expect(typeof info.value.depth).toBe("number");
  });

  xit("__exitInfo does not appear in JSON.stringify output", function () {
    const parser = new XMLParser({
      exitIf(matcher) {
        return matcher.matches(new Expression("root.stop"));
      },
    });
    const result = parser.parse(`<root><stop>x</stop></root>`);
    const json = JSON.stringify(result);
    expect(json).not.toContain("__exitInfo");
  });

  xit("depth in __exitInfo reflects nesting level at exit", function () {
    const parser = new XMLParser({
      exitIf(matcher) {
        return matcher.matches(new Expression("..inner"));
      },
    });
    const result = parser.parse(
      `<root><outer><inner>deep</inner></outer></root>`
    );
    const { depth } = Object.getOwnPropertyDescriptor(result, "__exitInfo").value;
    // root → outer is depth 1, so tagsStack has [root-sentinel, outer] at exit of inner
    expect(depth).toBeGreaterThanOrEqual(1);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 8. OptionsBuilder validation
// ─────────────────────────────────────────────────────────────────────────────
describe("exitIf — OptionsBuilder validation", function () {

  it("accepts a function as exitIf", function () {
    expect(() =>
      new XMLParser({ exitIf: () => false })
    ).not.toThrow();
  });

  it("accepts null as exitIf (feature disabled)", function () {
    expect(() =>
      new XMLParser({ exitIf: null })
    ).not.toThrow();
  });

  it("accepts undefined / omitted exitIf (feature disabled)", function () {
    expect(() => new XMLParser({})).not.toThrow();
    expect(() => new XMLParser({ exitIf: undefined })).not.toThrow();
  });

  it("throws INVALID_INPUT when exitIf is a non-function truthy value", function () {
    expect(() =>
      new XMLParser({ exitIf: "root.stop" })
    ).toThrowError(/exitIf.*must be a function/i);
  });

  it("throws INVALID_INPUT when exitIf is a number", function () {
    expect(() =>
      new XMLParser({ exitIf: 1 })
    ).toThrowError(/exitIf.*must be a function/i);
  });

  it("throws INVALID_INPUT when exitIf is a plain object", function () {
    expect(() =>
      new XMLParser({ exitIf: { expression: "root.stop" } })
    ).toThrowError(/exitIf.*must be a function/i);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Self-closing tags are not subject to exitIf
// ─────────────────────────────────────────────────────────────────────────────
describe("exitIf — self-closing tags are not exit candidates", function () {

  runAcrossAllInputSources(
    "exitIf is not called for self-closing tags",
    `<root>
      <a>one</a>
      <self-close/>
      <b>two</b>
    </root>`,
    (result) => {
      // If exitIf were called for self-close the spy would catch it and we'd exit
      // before <b>. Since it's NOT called, <b> must be present.
      expect(result.root.b).toBe("two");
    },
    {
      exitIf(matcher) {
        return matcher.matches(new Expression("root.self-close"));
      },
    }
  );

});

// ─────────────────────────────────────────────────────────────────────────────
// 10. exitIf on the very first tag
// ─────────────────────────────────────────────────────────────────────────────
describe("exitIf — exit on very first tag", function () {

  runAcrossAllInputSources(
    "exits immediately on the root tag if exitIf matches it",
    `<root><child>never</child></root>`,
    (result) => {
      // root is opened → exitIf returns true → root is closed with no children.
      // console.log(JSON.stringify(result, null, 2));
      expect(result).toEqual({});
    },
    {
      exitIf(matcher) {
        return matcher.matches(new Expression("root"));
      },
    }
  );

});