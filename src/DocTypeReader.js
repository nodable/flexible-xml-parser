import { isName } from './util.js';
import { ParseError, ErrorCode } from './ParseError.js';

export function readDocType(parser) {
    parser.source.markTokenStart(1);

    // <!D are already consumed by the caller up to this point
    if (!parser.source.canRead(5)) {
        throw new ParseError(
            `Unexpected end of source reading DOCTYPE preamble`,
            ErrorCode.UNEXPECTED_END,
            { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
        );
    }
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
    let hasBody = false;
    let bodyDone = false;

    while (parser.source.canRead()) {
        // Save a local snapshot of startIndex BEFORE consuming this character.
        // If the sub-tag dispatch below throws UNEXPECTED_END we restore here
        // and re-throw so that feed()'s catch calls rewindToMark(), which
        // restores all the way back to the '<' that began the DOCTYPE tag
        // (the level-0 mark set by parseXml's loop). We must NOT call
        // markTokenStart(0) here because that would overwrite parseXml's
        // level-0 mark and cause rewindToMark() to land at the wrong position.
        const subTagStart = parser.source.startIndex;

        let ch = parser.source.readCh();

        if (ch === '<' && hasBody && !bodyDone) {
            // ── "<!…" sub-tag inside [...] body ───────────────────────────────
            // If any read below hits a chunk boundary we restore to subTagStart
            // (the '<') and re-throw UNEXPECTED_END so the outer rewind via
            // rewindToMark() lands at parseXml's level-0 mark (the DOCTYPE '<').
            try {
                if (!parser.source.canRead()) {
                    throw new ParseError(`Unexpected end of source reading DOCTYPE sub-tag`,
                        ErrorCode.UNEXPECTED_END,
                        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex });
                }
                let bang = parser.source.readStr(1);
                parser.source.updateBufferBoundary(1);
                if (bang !== "!") throw new ParseError(
                    `Invalid DOCTYPE body tag starting with "<${bang}"`,
                    ErrorCode.INVALID_TAG,
                    { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                );

                if (!parser.source.canRead()) {
                    throw new ParseError(`Unexpected end of source reading DOCTYPE sub-tag type`,
                        ErrorCode.UNEXPECTED_END,
                        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex });
                }
                let typeChar = parser.source.readStr(1);
                parser.source.updateBufferBoundary(1);

                if (typeChar === "-") {
                    // <!-- comment -->
                    if (!parser.source.canRead()) {
                        throw new ParseError(`Unexpected end of source reading DOCTYPE comment`,
                            ErrorCode.UNEXPECTED_END,
                            { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex });
                    }
                    let dash2 = parser.source.readStr(1);
                    parser.source.updateBufferBoundary(1);
                    if (dash2 !== "-") throw new ParseError(
                        "Invalid comment in DOCTYPE",
                        ErrorCode.INVALID_TAG,
                        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                    );
                    parser.source.readUpto("-->");

                } else if (typeChar === "E") {
                    // ENTITY or ELEMENT — one more char to distinguish
                    if (!parser.source.canRead()) {
                        throw new ParseError(`Unexpected end of source reading DOCTYPE E-type sub-tag`,
                            ErrorCode.UNEXPECTED_END,
                            { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex });
                    }
                    let typeChar2 = parser.source.readStr(1);
                    parser.source.updateBufferBoundary(1);

                    if (typeChar2 === "N") {
                        // <!ENTITY — need 4 more chars for "TITY"
                        if (!parser.source.canRead(3)) {
                            throw new ParseError(`Unexpected end of source reading DOCTYPE ENTITY keyword`,
                                ErrorCode.UNEXPECTED_END,
                                { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex });
                        }
                        let rest = parser.source.readStr(4);
                        parser.source.updateBufferBoundary(4);
                        if (rest !== "TITY") throw new ParseError(
                            "Invalid DOCTYPE ENTITY expression",
                            ErrorCode.INVALID_TAG,
                            { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                        );

                        const [entityName, entityValue] = readEntityExp(parser);

                        if (entityValue.indexOf("&") === -1) {
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
                        // <!ELEMENT — need 5 more chars for "EMENT"
                        if (!parser.source.canRead(4)) {
                            throw new ParseError(`Unexpected end of source reading DOCTYPE ELEMENT keyword`,
                                ErrorCode.UNEXPECTED_END,
                                { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex });
                        }
                        let rest = parser.source.readStr(5);
                        parser.source.updateBufferBoundary(5);
                        if (rest !== "EMENT") throw new ParseError(
                            "Invalid DOCTYPE ELEMENT expression",
                            ErrorCode.INVALID_TAG,
                            { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                        );
                        readElementExp(parser);

                    } else {
                        throw new ParseError(
                            `Invalid DOCTYPE sub-tag "<!E${typeChar2}"`,
                            ErrorCode.INVALID_TAG,
                            { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                        );
                    }

                } else if (typeChar === "A") {
                    // <!ATTLIST — need 6 more chars for "TTLIST"
                    if (!parser.source.canRead(5)) {
                        throw new ParseError(`Unexpected end of source reading DOCTYPE ATTLIST keyword`,
                            ErrorCode.UNEXPECTED_END,
                            { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex });
                    }
                    let rest = parser.source.readStr(6);
                    parser.source.updateBufferBoundary(6);
                    if (rest !== "TTLIST") throw new ParseError(
                        "Invalid DOCTYPE ATTLIST expression",
                        ErrorCode.INVALID_TAG,
                        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                    );
                    readAttlistExp(parser);

                } else if (typeChar === "N") {
                    // <!NOTATION — need 7 more chars for "OTATION"
                    if (!parser.source.canRead(6)) {
                        throw new ParseError(`Unexpected end of source reading DOCTYPE NOTATION keyword`,
                            ErrorCode.UNEXPECTED_END,
                            { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex });
                    }
                    let rest = parser.source.readStr(7);
                    parser.source.updateBufferBoundary(7);
                    if (rest !== "OTATION") throw new ParseError(
                        "Invalid DOCTYPE NOTATION expression",
                        ErrorCode.INVALID_TAG,
                        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                    );
                    readNotationExp(parser);

                } else {
                    throw new ParseError(
                        `Invalid DOCTYPE sub-tag "<!${typeChar}"`,
                        ErrorCode.INVALID_TAG,
                        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
                    );
                }

            } catch (err) {
                if (err.code === ErrorCode.UNEXPECTED_END) {
                    // Restore cursor to the '<' that started this sub-tag so
                    // that when feed() calls rewindToMark() (which goes all the
                    // way back to the DOCTYPE '<' via parseXml's level-0 mark)
                    // the full DOCTYPE — including this sub-tag — is replayed.
                    parser.source.startIndex = subTagStart;
                }
                // Always re-throw: UNEXPECTED_END bubbles up to feed() for rewind;
                // INVALID_TAG and others bubble up as real parse failures.
                throw err;
            }

        } else if (ch === '[') {
            hasBody = true;

        } else if (ch === ']') {
            bodyDone = true;

        } else if (ch === '>') {
            if (!hasBody || bodyDone) {
                parser.outputBuilder && parser.outputBuilder.addDocType && parser.outputBuilder.addDocType(entities);
                return entities;
            }
            // '>' before '[' is part of the external identifier — skip it
        }
        // whitespace, external identifier text, public id text — all skipped
    }

    throw new ParseError(
        "Unclosed DOCTYPE",
        ErrorCode.UNEXPECTED_END,
        { line: parser.source.line, col: parser.source.cols, index: parser.source.startIndex }
    );
}

// ---------------------------------------------------------------------------
// Sub-expression readers
// ---------------------------------------------------------------------------

/**
 * Read an ENTITY declaration body.
 * "<!ENTITY" has already been consumed by the caller.
 *
 * All canRead() guards throw UNEXPECTED_END on chunk boundaries. The caller's
 * try/catch restores startIndex to the '<' of this sub-tag, then re-throws
 * so feed() → rewindToMark() resets all the way to the DOCTYPE opening '<'.
 *
 * @returns {[string, string]} [entityName, entityValue]
 */
function readEntityExp(parser) {
    const source = parser.source;

    skipSourceWhitespace(source);

    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source reading entity name`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    // Read entity name — stops at whitespace or opening quote
    let entityName = "";
    while (source.canRead()) {
        let ch = source.readChAt(0);
        if (/\s/.test(ch) || ch === '"' || ch === "'") break;
        entityName += source.readCh();
    }

    // Ran out mid-name without hitting a terminator — wait for more data
    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source reading entity name "${entityName}"`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    validateEntityName(entityName);
    skipSourceWhitespace(source);

    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source after entity name "${entityName}"`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    // SYSTEM check requires 6 chars; only peek when they are available
    if (source.canRead(5)) {
        let peek6 = source.readStr(6);
        if (peek6.toUpperCase() === "SYSTEM") {
            throw new ParseError("External entities are not supported",
                ErrorCode.INVALID_TAG,
                { line: source.line, col: source.cols, index: source.startIndex });
        }
    }

    if (source.readStr(1) === "%") {
        throw new ParseError("Parameter entities are not supported",
            ErrorCode.INVALID_TAG,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    // Need at least the opening quote char
    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source reading entity value for "${entityName}"`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    const [entityValue] = readIdentifierVal(source, "entity");

    const ep = parser.options?.entityParseOptions;
    if (ep?.maxEntitySize && entityValue.length > ep.maxEntitySize) {
        throw new ParseError(
            `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${ep.maxEntitySize})`,
            ErrorCode.ENTITY_MAX_SIZE,
            { line: source.line, col: source.cols, index: source.startIndex }
        );
    }

    // readUpto throws UNEXPECTED_END automatically if ">" is not in the buffer yet
    source.readUpto(">");

    return [entityName, entityValue];
}

/**
 * Read an ELEMENT declaration body.
 * "<!ELEMENT" has already been consumed by the caller.
 */
function readElementExp(parser) {
    const source = parser.source;

    skipSourceWhitespace(source);

    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source reading ELEMENT name`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    let elementName = "";
    while (source.canRead()) {
        let ch = source.readChAt(0);
        if (/\s/.test(ch)) break;
        elementName += source.readCh();
    }

    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source after ELEMENT name "${elementName}"`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    if (!isName(elementName)) {
        throw new ParseError(`Invalid element name: "${elementName}"`,
            ErrorCode.INVALID_TAG,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    skipSourceWhitespace(source);

    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source reading ELEMENT content model`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    let peek1 = source.readStr(1);
    if (peek1 === "E") {
        if (!source.canRead(4)) {
            throw new ParseError(`Unexpected end of source reading ELEMENT content model keyword`,
                ErrorCode.UNEXPECTED_END,
                { line: source.line, col: source.cols, index: source.startIndex });
        }
        let peek5 = source.readStr(5);
        if (peek5 === "EMPTY") {
            source.updateBufferBoundary(5);
        } else {
            source.readUpto(">");
            return { elementName, contentModel: "" };
        }
    } else if (peek1 === "A") {
        if (!source.canRead(2)) {
            throw new ParseError(`Unexpected end of source reading ELEMENT content model keyword`,
                ErrorCode.UNEXPECTED_END,
                { line: source.line, col: source.cols, index: source.startIndex });
        }
        let peek3 = source.readStr(3);
        if (peek3 === "ANY") {
            source.updateBufferBoundary(3);
        } else {
            source.readUpto(">");
            return { elementName, contentModel: "" };
        }
    } else if (peek1 === "(") {
        source.updateBufferBoundary(1);
        source.readUpto(")");
    }

    source.readUpto(">");
    return { elementName };
}

/**
 * Read an ATTLIST declaration body.
 * "<!ATTLIST" has already been consumed by the caller.
 */
function readAttlistExp(parser) {
    parser.source.readUpto(">");
}

/**
 * Read a NOTATION declaration body.
 * "<!NOTATION" has already been consumed by the caller.
 */
function readNotationExp(parser) {
    const source = parser.source;

    skipSourceWhitespace(source);

    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source reading NOTATION name`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    let notationName = "";
    while (source.canRead()) {
        let ch = source.readChAt(0);
        if (/\s/.test(ch)) break;
        notationName += source.readCh();
    }

    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source after NOTATION name "${notationName}"`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

    validateEntityName(notationName);
    skipSourceWhitespace(source);

    // Need all 6 chars of "SYSTEM" / "PUBLIC" before we can classify
    if (!source.canRead(5)) {
        throw new ParseError(`Unexpected end of source reading NOTATION identifier type`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }

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
        if (!source.canRead()) {
            throw new ParseError(`Unexpected end of source after NOTATION PUBLIC identifier`,
                ErrorCode.UNEXPECTED_END,
                { line: source.line, col: source.cols, index: source.startIndex });
        }
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

    source.readUpto(">");
}

/**
 * Read a quoted identifier value from the source.
 * Consumes the opening quote, the content, and the closing quote.
 * @returns {[string]} [value]
 */
function readIdentifierVal(source, type) {
    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source reading ${type} opening quote`,
            ErrorCode.UNEXPECTED_END,
            { line: source.line, col: source.cols, index: source.startIndex });
    }
    let startChar = source.readStr(1);
    if (startChar !== '"' && startChar !== "'") {
        throw new ParseError(
            `Expected quoted string for ${type}, found "${startChar}"`,
            ErrorCode.INVALID_TAG,
            { line: source.line, col: source.cols, index: source.startIndex }
        );
    }
    source.updateBufferBoundary(1);
    // readUpto throws UNEXPECTED_END automatically when the closing quote is absent
    let value = source.readUpto(startChar);
    return [value];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function skipSourceWhitespace(source) {
    while (source.canRead()) {
        let ch = source.readChAt(0);
        if (!/\s/.test(ch)) break;
        source.readCh();
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