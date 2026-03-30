import { buildOptions, registerCommonValueParsers } from './ParserOptionsBuilder.js';
import BaseOutputBuilder, { ElementType } from './BaseOutputBuilder.js';
import { Expression } from 'path-expression-matcher';

const rootName = '^';

export default class OutputBuilder {
  constructor(builderOptions) {
    this.options = buildOptions(builderOptions);
    this.registeredValParsers = registerCommonValueParsers(this.options);

    // Pre-compile any string expressions in alwaysArray to Expression objects once
    if (this.options.alwaysArray) {
      this.options.alwaysArray = this.options.alwaysArray.map(entry =>
        typeof entry === 'string' ? new Expression(entry) : entry
      );
    }
  }

  registerValueParser(name, parserInstance) {
    this.registeredValParsers[name] = parserInstance;
  }

  getInstance(parserOptions, readonlyMatcher) {
    const valParsers = { ...this.registeredValParsers };
    return new JsObjBuilder(parserOptions, this.options, valParsers, readonlyMatcher);
  }
}

class JsObjBuilder extends BaseOutputBuilder {

  constructor(parserOptions, builderOptions, registeredValParsers, readonlyMatcher) {
    super(readonlyMatcher);
    this.tagsStack = [];

    this.options = {
      ...builderOptions,
      ...parserOptions,
      skip: { ...builderOptions.skip, ...parserOptions.skip },
      nameFor: { ...builderOptions.nameFor, ...parserOptions.nameFor },
      tags: { ...builderOptions.tags, ...parserOptions.tags },
      attributes: { ...builderOptions.attributes, ...parserOptions.attributes },
      textJoint: builderOptions.textJoint || "", // when text for a tag is combined from multiple text nodes

      /**
       * Function to determine if a tag should be forced into an array.
       * Called with (matcher, isLeafNode) where:
       * - matcher: ReadOnlyMatcher - path matcher for current tag
       * - isLeafNode: boolean|null - null when not yet determinable
       * Returns: boolean - true to force array, false to veto, undefined to abstain
       */
      forceArray: builderOptions?.forceArray || null,

      /**
       * Array of strings (tag names) or Expression objects.
       * Any match votes true; no match abstains (does not veto).
       * Combined with forceArray using equal-priority voting:
       * - Either explicit false → false (veto wins)
       * - Any true, none false → true
       * - All abstain → false (default)
       */
      alwaysArray: builderOptions?.alwaysArray || [],

      /**
       * Boolean flag that forces creation of a text node for every tag.
       * When true, a text node is always created under nameFor.text even if
       * the tag has no other children or attributes.
       * Default: false (text node created only when tag has attributes or children)
       */
      forceTextNode: builderOptions?.forceTextNode ?? false,
    };

    this.registeredValParsers = registeredValParsers;

    this.root = {};
    this.parent = this.root;
    this.tagName = rootName;
    this.value = {};
    this.textValue = "";
    this.attributes = {};
  }

  addTag(tag) {
    let value = "";
    if (!isEmpty(this.attributes)) {
      if (this.options.attributes.groupBy) {
        value = { [this.options.attributes.groupBy]: this.attributes };
      } else {
        value = this.attributes;
      }
    }

    // Push current tag's value-tree state so closeTag() can restore it.
    // tagName is included so the builder is self-contained — callers do not
    // need to pass the name back in on close.
    this.tagsStack.push([this.tagName, this.textValue, this.value]);
    this.tagName = tag.name;
    this.value = value;
    this.textValue = "";
    this.attributes = {};
  }

  /**
   * Called when a stop node is fully collected, before `addValue`.
   * Fires the user-supplied `onStopNode` callback if one is configured.
   *
   * @param {TagDetail} tagDetail  - Name, line, col, index of the stop node.
   * @param {string}    rawContent - Raw unparsed content between the tags.
   */
  onStopNode(tagDetail, rawContent) {
    if (typeof this.options.onStopNode === 'function') {
      this.options.onStopNode(tagDetail, rawContent, this.matcher);
    }
  }

