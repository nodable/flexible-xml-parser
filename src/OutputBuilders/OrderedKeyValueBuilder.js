import { buildOptions, registerCommonValueParsers } from './ParserOptionsBuilder.js';
import BaseOutputBuilder, { ElementType } from './BaseOutputBuilder.js';

const rootName = '!ordered_kv';

export default class OutputBuilder {
  constructor(options) {
    this.options = buildOptions(options);
    this.registeredValParsers = registerCommonValueParsers(this.options);
  }

  registerValueParser(name, parserInstance) {
    this.registeredValParsers[name] = parserInstance;
  }

  getInstance(parserOptions, readonlyMatcher) {
    const valParsers = { ...this.registeredValParsers };
    return new OrderedKeyValBuilder(parserOptions, this.options, valParsers, readonlyMatcher);
  }
}

class OrderedKeyValBuilder extends BaseOutputBuilder {

  constructor(parserOptions, builderOptions, registeredValParsers, readonlyMatcher) {
    super(readonlyMatcher);
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

    this.registeredValParsers = registeredValParsers;

    this.root = new Node(rootName);
    this.currentNode = this.root;
    this.attributes = {};
    this._pendingStopNode = false;
  }

  addTag(tag) {
    this.tagsStack.push(this.currentNode);
    this.currentNode = new Node(tag.name, this.attributes);
    this.attributes = {};
  }

  /**
   * Called when a stop node is fully collected, before `addValue`.
   *
   * @param {TagDetail}       tagDetail  - name, line, col, index of the stop node
   * @param {string}          rawContent - raw unparsed content between the tags
   */
  onStopNode(tagDetail, rawContent) {
    this._pendingStopNode = true;
    if (typeof this.options.onStopNode === 'function') {
      this.options.onStopNode(tagDetail, rawContent, this.matcher);
    }
  }

  closeTag() {
    const node = this.currentNode;
    this.currentNode = this.tagsStack.pop();

    // Compact Stop Node
    const isStopNode = this._pendingStopNode;
    this._pendingStopNode = false;

    if (this.options.onClose !== undefined) {
      const resultTag = this.options.onClose(node, this.matcher);
      if (resultTag) return;
    }

    // Compact Leaf
    if (this.options.compactLeaf && !node.attributes) {
      const textKey = this.options.nameFor.text;

      const isSingleTextChild =
        node.children.length === 1 &&
        Object.prototype.hasOwnProperty.call(node.children[0], textKey) &&
        Object.keys(node.children[0]).length === 1;

      const isEmptyLeaf = node.children.length === 0;

      if (isSingleTextChild || isEmptyLeaf) {
        const value = isSingleTextChild ? node.children[0][textKey] : "";
        this.currentNode.children.push({ [node.tagname]: value });
        return;
      }
    }

    // Convert node to ordered key-value format
    const keyValNode = this._convertToKeyVal(node);
    this.currentNode.children.push(keyValNode);
  }

  _convertToKeyVal(node) {
    const result = {};

    // If node has attributes, include them with ":@" prefix
    if (node.attributes && Object.keys(node.attributes).length > 0) {
      result[node.tagname] = node.children;
      // You might want to handle attributes differently based on your needs
      // For now, they're not included in the output to match your example
    } else {
      result[node.tagname] = node.children;
    }

    return result;
  }

  _addChild(key, val) {
    this.currentNode.children.push({ [key]: val });
  }

  addValue(text) {
    const tagName = this.currentNode?.tagname;
    const context = {
      elementName: tagName,
      elementValue: text,
      elementType: ElementType.TAG,
      matcher: this.matcher,
      isLeafNode: this.currentNode?.children?.length === 0,
    };
    this.currentNode.children.push({
      [this.options.nameFor.text]: this.parseValue(text, this.options.tags.valueParsers, context)
    });
  }

  addPi(name) {
    const node = new Node(name, this.attributes);
    const keyValNode = this._convertToKeyVal(node);
    this.currentNode.children.push(keyValNode);
    this.attributes = {};
  }

  getOutput() {
    const children = this.root.children;
    if (children.length === 1) return children;
    return children;
  }
}

class Node {
  constructor(tagname, attributes) {
    this.tagname = tagname;
    this.children = [];
    if (attributes && Object.keys(attributes).length > 0)
      this.attributes = attributes;
  }
}

export { OrderedKeyValBuilder };