// Main exports
export { default as XMLParser, default } from './XMLParser.js';

// Output Builders
export { default as BaseOutputBuilder, ElementType } from './OutputBuilders/BaseOutputBuilder.js';
export { default as JsObjBuilder } from './OutputBuilders/JsObjBuilder.js';
// JsArrBuilder — published separately, not exported here
// OrderedKeyValueBuilder — published separately, not exported here

// Entity parsing — exported for output builder authors and advanced users
export { default as EntitiesValueParser } from './EntityParser/EntitiesValueParser.js';
export { default as EntitiesParser, defaultXmlEntities, defaultHtmlEntities } from './EntityParser/EntitiesParser.js';

// Value Parsers
export { default as numberParser } from './OutputBuilders/ValueParsers/number.js';
export { default as booleanParser } from './OutputBuilders/ValueParsers/booleanParser.js';
export { default as booleanParserExt } from './OutputBuilders/ValueParsers/booleanParserExt.js';
export { default as trimParser } from './OutputBuilders/ValueParsers/trim.js';
export { default as currencyParser } from './OutputBuilders/ValueParsers/currency.js';
export { default as joinParser } from './OutputBuilders/ValueParsers/join.js';

// Error handling
export { ParseError, ErrorCode } from './ParseError.js';

// Stop-node utilities
export { xmlEnclosures, quoteEnclosures } from './StopNodeProcessor.js';