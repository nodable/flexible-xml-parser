import { buildOptions, registerCommonValueParsers } from './ParserOptionsBuilder.js';
import numParser from '../ValueParsers/number.js';
import BaseOutputBuilder, { ElementType } from './BaseOutputBuilder.js';

const rootName = '^';

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
    return new JsMinArrBuilder(parserOptions, this.options, parsers);
  }
}

class JsMinArrBuilder extends BaseOutputBuilder {

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
    };

    this.registeredParsers = registeredParsers;

    this.root = { [rootName]: [] };
    this.currentNode = this.root;
    this.currentNodeTagName = rootName;
    this.attributes = {};
  }

  addTag(tag, matcher) {
    if (tag.name === "__proto__") tag.name = "#__proto__";
    this.currentMatcher = matcher;
    this.tagsStack.push([this.currentNodeTagName, this.currentNode]);
    this.currentNodeTagName = tag.name;
    this.currentNode = { [tag.name]: [] };
    if (Object.keys(this.attributes).length > 0) {
      this.currentNode[":@"] = this.attributes;
      this.attributes = {};
    }
  }

  closeTag(matcher) {
    const node = this.currentNode;
    const arr = this.tagsStack.pop();
    this.currentNodeTagName = arr[0];
    this.currentNode = arr[1];

    if (this.options.onClose !== undefined) {
      const resultTag = this.options.onClose(node, matcher);
      if (resultTag) return;
    }
    this.currentNode[this.currentNodeTagName].push(node);
  }

  _addChild(key, val) {
    this.currentNode.push({ [key]: val });
  }

  addValue(text, matcher) {
    const context = {
      elementName: this.currentNodeTagName,
      elementValue: text,
      elementType: ElementType.TAG,
      matcher: matcher,
      isLeafNode: this.currentNode[this.currentNodeTagName]?.length === 0,
    };
    this.currentNode[this.currentNodeTagName].push({
      [this.options.nameFor.text]: this.parseValue(text, this.options.tags.valueParsers, context)
    });
  }

  addPi(name) {
    const node = { [name]: [] };
    if (this.attributes) node[":@"] = this.attributes;
    this.currentNode.push(node);
    this.attributes = {};
  }

  getOutput() {
    const rootChildren = this.root[rootName];
    if (rootChildren.length === 0) return undefined;
    const firstChild = rootChildren[0];
    const tagname = Object.keys(firstChild).find(k => k !== ':@');
    const node = { tagname, child: firstChild[tagname] };
    if (firstChild[':@']) node[':@'] = firstChild[':@'];
    return node;
  }
}

export { JsMinArrBuilder };
