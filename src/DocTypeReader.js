import { ParseError, ErrorCode } from './ParseError.js';
import { expectMatch, ensureCanRead, errorPositionOf } from './util.js';

export function readDocType(parser) {
    parser.source.markTokenStart(1);

    // <!D are already consumed by the caller up to this point
    expectMatch(parser.source, "OCTYPE", "DOCTYPE preamble");

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
                        errorPositionOf(parser.source));
                }
                let bang = parser.source.readStr(1);
                parser.source.updateBufferBoundary(1);
                if (bang !== "!") throw new ParseError(
                    `Invalid DOCTYPE body tag starting with "<${bang}"`,
                    ErrorCode.INVALID_TAG,
                    errorPositionOf(parser.source)
                );

                if (!parser.source.canRead()) {
                    throw new ParseError(`Unexpected end of source reading DOCTYPE sub-tag type`,
                        ErrorCode.UNEXPECTED_END,
                        errorPositionOf(parser.source));
                }
                let typeChar = parser.source.readStr(1);
                parser.source.updateBufferBoundary(1);

                if (typeChar === "-") {
                    // <!-- comment -->
                    if (!parser.source.canRead()) {
                        throw new ParseError(`Unexpected end of source reading DOCTYPE comment`,
                            ErrorCode.UNEXPECTED_END,
                            errorPositionOf(parser.source));
                    }
                    let dash2 = parser.source.readStr(1);
                    parser.source.updateBufferBoundary(1);
                    if (dash2 !== "-") throw new ParseError(
                        "Invalid comment in DOCTYPE",
                        ErrorCode.INVALID_TAG,
                        errorPositionOf(parser.source)
                    );
                    parser.source.readUpto("-->");

                } else if (typeChar === "E") {
                    // ENTITY or ELEMENT — one more char to distinguish
                    if (!parser.source.canRead()) {
                        throw new ParseError(`Unexpected end of source reading DOCTYPE E-type sub-tag`,
                            ErrorCode.UNEXPECTED_END,
                            errorPositionOf(parser.source));
                    }
                    let typeChar2 = parser.source.readStr(1);
                    parser.source.updateBufferBoundary(1);

                    if (typeChar2 === "N") {
                        // <!ENTITY — need 4 more chars for "TITY"
                        expectMatch(parser.source, "TITY", "DOCTYPE ENTITY keyword");

                        const [entityName, entityValue] = readEntityExp(parser);

                        if (entityValue.indexOf("&") === -1) {
                            const ep = parser.options?.doctypeOptions;
                            if (ep?.maxEntityCount && entityCount >= ep.maxEntityCount) {
                                throw new ParseError(
                                    `Entity count (${entityCount + 1}) exceeds maximum allowed (${ep.maxEntityCount})`,
                                    ErrorCode.ENTITY_MAX_COUNT,
                                    errorPositionOf(parser.source)
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
                        expectMatch(parser.source, "EMENT", "DOCTYPE ELEMENT keyword");
                        readElementExp(parser);

                    } else {
                        throw new ParseError(
                            `Invalid DOCTYPE sub-tag "<!E${typeChar2}"`,
                            ErrorCode.INVALID_TAG,
                            errorPositionOf(parser.source)
                        );
                    }

                } else if (typeChar === "A") {
                    // <!ATTLIST — need 6 more chars for "TTLIST"
                    expectMatch(parser.source, "TTLIST", "DOCTYPE ATTLIST keyword");
                    readAttlistExp(parser);

                } else if (typeChar === "N") {
                    // <!NOTATION — need 7 more chars for "OTATION"
                    expectMatch(parser.source, "OTATION", "DOCTYPE NOTATION keyword");
                    readNotationExp(parser);

                } else {
                    throw new ParseError(
                        `Invalid DOCTYPE sub-tag "<!${typeChar}"`,
                        ErrorCode.INVALID_TAG,
                        errorPositionOf(parser.source)
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
                return entities;
            }
            // '>' before '[' is part of the external identifier — skip it
        }
        // whitespace, external identifier text, public id text — all skipped
    }

    throw new ParseError(
        "Unclosed DOCTYPE",
        ErrorCode.UNEXPECTED_END,
        errorPositionOf(parser.source)
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

    ensureCanRead(source, 1, "entity name");

    const entityNameStart = source.startIndex;
    let entityNameLen = 0;
    while (source.canRead()) {
        const ch = source.readCh();
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '"' || ch === "'") break;
        entityNameLen++;
    }
    const entityName = source.readStr(entityNameLen, entityNameStart);

    // Ran out mid-name without hitting a terminator — wait for more data
    ensureCanRead(source, 1, `entity name "${entityName}"`);

    validateEntityName(entityName, parser);
    skipSourceWhitespace(source);

    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source after entity name "${entityName}"`,
            ErrorCode.UNEXPECTED_END,
            errorPositionOf(source));
    }

    // SYSTEM check requires 6 chars; only peek when they are available
    if (source.canRead(5)) {
        if (source.matchAhead("system", true) === true) {
            throw new ParseError("External entities are not supported",
                ErrorCode.INVALID_TAG,
                errorPositionOf(source));
        }
    }

    if (source.readStr(1) === "%") {
        throw new ParseError("Parameter entities are not supported",
            ErrorCode.INVALID_TAG,
            errorPositionOf(source));
    }

    // Need at least the opening quote char
    if (!source.canRead()) {
        throw new ParseError(`Unexpected end of source reading entity value for "${entityName}"`,
            ErrorCode.UNEXPECTED_END,
            errorPositionOf(source));
    }

    const [entityValue] = readIdentifierVal(source, "entity");

    const ep = parser.options?.doctypeOptions;
    if (ep?.maxEntitySize && entityValue.length > ep.maxEntitySize) {
        throw new ParseError(
            `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${ep.maxEntitySize})`,
            ErrorCode.ENTITY_MAX_SIZE,
            errorPositionOf(source)
        );
    }

    // readUpto throws UNEXPECTED_END automatically if ">" is not in the buffer yet
    source.readUptoChar(">");

    return [entityName, entityValue];
}

/**
 * Read an ELEMENT declaration body.
 * "<!ELEMENT" has already been consumed by the caller.
 */
function readElementExp(parser) {
    const source = parser.source;

    skipSourceWhitespace(source);

    ensureCanRead(source, 1, "ELEMENT name");

    const elementNameStart = source.startIndex;
    let elementNameLen = 0;
    while (source.canRead()) {
        const ch = source.readCh();
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') break;
        elementNameLen++;
    }
    const elementName = source.readStr(elementNameLen, elementNameStart);

    ensureCanRead(source, 1, "ELEMENT name");

    if (!parser.getNameValidator('name')(elementName)) {
        throw new ParseError(`Invalid element name: "${elementName}"`,
            ErrorCode.INVALID_TAG,
            errorPositionOf(source));
    }

    skipSourceWhitespace(source);

    ensureCanRead(source, 1, "ELEMENT name");

    let peek1 = source.readStr(1);
    if (peek1 === "E") {
        // Use expectMatch for "EMPTY"
        try {
            expectMatch(source, "EMPTY", "ELEMENT content model keyword EMPTY");
        } catch (e) {
            // If not EMPTY, it might be something else – we fall back to skipping until '>'
            source.readUptoChar(">");
            return { elementName, contentModel: "" };
        }
    } else if (peek1 === "A") {
        try {
            expectMatch(source, "ANY", "ELEMENT content model keyword ANY");
        } catch (e) {
            source.readUptoChar(">");
            return { elementName, contentModel: "" };
        }
    } else if (peek1 === "(") {
        source.updateBufferBoundary(1);
        source.readUptoChar(")");
    }

    source.readUptoChar(">");
    return { elementName };
}

/**
 * Read an ATTLIST declaration body.
 * "<!ATTLIST" has already been consumed by the caller.
 */
function readAttlistExp(parser) {
    parser.source.readUptoChar(">");
}

/**
 * Read a NOTATION declaration body.
 * "<!NOTATION" has already been consumed by the caller.
 */
function readNotationExp(parser) {
    const source = parser.source;

    skipSourceWhitespace(source);

    ensureCanRead(source, 1, "NOTATION name");

    const notationNameStart = source.startIndex;
    let notationNameLen = 0;
    while (source.canRead()) {
        const ch = source.readCh();
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') break;
        notationNameLen++;
    }
    const notationName = source.readStr(notationNameLen, notationNameStart);

    ensureCanRead(source, 1, `after NOTATION name "${notationName}"`);

    validateEntityName(notationName, parser);
    skipSourceWhitespace(source);

    // Need all 6 chars of "SYSTEM" / "PUBLIC" before we can classify
    ensureCanRead(source, 6, "NOTATION identifier type");

    if (source.matchAhead("system", true) === true) {
        source.updateBufferBoundary(6);
        skipSourceWhitespace(source);
        readIdentifierVal(source, "systemIdentifier");
    } else if (source.matchAhead("public", true) === true) {
        source.updateBufferBoundary(6);
        skipSourceWhitespace(source);
        readIdentifierVal(source, "publicIdentifier");
        skipSourceWhitespace(source);
        ensureCanRead(source, 1, "after NOTATION PUBLIC identifier");
        let next = source.readStr(1);
        if (next === '"' || next === "'") {
            readIdentifierVal(source, "systemIdentifier");
        }
    } else {
        throw new ParseError(
            `Expected SYSTEM or PUBLIC in NOTATION, found "${source.readStr(6)}"`,
            ErrorCode.INVALID_TAG,
            errorPositionOf(source)
        );
    }

    source.readUptoChar(">");
}

/**
 * Read a quoted identifier value from the source.
 * Consumes the opening quote, the content, and the closing quote.
 * @returns {[string]} [value]
 */
function readIdentifierVal(source, type) {
    ensureCanRead(source, 1, type + " opening quote")
    let startChar = source.readStr(1);
    if (startChar !== '"' && startChar !== "'") {
        throw new ParseError(
            `Expected quoted string for ${type}, found "${startChar}"`,
            ErrorCode.INVALID_TAG,
            errorPositionOf(source)
        );
    }
    source.updateBufferBoundary(1);
    // readUpto throws UNEXPECTED_END automatically when the closing quote is absent
    let value = source.readUptoChar(startChar);
    return [value];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function skipSourceWhitespace(source) {
    while (source.canRead()) {
        const ch = source.readChAt(0);
        //TODO: util.isSpaceCode
        if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') break;
        //source.readCh();
        source.updateBufferBoundary(1)
    }
}

function validateEntityName(name, parser) {
    if (parser.getNameValidator('name')(name)) return name;
    throw new ParseError(
        `Invalid entity name "${name}"`,
        ErrorCode.ENTITY_INVALID_KEY,
        {}
    );
}