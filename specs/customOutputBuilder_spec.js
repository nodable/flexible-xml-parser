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
import { runAcrossAllInputSources, runAcrossAllInputSourcesWithFactory } from "./helpers/testRunner.js";


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

  runAcrossAllInputSourcesWithFactory(
    "should lower-case all tag names by overriding addTag",
    `<ROOT><CHILD>value</CHILD></ROOT>`,
    (result) => {
      expect(result.root).toBeDefined();
      expect(result.root.child).toBe("value");
      expect(result.ROOT).toBeUndefined();
    },
    () => {
      class LowerCaseTagBuilder extends JsObjBuilder {
        addTag(tag, matcher) {
          tag = { ...tag, name: tag.name.toLowerCase() };
          super.addTag(tag, matcher);
        }
      }
      return new XMLParser({ OutputBuilder: makeFactory(LowerCaseTagBuilder) });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should rename a specific tag by overriding addTag",
    `<root><oldName>42</oldName></root>`,
    (result) => {
      expect(result.root.newName).toBe(42);
      expect(result.root.oldName).toBeUndefined();
    },
    () => {
      class RenameBuilder extends JsObjBuilder {
        addTag(tag, matcher) {
          tag = { ...tag, name: tag.name === "oldName" ? "newName" : tag.name };
          super.addTag(tag, matcher);
        }
      }
      return new XMLParser({ OutputBuilder: makeFactory(RenameBuilder) });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should strip a namespace prefix from tag names by overriding addTag",
    `<ns:root><ns:item>hello</ns:item></ns:root>`,
    (result) => {
      expect(result.root).toBeDefined();
      expect(result.root.item).toBe("hello");
    },
    () => {
      class StripNsBuilder extends JsObjBuilder {
        addTag(tag, matcher) {
          const name = tag.name.includes(":") ? tag.name.split(":")[1] : tag.name;
          super.addTag({ ...tag, name }, matcher);
        }
      }
      return new XMLParser({ OutputBuilder: makeFactory(StripNsBuilder) });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should skip a tag (and its subtree) by overriding addTag and closeTag",
    `
      <root>
        <visible>yes</visible>
        <secret>
          <nested>hidden</nested>
        </secret>
        <alsoVisible>also yes</alsoVisible>
      </root>
    `,
    (result) => {
      expect(result.root.visible).toBe("yes");
      expect(result.root.alsoVisible).toBe("also yes");
      expect(result.root.secret).toBeUndefined();
    },
    () => {
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
      return new XMLParser({ OutputBuilder: makeFactory(SkipTagBuilder) });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should rename a tag at close time via closeTag override",
    `<root><item>val</item></root>`,
    (result) => {
      expect(result.root.entry).toBe("val");
      expect(result.root.item).toBeUndefined();
    },
    () => {
      class RenameOnCloseBuilder extends JsObjBuilder {
        closeTag(matcher) {
          if (this.tagName === "item") {
            this.tagName = "entry";
          }
          super.closeTag(matcher);
        }
      }
      return new XMLParser({ OutputBuilder: makeFactory(RenameOnCloseBuilder) });
    }
  );

});


// ══════════════════════════════════════════════════════════════════════════════
describe("Custom OutputBuilder — attribute transformation", function () {
  // ══════════════════════════════════════════════════════════════════════════════

  runAcrossAllInputSourcesWithFactory(
    "should lower-case all attribute names by overriding addAttribute",
    `<root ID="1" Lang="en" />`,
    (result) => {
      expect(result.root.id).toBe(1);
      expect(result.root.lang).toBe("en");
      expect(result.root.ID).toBeUndefined();
    },
    () => {
      class LowerCaseAttrBuilder extends JsObjBuilder {
        addAttribute(name, value) {
          super.addAttribute(name.toLowerCase(), value);
        }
      }
      return new XMLParser({
        skip: { attributes: false },
        attributes: { prefix: "" },
        OutputBuilder: makeFactory(LowerCaseAttrBuilder),
      });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should rename a specific attribute by overriding addAttribute",
    `<div class="container" id="main" />`,
    (result) => {
      expect(result.div.className).toBe("container");
      expect(result.div.id).toBe("main");
      expect(result.div.class).toBeUndefined();
    },
    () => {
      class RenameAttrBuilder extends JsObjBuilder {
        addAttribute(name, value) {
          super.addAttribute(name === "class" ? "className" : name, value);
        }
      }
      return new XMLParser({
        skip: { attributes: false },
        attributes: { prefix: "" },
        OutputBuilder: makeFactory(RenameAttrBuilder),
      });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should drop specific attributes by overriding addAttribute",
    `<item id="1" internal="true" debug="verbose" label="ok" />`,
    (result) => {
      expect(result.item.id).toBe(1);
      expect(result.item.label).toBe("ok");
      expect(result.item.internal).toBeUndefined();
      expect(result.item.debug).toBeUndefined();
    },
    () => {
      class DropAttrBuilder extends JsObjBuilder {
        addAttribute(name, value) {
          if (name === "internal" || name === "debug") return; // drop silently
          super.addAttribute(name, value);
        }
      }
      return new XMLParser({
        skip: { attributes: false },
        attributes: { prefix: "" },
        OutputBuilder: makeFactory(DropAttrBuilder),
      });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should drop all xmlns:* namespace declaration attributes by overriding addAttribute",
    `<root xmlns="http://example.com" xmlns:ns="http://ns.com" id="1" />`,
    (result) => {
      expect(result.root.id).toBe(1);
      expect(result.root.xmlns).toBeUndefined();
      expect(result.root["xmlns:ns"]).toBeUndefined();
    },
    () => {
      class DropXmlnsBuilder extends JsObjBuilder {
        addAttribute(name, value) {
          if (name.startsWith("xmlns")) return;
          super.addAttribute(name, value);
        }
      }
      return new XMLParser({
        skip: { attributes: false },
        attributes: { prefix: "" },
        OutputBuilder: makeFactory(DropXmlnsBuilder),
      });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should transform attribute values by overriding addAttribute",
    `<item status="active" type="primary" />`,
    (result) => {
      expect(result.item.status).toBe("ACTIVE");
      expect(result.item.type).toBe("PRIMARY");
    },
    () => {
      class UpperCaseAttrValueBuilder extends JsObjBuilder {
        addAttribute(name, value) {
          const transformed = typeof value === "string" ? value.toUpperCase() : value;
          super.addAttribute(name, transformed);
        }
      }
      return new XMLParser({
        skip: { attributes: false },
        attributes: { prefix: "", valueParsers: [] }, // raw strings so we control transform
        OutputBuilder: makeFactory(UpperCaseAttrValueBuilder),
      });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should replace all attributes with a computed set by overriding addTag and addAttribute",
    `<div cls="box" tmp="draft" id="1" />`,
    (result) => {
      expect(result.div.class).toBe("box");
      expect(result.div.id).toBe(1);
      expect(result.div.cls).toBeUndefined();
      expect(result.div.tmp).toBeUndefined();
    },
    () => {
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
      return new XMLParser({
        skip: { attributes: false },
        attributes: { prefix: "" },
        OutputBuilder: makeFactory(NormaliseAttrsBuilder),
      });
    }
  );

});


// ══════════════════════════════════════════════════════════════════════════════
describe("Custom OutputBuilder — combined tag and attribute transformation", function () {
  // ══════════════════════════════════════════════════════════════════════════════

  runAcrossAllInputSourcesWithFactory(
    "should lower-case both tag names and attribute names together",
    `<ROOT ID="1"><CHILD Lang="en">text</CHILD></ROOT>`,
    (result) => {
      expect(result.root.id).toBe(1);
      expect(result.root.child.lang).toBe("en");
      expect(result.root.child["#text"]).toBe("text");
    },
    () => {
      class LowerCaseAllBuilder extends JsObjBuilder {
        addTag(tag, matcher) {
          super.addTag({ ...tag, name: tag.name.toLowerCase() }, matcher);
        }
        addAttribute(name, value) {
          super.addAttribute(name.toLowerCase(), value);
        }
      }
      return new XMLParser({
        skip: { attributes: false },
        attributes: { prefix: "" },
        OutputBuilder: makeFactory(LowerCaseAllBuilder),
      });
    }
  );

  runAcrossAllInputSourcesWithFactory(
    "should add a computed attribute to every tag by overriding addTag",
    `<root><item id="1">v</item></root>`,
    (result) => {
      // root tag gets _tag injected
      expect(result.root._tag).toBe("root");
      // item tag also gets it
      expect(result.root.item._tag).toBe("item");
      expect(result.root.item.id).toBe(1);
    },
    () => {
      class TagNameAttrBuilder extends JsObjBuilder {
        addTag(tag, matcher) {
          // Inject before super so it lands in this.attributes
          super.addAttribute("_tag", tag.name);
          super.addTag(tag, matcher);
        }
      }
      return new XMLParser({
        skip: { attributes: false },
        attributes: { prefix: "" },
        OutputBuilder: makeFactory(TagNameAttrBuilder),
      });
    }
  );

});