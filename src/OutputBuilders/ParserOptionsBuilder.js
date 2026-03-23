import booleanParser from "../ValueParsers/booleanParser.js";
import currencyParser from "../ValueParsers/currency.js";
import numberParser from "../ValueParsers/number.js";
import trimParser from "../ValueParsers/trim.js";

const defaultOptions = {
  nameFor: {
    text:    "#text",
    comment: "",
    cdata:   "",
  },
  skip: {
    declaration: false,
    pi:          false,
    attributes:  true,
    cdata:       false,
    comment:     false,
    nsPrefix:    false,
    tags:        false,
  },
  tags: {
    valueParsers: [],
    stopNodes:    [],
    separateTextProperty: false,
  },
  attributes: {
    prefix:       "@_",
    suffix:       "",
    groupBy:      "",
    valueParsers: [],
  },
};

// Default chains: replaceEntities first (expand references), then type coercion.
// No 'trim' — the parser does not trim by default.
const defaultTagParsers  = ["replaceEntities", "boolean", "number"];
const defaultAttrParsers = ["replaceEntities", "number",  "boolean"];

export function buildOptions(options) {
  const finalOptions = deepClone(defaultOptions);

  if (!options || options.tags?.valueParsers === undefined) {
    finalOptions.tags.valueParsers = [...defaultTagParsers];
  }
  if (!options || options.attributes?.valueParsers === undefined) {
    finalOptions.attributes.valueParsers = [...defaultAttrParsers];
  }

  if (options) {
    copyProperties(finalOptions, options);
  }

  return finalOptions;
}

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  const clone = {};
  for (const key of Object.keys(obj)) {
    clone[key] = deepClone(obj[key]);
  }
  return clone;
}

function copyProperties(target, source) {
  for (const key of Object.keys(source)) {
    // Guard against prototype pollution via option keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    if (typeof source[key] === 'function') {
      target[key] = source[key];
    } else if (Array.isArray(source[key])) {
      target[key] = source[key];
    } else if (typeof source[key] === 'object' && source[key] !== null) {
      if (typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      copyProperties(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

export function registerCommonValueParsers() {
  return {
    // 'entities' and 'htmlEntities' are injected per-parse by Xml2JsParser
    // (they need the live entityParser instance that holds DocType entities).
    "trim":     new trimParser(),
    "boolean":  new booleanParser(),
    "number":   new numberParser({ hex: true, leadingZeros: true, eNotation: true }),
    "currency": new currencyParser(),
  };
}
