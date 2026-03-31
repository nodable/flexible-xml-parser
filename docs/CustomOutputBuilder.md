# Customising Output with a Custom Builder

Flex XML Parser deliberately removed options like `transformTagName`, `transformAttributeName`,
and `updateTag`. Instead, these responsibilities are handled by subclassing the built-in
`JsObjBuilder`. This keeps the core parser lean while giving you complete, composable control
over the output structure.

This guide shows how to achieve the most common requirements.

---

## The pattern

Every example in this guide follows the same three steps:

```js
import XMLParser from "flex-xml-parser";
import JsObjOutputBuilder, { JsObjBuilder } from "flex-xml-parser/src/OutputBuilders/JsObjBuilder.js";

// 1. Subclass JsObjBuilder and override only the method(s) you need
class MyBuilder extends JsObjBuilder {
  // override addTag, addAttribute, closeTag, or addValue
}

// 2. Wrap it in a factory object that XMLParser knows how to call
const MyBuilderFactory = {
  getInstance(parserOptions) {
    const base = new JsObjOutputBuilder();
    return new MyBuilder(parserOptions, base.options, { ...base.registeredValParsers });
  },
  registerValueParser(name, parser) {
    // implement if you need to register named value parsers on this factory
  },
};

// 3. Pass the factory as OutputBuilder
const parser = new XMLParser({ OutputBuilder: MyBuilderFactory });
```

The four methods you can override:

| Method | Called when | Common use |
|--------|-------------|------------|
| `addElement(tag, matcher)` | An opening tag is encountered | Rename or skip tags |
| `closeElement(matcher)` | A closing tag is encountered | Rename tags at close time, skip subtrees |
| `addAttribute(name, value)` | An attribute is encountered | Rename, drop, or transform attributes |
| `addValue(text, matcher)` | Text content is encountered | Transform text values |

In every override, call `super.method(...)` to continue normal processing. Omit the `super` call to suppress the node entirely.

---

## 1. Transform tag names

### Lower-case all tag names

```js
class LowerCaseTagBuilder extends JsObjBuilder {
  addElement(tag, matcher) {
    super.addElement({ ...tag, name: tag.name.toLowerCase() }, matcher);
  }
}
```

```js
const parser = new XMLParser({ OutputBuilder: makeFactory(LowerCaseTagBuilder) });
parser.parse(`<ROOT><CHILD>value</CHILD></ROOT>`);
// { root: { child: 'value' } }
```

### Rename a specific tag

```js
class RenameTagBuilder extends JsObjBuilder {
  addElement(tag, matcher) {
    const name = tag.name === "Person" ? "person" : tag.name;
    super.addElement({ ...tag, name }, matcher);
  }
}
```

### Strip namespace prefixes

```js
class StripNsPrefixBuilder extends JsObjBuilder {
  addElement(tag, matcher) {
    const name = tag.name.includes(":") ? tag.name.split(":")[1] : tag.name;
    super.addElement({ ...tag, name }, matcher);
  }
}
```

```js
parser.parse(`<ns:root><ns:item>hello</ns:item></ns:root>`);
// { root: { item: 'hello' } }
```

> **Note:** `{ ...tag, name }` creates a new object rather than mutating the original.
> Always spread `tag` instead of writing `tag.name = ...` directly.

---

## 2. Skip a tag and its entire subtree

To skip a tag you need to track nesting depth, because the parser will still call `addTag`
and `closeTag` for every child inside the skipped tag.

```js
class SkipTagBuilder extends JsObjBuilder {
  constructor(...args) {
    super(...args);
    this._skipDepth = 0;
  }

  addElement(tag, matcher) {
    if (this._skipDepth > 0 || tag.name === "internal") {
      this._skipDepth++;
      return; // don't call super — tag is suppressed
    }
    super.addElement(tag, matcher);
  }

  closeElement(matcher) {
    if (this._skipDepth > 0) {
      this._skipDepth--;
      return; // matching close of a suppressed tag
    }
    super.closeElement(matcher);
  }
}
```

```js
parser.parse(`
  <config>
    <host>localhost</host>
    <internal><secret>password</secret></internal>
    <port>5432</port>
  </config>
`);
// { config: { host: 'localhost', port: 5432 } }
```

To skip by a condition other than the tag name, replace `tag.name === "internal"` with any
expression — for example `matcher.path().startsWith("config.debug")`.

---

## 3. Transform attribute names

Enable attribute parsing with `skip: { attributes: false }`.

### Lower-case all attribute names

```js
class LowerCaseAttrBuilder extends JsObjBuilder {
  addAttribute(name, value) {
    super.addAttribute(name.toLowerCase(), value);
  }
}
```

```js
const parser = new XMLParser({
  skip: { attributes: false },
  OutputBuilder: makeFactory(LowerCaseAttrBuilder),
});
parser.parse(`<Item ID="1" Lang="en" />`);
// { Item: { '@_id': 1, '@_lang': 'en' } }
```

