'use strict';

const nameStartChar = ':A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const nameChar = nameStartChar + '\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
export const nameRegexp = '[' + nameStartChar + '][' + nameChar + ']*';
const regexName = new RegExp('^' + nameRegexp + '$');

export function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}

export const isName = function (string) {
  const match = regexName.exec(string);
  return !(match === null || typeof match === 'undefined');
}

export function isSpace(char) {
  return char === " " || char === "\t" || char === "\n" || char === "\r" || char === "\f";
}


export function isSpaceCode(code) {
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 12; // space \t \n \r \f
}

export function isExist(v) {
  return typeof v !== 'undefined';
}

export function isEmptyObject(obj) {
  return Object.keys(obj).length === 0;
}

export function getValue(v) {
  if (isExist(v)) {
    return v;
  } else {
    return '';
  }
}

export const DANGEROUS_PROPERTY_NAMES = [
  'hasOwnProperty',
  'toString',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  "toLocaleString",
  "isPrototypeOf",
  "propertyIsEnumerable"
];

export const criticalProperties = ["__proto__", "constructor", "prototype"];
