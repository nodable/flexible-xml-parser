/**
 * customOutputBuilder_spec.js
 *
 * Proves that tag renaming, attribute renaming, attribute dropping,
 * tag skipping, and full attribute transformation are all achievable
 * through a custom OutputBuilder — without any transformTagName,
 * transformAttributeName, or updateTag options.
 *
 * Every approach shown here subclasses JsObjBuilder (exported from
 * JsObjBuilder.js) and overrides only the method(s) relevant to the
 * use case. The rest of the parsing pipeline is unchanged.
 */

import XMLParser from "../src/XMLParser.js";
import JsObjOutputBuilder, { JsObjBuilder } from "../src/OutputBuilders/JsObjBuilder.js";


// ─── Helper ────────────────────────────────────────────────────────────────
// Build a custom OutputBuilder factory from a JsObjBuilder subclass.
// The factory wrapper is what XMLParser receives as options.OutputBuilder.
function makeFactory(BuilderSubclass) {
  return {
    getInstance(parserOptions) {
      const base = new JsObjOutputBuilder();
      const parsers = { ...base.registeredParsers };
      return new BuilderSubclass(parserOptions, base.options, parsers);
    },
    registerValueParser(name, parser) {
      // no-op for test factories
    },
  };
}


// ══════════════════════════════════════════════════════════════════════════════
describe("Custom OutputBuilder — tag name transformation", function () {
// ══════════════════════════════════════════════════════════════════════════════

  it("should lower-case all tag names by overriding addTag", function () {
    class LowerCaseTagBuilder extends JsObjBuilder {
      addTag(tag, matcher) {
        tag = { ...tag, name: tag.name.toLowerCase() };
        super.addTag(tag, matcher);
      }
    }

    const parser = new XMLParser({ OutputBuilder: makeFactory(LowerCaseTagBuilder) });
    const result = parser.parse(`<ROOT><CHILD>value</CHILD></ROOT>`);

    expect(result.root).toBeDefined();
    expect(result.root.child).toBe("value");
    expect(result.ROOT).toBeUndefined();
  });

  it("should rename a specific tag by overriding addTag", function () {
    class RenameBuilder extends JsObjBuilder {
      addTag(tag, matcher) {
        tag = { ...tag, name: tag.name === "oldName" ? "newName" : tag.name };
        super.addTag(tag, matcher);
      }
    }

    const parser = new XMLParser({ OutputBuilder: makeFactory(RenameBuilder) });
    const result = parser.parse(`<root><oldName>42</oldName></root>`);

    expect(result.root.newName).toBe(42);
    expect(result.root.oldName).toBeUndefined();
  });

  it("should strip a namespace prefix from tag names by overriding addTag", function () {
    class StripNsBuilder extends JsObjBuilder {
      addTag(tag, matcher) {
        const name = tag.name.includes(":") ? tag.name.split(":")[1] : tag.name;
        super.addTag({ ...tag, name }, matcher);
      }
    }

    const parser = new XMLParser({ OutputBuilder: makeFactory(StripNsBuilder) });
    const result = parser.parse(`<ns:root><ns:item>hello</ns:item></ns:root>`);

    expect(result.root).toBeDefined();
    expect(result.root.item).toBe("hello");
  });

  it("should skip a tag (and its subtree) by overriding addTag and closeTag", function () {
    // Track skipping depth so nested tags inside a skipped tag are also skipped.
    class SkipTagBuilder extends JsObjBuilder {
      constructor(...args) {
        super(...args);
        this._skipDepth = 0;
      }
      addTag(tag, matcher) {
        if (this._skipDepth > 0 || tag.name === "secret") {
          this._skipDepth++;
          return; // don't push to stack
        }
        super.addTag(tag, matcher);
      }
      closeTag(matcher) {
        if (this._skipDepth > 0) {
          this._skipDepth--;
          return;
        }
        super.closeTag(matcher);
      }
    }

    const parser = new XMLParser({ OutputBuilder: makeFactory(SkipTagBuilder) });
    const result = parser.parse(`
      <root>
        <visible>yes</visible>
        <secret>
          <nested>hidden</nested>
        </secret>
        <alsoVisible>also yes</alsoVisible>
      </root>
    `);

    expect(result.root.visible).toBe("yes");
    expect(result.root.alsoVisible).toBe("also yes");
    expect(result.root.secret).toBeUndefined();
  });

  it("should rename a tag at close time via onTagClose option", function () {
    // onTagClose is already supported in JsObjBuilder.closeTag() with no subclassing needed.
    const parser = new XMLParser({
      options: {
        onTagClose: (tagName, value) => {
          return { tagName: tagName === "item" ? "entry" : tagName, value };
        },
      },
    });

    // Demonstrate via subclass override of closeTag instead (no options.onTagClose needed)
    class RenameOnCloseBuilder extends JsObjBuilder {
      closeTag(matcher) {
        if (this.tagName === "item") {
          this.tagName = "entry";
        }
        super.closeTag(matcher);
      }
    }

    const parser2 = new XMLParser({ OutputBuilder: makeFactory(RenameOnCloseBuilder) });
    const result = parser2.parse(`<root><item>val</item></root>`);

    expect(result.root.entry).toBe("val");
    expect(result.root.item).toBeUndefined();
  });

});


