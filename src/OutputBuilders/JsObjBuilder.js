import { buildOptions, registerCommonValueParsers } from './ParserOptionsBuilder.js';
import numParser from '../ValueParsers/number.js';
import BaseOutputBuilder, { ElementType } from './BaseOutputBuilder.js';

const rootName = '^';

export default class OutputBuilder {
  constructor(builderOptions) {
    this.options = buildOptions(builderOptions);
    this.registeredParsers = registerCommonValueParsers(this.options);
  }

  registerValueParser(name, parserInstance) {
    this.registeredParsers[name] = parserInstance;
  }

  getInstance(parserOptions) {
    let parsers = { ...this.registeredParsers };
    if (parserOptions && parserOptions.numberParseOptions) {
      parsers['number'] = new numParser(parserOptions.numberParseOptions);
    }
    return new JsObjBuilder(parserOptions, this.options, parsers);
  }
}

class JsObjBuilder extends BaseOutputBuilder {

  constructor(parserOptions, builderOptions, registeredParsers) {
    super();
    this.tagsStack = [];

    this.options = {
      ...builderOptions,
      ...parserOptions,
      skip: { ...builderOptions.skip, ...parserOptions.skip },
      nameFor: { ...builderOptions.nameFor, ...parserOptions.nameFor },
      tags: { ...builderOptions.tags, ...parserOptions.tags },
      attributes: { ...builderOptions.attributes, ...parserOptions.attributes },
    };

    this.registeredParsers = registeredParsers;

    this.root = {};
    this.parent = this.root;
    this.tagName = rootName;
    this.value = {};
    this.textValue = "";
    this.attributes = {};
  }

  addTag(tag, matcher) {
    // Store the read-only matcher so addAttribute() can include it in context.
    // This is the same proxy instance for the lifetime of the parse — it always
    // reflects the current path state without allowing mutation.
    this.currentMatcher = matcher;

    let value = "";
    if (!isEmpty(this.attributes)) {
      if (this.options.attributes.groupBy) {
        value = { [this.options.attributes.groupBy]: this.attributes };
      } else {
        value = this.attributes;
      }
    }

    this.tagsStack.push([this.tagName, this.textValue, this.value]);
    this.tagName = tag.name;
    this.value = value;
    this.textValue = "";
    this.attributes = {};
  }

  closeTag(matcher) {
    const tagName = this.tagName;
    let value = this.value;
    const textValue = this.textValue;

    const isLeafNode = typeof value !== "object" && !Array.isArray(value);

    const context = {
      elementName: tagName,
      elementValue: textValue,
      elementType: ElementType.TAG,
      matcher: matcher,   // read-only proxy
      isLeafNode: isLeafNode,
    };

    if (isLeafNode) {
      value = this.parseValue(textValue, this.options.tags.valueParsers, context);
    } else if (textValue.length > 0) {
      value[this.options.nameFor.text] =
        this.parseValue(textValue, this.options.tags.valueParsers, context);
    }

    let resultTag = { tagName, value };

    if (this.options.onTagClose !== undefined) {
      // Always pass the read-only matcher — never the mutable one
      resultTag = this.options.onTagClose(tagName, value, textValue, matcher);
      if (!resultTag) return;
    }

    const arr = this.tagsStack.pop();
    let parentTag = arr[2];
    parentTag = this._addChildTo(resultTag.tagName, resultTag.value, parentTag);

    this.tagName = arr[0];
    this.textValue = arr[1];
    this.value = parentTag;
  }

  _addChild(key, val) {
    if (typeof this.value === "string") {
      this.value = { [this.options.nameFor.text]: this.value };
    }
    this._addChildTo(key, val, this.value);
    this.attributes = {};
  }

  _addChildTo(key, val, node) {
    if (typeof node === 'string') node = {};
    // Belt-and-suspenders guard: critical prototype keys should never reach here
    // (sanitizeName in Xml2JsParser is the primary defence), but reject them here
    // too so custom OutputBuilder subclasses are also protected.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return node;
    if (!Object.prototype.hasOwnProperty.call(node, key)) {
      node[key] = val;
    } else {
      if (!Array.isArray(node[key])) {
        node[key] = [node[key]];
      }
      node[key].push(val);
    }
    return node;
  }

  addValue(text, matcher) {
    if (this.textValue.length > 0) this.textValue += " " + text;
    else this.textValue = text;
  }

  addPi(name) {
    let value = "";
    if (!isEmpty(this.attributes)) {
      if (this.options.attributes.groupBy) {
        value = { [this.options.attributes.groupBy]: this.attributes };
      } else {
        value = this.attributes;
      }
    }
    this._addChild(name, value);
    this.attributes = {};
  }

  getOutput() {
    return this.value;
  }
}

function isEmpty(obj) {
  return Object.keys(obj).length === 0;
}

export { JsObjBuilder };
