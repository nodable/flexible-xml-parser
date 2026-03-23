import { isName } from './util.js';
import { ParseError, ErrorCode } from './ParseError.js';

export function readDocType(parser) {
    // <!D are already consumed by the caller up to this point
    let str = parser.source.readStr(6); // "OCTYPE"
    parser.source.updateBufferBoundary(6);

    if (str !== "OCTYPE") {
        throw new ParseError(
            `Invalid DOCTYPE expression at ${parser.source.line}:${parser.source.cols}`,
            ErrorCode.INVALID_TAG,
            { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
        );
    }

    const entities = Object.create(null);
    let entityCount = 0;
    let hasBody = false;  // true once '[' is seen
    let bodyDone = false; // true once ']' is seen — next '>' closes the DOCTYPE

    while (parser.source.canRead()) {
        let ch = parser.source.readCh();

        if (ch === '<' && hasBody && !bodyDone) {
            // Inside [...] body — read "!" then the type character
            let bang = parser.source.readStr(1);
            parser.source.updateBufferBoundary(1);
            if (bang !== "!") throw new ParseError(
                `Invalid DOCTYPE body tag starting with "<${bang}"`,
                ErrorCode.INVALID_TAG,
                { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
            );

            let typeChar = parser.source.readStr(1);
            parser.source.updateBufferBoundary(1);

            if (typeChar === "-") {
                // <!-- comment --> — consume through "-->"
                let dash2 = parser.source.readStr(1);
                parser.source.updateBufferBoundary(1);
                if (dash2 !== "-") throw new ParseError(
                    "Invalid comment in DOCTYPE",
                    ErrorCode.INVALID_TAG,
                    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                );
                parser.source.readUpto("-->"); // consumes comment body and closing "-->"

            } else if (typeChar === "E") {
                // ENTITY or ELEMENT — one more char distinguishes them
                let typeChar2 = parser.source.readStr(1);
                parser.source.updateBufferBoundary(1);

                if (typeChar2 === "N") {
                    // <!ENTITY — consume "TITY"
                    let rest = parser.source.readStr(4);
                    parser.source.updateBufferBoundary(4);
                    if (rest !== "TITY") throw new ParseError(
                        "Invalid DOCTYPE ENTITY expression",
                        ErrorCode.INVALID_TAG,
                        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                    );

                    const [entityName, entityValue] = readEntityExp(parser);

                    if (entityValue.indexOf("&") === -1) { // skip parameter entity references
                        const ep = parser.options?.entityParseOptions;
                        if (ep?.maxEntityCount && entityCount >= ep.maxEntityCount) {
                            throw new ParseError(
                                `Entity count (${entityCount + 1}) exceeds maximum allowed (${ep.maxEntityCount})`,
                                ErrorCode.ENTITY_MAX_COUNT,
                                { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                            );
                        }
                        const escaped = entityName.replace(/[.\-+*:]/g, '\\$&');
                        entities[entityName] = {
                            regx: RegExp(`&${escaped};`, "g"),
                            val: entityValue
                        };
                        entityCount++;
                    }

                } else if (typeChar2 === "L") {
                    // <!ELEMENT — consume "EMENT"
                    let rest = parser.source.readStr(5);
                    parser.source.updateBufferBoundary(5);
                    if (rest !== "EMENT") throw new ParseError(
                        "Invalid DOCTYPE ELEMENT expression",
                        ErrorCode.INVALID_TAG,
                        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                    );
                    readElementExp(parser); // not supported; drains to ">"

                } else {
                    throw new ParseError(
                        `Invalid DOCTYPE sub-tag "<!E${typeChar2}"`,
                        ErrorCode.INVALID_TAG,
                        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                    );
                }

            } else if (typeChar === "A") {
                // <!ATTLIST — consume "TTLIST"
                let rest = parser.source.readStr(6);
                parser.source.updateBufferBoundary(6);
                if (rest !== "TTLIST") throw new ParseError(
                    "Invalid DOCTYPE ATTLIST expression",
                    ErrorCode.INVALID_TAG,
                    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                );
                readAttlistExp(parser); // not supported; drains to ">"

            } else if (typeChar === "N") {
                // <!NOTATION — consume "OTATION"
                let rest = parser.source.readStr(7);
                parser.source.updateBufferBoundary(7);
                if (rest !== "OTATION") throw new ParseError(
                    "Invalid DOCTYPE NOTATION expression",
                    ErrorCode.INVALID_TAG,
                    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                );
                readNotationExp(parser); // not supported; drains to ">"

            } else {
                throw new ParseError(
                    `Invalid DOCTYPE sub-tag "<!${typeChar}"`,
                    ErrorCode.INVALID_TAG,
                    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                );
            }

        } else if (ch === '[') {
            hasBody = true;

        } else if (ch === ']') {
            // End of internal subset — the next '>' will close the DOCTYPE
            bodyDone = true;

        } else if (ch === '>') {
            // Closes the DOCTYPE:
            //   no-body form:   <!DOCTYPE root SYSTEM "foo.dtd">
            //   body form:      <!DOCTYPE root [...]>
            if (!hasBody || bodyDone) {
                parser.outputBuilder && parser.outputBuilder.addDocType && parser.outputBuilder.addDocType(entities);
                return entities;
            }
            // A '>' appearing inside the external identifier (before '[') is valid — skip it
        }
        // All other chars (whitespace, external identifier, public id text) are skipped
    }

    throw new ParseError(
        "Unclosed DOCTYPE",
        ErrorCode.UNEXPECTED_END,
        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
    );
}

// ---------------------------------------------------------------------------
// Sub-expression readers — all use parser.source
// ---------------------------------------------------------------------------

/**
 * Read an ENTITY declaration body.
 * The "<!ENTITY" keyword has already been consumed by the caller.
 * Reads up to and including the closing ">".
 * @returns {[string, string]} [entityName, entityValue]
 */
function readEntityExp(parser) {
    const source = parser.source;

    skipSourceWhitespace(source);

    // Read entity name (stops at whitespace or quote)
    let entityName = "";
    while (source.canRead()) {
        let ch = source.readChAt(0);
        if (/\s/.test(ch) || ch === '"' || ch === "'") break;
        entityName += source.readCh();
    }
    validateEntityName(entityName);

    skipSourceWhitespace(source);

    // Check for unsupported constructs
    let peek6 = source.readStr(6);
    if (peek6.toUpperCase() === "SYSTEM") {
        throw new ParseError(
            "External entities are not supported",
            ErrorCode.INVALID_TAG,
            { line: source.line, col: source.cols, index: source.startIndex }
        );
    }
    if (source.readStr(1) === "%") {
        throw new ParseError(
            "Parameter entities are not supported",
            ErrorCode.INVALID_TAG,
            { line: source.line, col: source.cols, index: source.startIndex }
        );
    }

    // Read quoted entity value
    const [entityValue] = readIdentifierVal(source, "entity");

    // Validate entity size
    const ep = parser.options?.entityParseOptions;
    if (ep?.maxEntitySize && entityValue.length > ep.maxEntitySize) {
        throw new ParseError(
            `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${ep.maxEntitySize})`,
            ErrorCode.ENTITY_MAX_SIZE,
            { line: source.line, col: source.cols, index: source.startIndex }
        );
    }

    // Consume up to and including the closing ">"
    source.readUpto(">");

    return [entityName, entityValue];
}

/**
 * Read an ELEMENT declaration body.
 * The "<!ELEMENT" keyword has already been consumed by the caller.
 * Reads up to and including the closing ">".
 */
function readElementExp(parser) {
    const source = parser.source;

    skipSourceWhitespace(source);

    // Read element name
    let elementName = "";
    while (source.canRead()) {
        let ch = source.readChAt(0);
        if (/\s/.test(ch)) break;
        elementName += source.readCh();
    }

    if (!isName(elementName)) {
        throw new ParseError(
            `Invalid element name: "${elementName}"`,
            ErrorCode.INVALID_TAG,
            { line: source.line, col: source.cols, index: source.startIndex }
        );
    }

    skipSourceWhitespace(source);

    // Read content model: EMPTY | ANY | (...)
    let peek1 = source.readStr(1);
    if (peek1 === "E") {
        // Could be EMPTY
        let peek5 = source.readStr(5);
        if (peek5 === "EMPTY") {
            source.updateBufferBoundary(5);
        } else {
            source.readUpto(">");
            return { elementName, contentModel: "" };
        }
    } else if (peek1 === "A") {
        // Could be ANY
        let peek3 = source.readStr(3);
        if (peek3 === "ANY") {
            source.updateBufferBoundary(3);
        } else {
            source.readUpto(">");
            return { elementName, contentModel: "" };
        }
    } else if (peek1 === "(") {
        source.updateBufferBoundary(1); // consume '('
        // Read until matching ')'
        // Simple approach: readUpto(")") — note: doesn't handle nested parens,
        // but matches the original fast-xml-parser behaviour
        source.readUpto(")");
    }

    // Consume remaining whitespace / quantifier / closing ">"
    source.readUpto(">");

    return { elementName };
}

/**
 * Read an ATTLIST declaration body.
 * The "<!ATTLIST" keyword has already been consumed by the caller.
 * Reads up to and including the closing ">".
 */
function readAttlistExp(parser) {
    // Not fully supported — just drain to closing ">"
    parser.source.readUpto(">");
}

/**
 * Read a NOTATION declaration body.
 * The "<!NOTATION" keyword has already been consumed by the caller.
 * Reads up to and including the closing ">".
 */
function readNotationExp(parser) {
    const source = parser.source;

    skipSourceWhitespace(source);

    // Read notation name
    let notationName = "";
    while (source.canRead()) {
        let ch = source.readChAt(0);
        if (/\s/.test(ch)) break;
        notationName += source.readCh();
    }
    validateEntityName(notationName);

    skipSourceWhitespace(source);

    // Peek at identifier type: SYSTEM or PUBLIC (6 chars)
    let identifierType = source.readStr(6).toUpperCase();
    if (identifierType === "SYSTEM") {
        source.updateBufferBoundary(6);
        skipSourceWhitespace(source);
        readIdentifierVal(source, "systemIdentifier");
    } else if (identifierType === "PUBLIC") {
        source.updateBufferBoundary(6);
        skipSourceWhitespace(source);
        readIdentifierVal(source, "publicIdentifier");
        skipSourceWhitespace(source);
        // Optionally read system identifier
        let next = source.readStr(1);
        if (next === '"' || next === "'") {
            readIdentifierVal(source, "systemIdentifier");
        }
    } else {
        throw new ParseError(
            `Expected SYSTEM or PUBLIC in NOTATION, found "${identifierType}"`,
            ErrorCode.INVALID_TAG,
            { line: source.line, col: source.cols, index: source.startIndex }
        );
    }

    // Drain to closing ">"
    source.readUpto(">");
}

/**
 * Read a quoted identifier value from the source.
 * Consumes the opening quote, the content, and the closing quote.
 * @returns {[string]} [value]
 */
function readIdentifierVal(source, type) {
    let startChar = source.readStr(1);
    if (startChar !== '"' && startChar !== "'") {
        throw new ParseError(
            `Expected quoted string for ${type}, found "${startChar}"`,
            ErrorCode.INVALID_TAG,
            { line: source.line, col: source.cols, index: source.startIndex }
        );
    }
    source.updateBufferBoundary(1); // consume the opening quote

    let value = source.readUpto(startChar); // readUpto also consumes the closing quote
    return [value];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Advance the source past any leading whitespace characters.
 */
function skipSourceWhitespace(source) {
    while (source.canRead()) {
        let ch = source.readChAt(0);
        if (!/\s/.test(ch)) break;
        source.readCh(); // consume the whitespace char
    }
}

function validateEntityName(name) {
    if (isName(name)) return name;
    throw new ParseError(
        `Invalid entity name "${name}"`,
        ErrorCode.ENTITY_INVALID_KEY,
        {}
    );
}