
//OrderedOutputBuilder

import { buildOptions, registerCommonValueParsers } from './ParserOptionsBuilder.js';
import numParser from '../ValueParsers/number.js';
import BaseOutputBuilder, { ElementType } from './BaseOutputBuilder.js';

const rootName = '!js_arr';

export default class OutputBuilder {
  constructor(options) {
    this.options = buildOptions(options);
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
    return new JsArrBuilder(parserOptions, this.options, parsers);
  }
}

class JsArrBuilder extends BaseOutputBuilder {

  constructor(parserOptions, builderOptions, registeredParsers) {
    super();
    this.tagsStack = [];
    this.parserOptions = parserOptions;

    this.options = {
      ...builderOptions,
      ...parserOptions,
      skip: { ...builderOptions.skip, ...parserOptions.skip },
      nameFor: { ...builderOptions.nameFor, ...parserOptions.nameFor },
      tags: { ...builderOptions.tags, ...parserOptions.tags },
      attributes: { ...builderOptions.attributes, ...parserOptions.attributes },
      compactLeaf: builderOptions.compactLeaf === true
    };

    this.registeredParsers = registeredParsers;

    this.root = new Node(rootName);
    this.currentNode = this.root;
    this.attributes = {};
    this._pendingStopNode = false;
  }

  addTag(tag, matcher) {
    this.tagsStack.push(this.currentNode);
    this.currentNode = new Node(tag.name, this.attributes);
    this.attributes = {};
  }

  /**
   * Called when a stop node is fully collected, before `addValue`.
   *
   * @param {TagDetail}       tagDetail  - name, line, col, index of the stop node
   * @param {string}          rawContent - raw unparsed content between the tags
   * @param {ReadonlyMatcher} matcher    - read-only path matcher
   */
  onStopNode(tagDetail, rawContent, matcher) {
    this._pendingStopNode = true;
    if (typeof this.options.onStopNode === 'function') {
      this.options.onStopNode(tagDetail, rawContent, matcher);
    }
  }

  closeTag(matcher) {
    const node = this.currentNode;
    this.currentNode = this.tagsStack.pop();

    // Compact Stop Node
    const isStopNode = this._pendingStopNode;
    this._pendingStopNode = false;

    if (this.options.onClose !== undefined) {
      const resultTag = this.options.onClose(node, matcher);
      if (resultTag) return;
    }

    // Compact Leaf
    if (this.options.compactLeaf && !node[":@"]) {
      const textKey = this.options.nameFor.text;

      const isSingleTextChild =
        node.child.length === 1 &&
        Object.prototype.hasOwnProperty.call(node.child[0], textKey) &&
        Object.keys(node.child[0]).length === 1;

      const isEmptyLeaf = node.child.length === 0;

      if (isSingleTextChild || isEmptyLeaf) {
        const value = isSingleTextChild ? node.child[0][textKey] : "";
        this.currentNode.child.push({ [node.tagname]: value });
        return;
      }
    }

    this.currentNode.child.push(node);
  }

  _addChild(key, val) {
    this.currentNode.child.push({ [key]: val });
  }

  addValue(text, matcher) {
    const tagName = this.currentNode?.tagname;
    const context = {
      elementName: tagName,
      elementValue: text,
      elementType: ElementType.TAG,
      matcher: matcher,
      isLeafNode: this.currentNode?.child?.length === 0,
    };
    this.currentNode.child.push({
      [this.options.nameFor.text]: this.parseValue(text, this.options.tags.valueParsers, context)
    });
  }

  addPi(name) {
    const node = new Node(name, this.attributes);
    this.currentNode.child.push(node);
    this.attributes = {};
  }

  getOutput() {
    const children = this.root.child;
    if (children.length === 1) return children[0];
    return children;
  }
}

class Node {
  constructor(tagname, attributes) {
    this.tagname = tagname;
    this.child = [];
    if (attributes && Object.keys(attributes).length > 0)
      this[":@"] = attributes;
  }
}

export { JsArrBuilder };