### Rename a specific attribute

```js
class RenameAttrBuilder extends JsObjBuilder {
  addAttribute(name, value) {
    super.addAttribute(name === "class" ? "className" : name, value);
  }
}
```

---

## 4. Drop specific attributes

Return without calling `super` to silently drop an attribute.

```js
class DropAttrBuilder extends JsObjBuilder {
  addAttribute(name, value) {
    const INTERNAL = ["debug", "internal", "tmp"];
    if (INTERNAL.includes(name)) return;
    super.addAttribute(name, value);
  }
}
```

```js
parser.parse(`<item id="1" debug="verbose" label="ok" />`);
// { item: { '@_id': 1, '@_label': 'ok' } }
```

---

## 5. Inspect all attributes before any enter the output

`addAttribute` is called once per attribute. If you need to see the complete attribute set
before deciding what to keep — for example to normalise keys that depend on each other —
collect them first, then emit in `addTag`.

```js
class NormaliseAttrsBuilder extends JsObjBuilder {
  constructor(...args) {
    super(...args);
    this._pending = {};
  }

  addAttribute(name, value) {
    // Intercept: collect instead of forwarding to super
    this._pending[name] = value;
  }

  addElement(tag, matcher) {
    // At addTag time we have the complete attribute set for this opening tag.
    // Apply any normalisation, then inject the result into the builder.
    const pending = this._pending;
    this._pending = {};

    for (const [key, val] of Object.entries(pending)) {
      if (key === "tmp") continue;                        // drop
      const finalKey = key === "cls" ? "class" : key;    // rename
      super.addAttribute(finalKey, val);                  // emit
    }

    super.addElement(tag, matcher);
  }
}
```

```js
parser.parse(`<div cls="box" tmp="draft" id="1" />`);
// { div: { '@_class': 'box', '@_id': 1 } }
```

---

## 6. Add a computed attribute to every tag

Inject attributes programmatically by calling `super.addAttribute` before `super.addTag`.
Attributes not present in the XML but added this way appear in the output exactly like real ones.

```js
class InjectAttrBuilder extends JsObjBuilder {
  addElement(tag, matcher) {
    super.addAttribute("_tag", tag.name); // inject before super.addTag
    super.addElement(tag, matcher);
  }
}
```

```js
parser.parse(`<root><item id="1">v</item></root>`);
// { root: { '@__tag': 'root', item: { '@__tag': 'item', '@_id': 1, '#text': 'v' } } }
```

---

## Reusable factory helper

If you are writing multiple custom builders in the same project, extract the factory pattern
into a helper to avoid repetition:

```js
import JsObjOutputBuilder, { JsObjBuilder } from "flex-xml-parser/src/OutputBuilders/JsObjBuilder.js";

export function makeFactory(BuilderClass) {
  return {
    getInstance(parserOptions) {
      const base = new JsObjOutputBuilder();
      return new BuilderClass(parserOptions, base.options, { ...base.registeredValParsers });
    },
    registerValueParser(name, parser) {},
  };
}
```

Then every builder reduces to:

```js
const parser = new XMLParser({ OutputBuilder: makeFactory(LowerCaseTagBuilder) });
```

---

## Combining multiple transformations

All overrides compose naturally in a single subclass:

```js
class NormalisedBuilder extends JsObjBuilder {
  addElement(tag, matcher) {
    super.addElement({ ...tag, name: tag.name.toLowerCase() }, matcher);
  }
  addAttribute(name, value) {
    if (name.startsWith("xmlns")) return;       // drop namespace declarations
    super.addAttribute(name.toLowerCase(), value);
  }
}

const parser = new XMLParser({
  skip: { attributes: false },
  attributes: { prefix: "" },
  OutputBuilder: makeFactory(NormalisedBuilder),
});

parser.parse(`<NS:Root xmlns:NS="http://example.com" ID="1"><NS:Item>v</NS:Item></NS:Root>`);
// { root: { id: 1, item: 'v' } }
```

---

## Quick reference

| Requirement | Override | Technique |
|-------------|----------|-----------|
| Rename tag | `addTag` | `{ ...tag, name: newName }` before `super` |
| Lower-case tag | `addTag` | `tag.name.toLowerCase()` before `super` |
| Skip tag + subtree | `addTag` + `closeTag` | Depth counter; omit `super` calls |
| Rename attribute | `addAttribute` | Pass new name to `super` |
| Drop attribute | `addAttribute` | Return without calling `super` |
| Transform attribute value | `addAttribute` | Transform value before `super` |
| Inspect all attrs together | `addAttribute` + `addTag` | Collect in `_pending`, emit in `addTag` |
| Inject computed attribute | `addTag` | Call `super.addAttribute` before `super.addTag` |
| Transform text content | `addValue` | Transform `text` before `super` |