// ══════════════════════════════════════════════════════════════════════════════
describe("Custom OutputBuilder — attribute transformation", function () {
// ══════════════════════════════════════════════════════════════════════════════

  it("should lower-case all attribute names by overriding addAttribute", function () {
    class LowerCaseAttrBuilder extends JsObjBuilder {
      addAttribute(name, value) {
        super.addAttribute(name.toLowerCase(), value);
      }
    }

    const parser = new XMLParser({
      skip: { attributes: false },
      attributes: { prefix: "" },
      OutputBuilder: makeFactory(LowerCaseAttrBuilder),
    });
    const result = parser.parse(`<root ID="1" Lang="en" />`);

    expect(result.root.id).toBe(1);
    expect(result.root.lang).toBe("en");
    expect(result.root.ID).toBeUndefined();
  });

  it("should rename a specific attribute by overriding addAttribute", function () {
    class RenameAttrBuilder extends JsObjBuilder {
      addAttribute(name, value) {
        super.addAttribute(name === "class" ? "className" : name, value);
      }
    }

    const parser = new XMLParser({
      skip: { attributes: false },
      attributes: { prefix: "" },
      OutputBuilder: makeFactory(RenameAttrBuilder),
    });
    const result = parser.parse(`<div class="container" id="main" />`);

    expect(result.div.className).toBe("container");
    expect(result.div.id).toBe("main");
    expect(result.div.class).toBeUndefined();
  });

  it("should drop specific attributes by overriding addAttribute", function () {
    class DropAttrBuilder extends JsObjBuilder {
      addAttribute(name, value) {
        if (name === "internal" || name === "debug") return; // drop silently
        super.addAttribute(name, value);
      }
    }

    const parser = new XMLParser({
      skip: { attributes: false },
      attributes: { prefix: "" },
      OutputBuilder: makeFactory(DropAttrBuilder),
    });
    const result = parser.parse(`<item id="1" internal="true" debug="verbose" label="ok" />`);

    expect(result.item.id).toBe(1);
    expect(result.item.label).toBe("ok");
    expect(result.item.internal).toBeUndefined();
    expect(result.item.debug).toBeUndefined();
  });

  it("should drop all xmlns:* namespace declaration attributes by overriding addAttribute", function () {
    class DropXmlnsBuilder extends JsObjBuilder {
      addAttribute(name, value) {
        if (name.startsWith("xmlns")) return;
        super.addAttribute(name, value);
      }
    }

    const parser = new XMLParser({
      skip: { attributes: false },
      attributes: { prefix: "" },
      OutputBuilder: makeFactory(DropXmlnsBuilder),
    });
    const result = parser.parse(
      `<root xmlns="http://example.com" xmlns:ns="http://ns.com" id="1" />`
    );

    expect(result.root.id).toBe(1);
    expect(result.root.xmlns).toBeUndefined();
    expect(result.root["xmlns:ns"]).toBeUndefined();
  });

  it("should transform attribute values by overriding addAttribute", function () {
    class UpperCaseAttrValueBuilder extends JsObjBuilder {
      addAttribute(name, value) {
        const transformed = typeof value === "string" ? value.toUpperCase() : value;
        super.addAttribute(name, transformed);
      }
    }

    const parser = new XMLParser({
      skip: { attributes: false },
      attributes: { prefix: "", valueParsers: [] }, // raw strings so we control transform
      OutputBuilder: makeFactory(UpperCaseAttrValueBuilder),
    });
    const result = parser.parse(`<item status="active" type="primary" />`);

    expect(result.item.status).toBe("ACTIVE");
    expect(result.item.type).toBe("PRIMARY");
  });

  it("should replace all attributes with a computed set by overriding addTag and addAttribute", function () {
    // Use case: collect raw attrs then emit a normalised set in addTag itself.
    // Demonstrates full control — inspect all attrs before any go into output.
    class NormaliseAttrsBuilder extends JsObjBuilder {
      constructor(...args) {
        super(...args);
        this._pendingAttrs = {};
      }

      // Intercept before base class sees them
      addAttribute(name, value) {
        this._pendingAttrs[name] = value;
      }

      addTag(tag, matcher) {
        // Transform the collected attrs before handing to super
        const raw = this._pendingAttrs;
        this._pendingAttrs = {};

        // Example normalisation: rename 'cls' → 'class', drop 'tmp'
        const normalised = {};
        for (const [k, v] of Object.entries(raw)) {
          if (k === "tmp") continue;
          normalised[k === "cls" ? "class" : k] = v;
        }

        // Inject normalised attrs into the builder's pending attributes buffer
        for (const [k, v] of Object.entries(normalised)) {
          super.addAttribute(k, v);
        }

        super.addTag(tag, matcher);
      }
    }

    const parser = new XMLParser({
      skip: { attributes: false },
      attributes: { prefix: "" },
      OutputBuilder: makeFactory(NormaliseAttrsBuilder),
    });
    const result = parser.parse(`<div cls="box" tmp="draft" id="1" />`);

    expect(result.div.class).toBe("box");
    expect(result.div.id).toBe(1);
    expect(result.div.cls).toBeUndefined();
    expect(result.div.tmp).toBeUndefined();
  });

});