  /**
   * Combines votes from `alwaysArray` and `forceArray` with equal priority.
   *
   * Voting rules:
   *   - `alwaysArray`: true if any entry matches, undefined (abstain) if none match.
   *     It never votes false — no match is not a veto.
   *   - `forceArray`: returns true / false / undefined directly.
   *
   * Resolution:
   *   - Any voter returns explicit false  → false  (veto wins)
   *   - Any voter returns true, none false → true
   *   - All abstain (undefined)            → false  (default)
   *
   * @param {boolean|null} isLeafNode
   * @returns {boolean}
   */
  _resolveForceArray(isLeafNode) {
    // --- alwaysArray vote ---
    let alwaysVote; // undefined = abstain
    const alwaysArray = this.options.alwaysArray;
    const matched = alwaysArray.some(entry => this.matcher.matches(entry));
    if (matched) alwaysVote = true;
    // no match → alwaysVote stays undefined (abstain, not false)

    // --- forceArray vote ---
    let forceVote; // undefined = abstain
    if (typeof this.options.forceArray === 'function') {
      const result = this.options.forceArray(this.matcher, isLeafNode);
      if (result === true) forceVote = true;
      else if (result === false) forceVote = false;
      // anything else (undefined, null, …) → abstain
    }

    // --- resolution ---
    if (alwaysVote === false || forceVote === false) return false; // veto
    else if (alwaysVote === true || forceVote === true) return true;  // at least one yes
    return false; // all abstain → default
  }

  closeTag() {
    const tagName = this.tagName;
    let value = this.value;
    const textValue = this.textValue;

    // A tag is a leaf node if it has no child elements.
    // It can have attributes and still be a leaf node.
    let isLeafNode;
    if (typeof value !== "object" || Array.isArray(value)) {
      // Empty string or unexpected array → treat as leaf
      isLeafNode = true;
    } else if (isEmpty(value)) {
      // Empty object → no attributes, no children → leaf
      isLeafNode = true;
    } else {
      // Check if value contains ONLY attribute keys (no child elements)
      const attrPrefix = this.options.attributes.prefix;
      const attrGroupBy = this.options.attributes.groupBy;

      if (attrGroupBy) {
        // Attributes are grouped under a single key
        isLeafNode = Object.keys(value).length === 1 && value.hasOwnProperty(attrGroupBy);
      } else {
        // Attributes have a prefix (default "@_")
        isLeafNode = Object.keys(value).every(k => k.startsWith(attrPrefix));
      }
    }

    const context = {
      elementName: tagName,
      elementValue: textValue,
      elementType: ElementType.TAG,
      matcher: this.matcher,
      isLeafNode: isLeafNode,
    };


    if (isLeafNode) {
      // Leaf node: parse the text value
      const parsedText = this.parseValue(textValue, this.options.tags.valueParsers, context);

      if (this.options.forceTextNode) {
        // forceTextNode: always create object with #text, merge any existing attributes
        if (typeof value === 'object' && !isEmpty(value)) {
          // Has attributes - merge text node into the attributes object
          value[this.options.nameFor.text] = parsedText;
        } else {
          // No attributes - create new object with just text node
          value = { [this.options.nameFor.text]: parsedText };
        }
      } else {
        // Normal mode: if no attributes, use plain value; otherwise add text node
        if (typeof value === 'object' && !isEmpty(value)) {
          // Has attributes - add text node
          value[this.options.nameFor.text] = parsedText;
        } else {
          // No attributes - use plain parsed value
          value = parsedText;
        }
      }
    } else if (textValue.length > 0 || this.options.forceTextNode) {
      // Non-leaf node: add text node if there's text OR if forceTextNode is enabled
      const parsedText = this.parseValue(textValue, this.options.tags.valueParsers, context);
      value[this.options.nameFor.text] = parsedText;
    }


    let resultTag = { tagName, value };

    if (this.options.onTagClose !== undefined) {
      resultTag = this.options.onTagClose(tagName, value, textValue, this.matcher);
      if (!resultTag) return;
    }

    const arr = this.tagsStack.pop();
    let parentTag = arr[2];

    // Check if this tag should be forced into an array
    const shouldForceArray = this._resolveForceArray(isLeafNode);

    parentTag = this._addChildTo(resultTag.tagName, resultTag.value, parentTag, shouldForceArray);

    this.tagName = arr[0];
    this.textValue = arr[1];
    this.value = parentTag;
  }

  _addChild(key, val) {
    if (typeof this.value === "string") {
      this.value = { [this.options.nameFor.text]: this.value };
    }
    this._addChildTo(key, val, this.value, false);
    this.attributes = {};
  }

  _addChildTo(key, val, node, forceArray) {
    if (typeof node === 'string') node = {};


    if (!Object.prototype.hasOwnProperty.call(node, key)) {
      // First occurrence of this key
      if (forceArray) {
        node[key] = [val];
      } else {
        node[key] = val;
      }
    } else {
      // Key already exists
      if (!Array.isArray(node[key])) {
        node[key] = [node[key]];
      }
      node[key].push(val);
    }
    return node;
  }

  addValue(text) {
    if (this.textValue.length > 0) this.textValue += this.options.textJoint + text;
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