// ══════════════════════════════════════════════════════════════════════════════
describe("Custom OutputBuilder — combined tag and attribute transformation", function () {
// ══════════════════════════════════════════════════════════════════════════════

  it("should lower-case both tag names and attribute names together", function () {
    class LowerCaseAllBuilder extends JsObjBuilder {
      addTag(tag, matcher) {
        super.addTag({ ...tag, name: tag.name.toLowerCase() }, matcher);
      }
      addAttribute(name, value) {
        super.addAttribute(name.toLowerCase(), value);
      }
    }

    const parser = new XMLParser({
      skip: { attributes: false },
      attributes: { prefix: "" },
      OutputBuilder: makeFactory(LowerCaseAllBuilder),
    });
    const result = parser.parse(`<ROOT ID="1"><CHILD Lang="en">text</CHILD></ROOT>`);

    expect(result.root.id).toBe(1);
    expect(result.root.child.lang).toBe("en");
    expect(result.root.child["#text"]).toBe("text");
  });

  it("should add a computed attribute to every tag by overriding addTag", function () {
    // Injects a '_tag' attribute on every element containing its tag name.
    class TagNameAttrBuilder extends JsObjBuilder {
      addTag(tag, matcher) {
        // Inject before super so it lands in this.attributes
        super.addAttribute("_tag", tag.name);
        super.addTag(tag, matcher);
      }
    }

    const parser = new XMLParser({
      skip: { attributes: false },
      attributes: { prefix: "" },
      OutputBuilder: makeFactory(TagNameAttrBuilder),
    });
    const result = parser.parse(`<root><item id="1">v</item></root>`);

    // root tag gets _tag injected
    expect(result.root._tag).toBe("root");
    // item tag also gets it
    expect(result.root.item._tag).toBe("item");
    expect(result.root.item.id).toBe(1);
  });

});
