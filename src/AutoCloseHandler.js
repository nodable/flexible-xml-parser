import { ParseError, ErrorCode } from './ParseError.js';

/**
 * AutoCloseHandler
 *
 * Handles two distinct failure modes that arise when XML is malformed
 * or a data stream is interrupted:
 *
 *   1. EOF with open tags   — `onEof` option
 *   2. Mismatched close tag — `onMismatch` option
 *
 * The handler is stateless; it receives the parser's live state on each
 * call and mutates it directly (matching how the parser normally works).
 */

/**
 * Error types returned by getParseErrors() when `collectErrors` is true.
 * @enum {string}
 */
export const AutoCloseErrorType = Object.freeze({
  /** A tag was still open when the document ended. */
  UNCLOSED_EOF: 'unclosed-eof',

  /**
   * A closing tag didn't match the current open tag.
   * The handler popped up the stack to find the nearest match.
   */
  MISMATCHED_CLOSE: 'mismatched-close',

  /**
   * A closing tag appeared whose opener doesn't exist anywhere in the stack.
   * The tag is discarded.
   */
  PHANTOM_CLOSE: 'phantom-close',

  /**
   * The source ended mid-way through a tag — e.g. `<div><p` or `</di`.
   * The partial tag is discarded; any already-open tags are closed by handleEof.
   */
  PARTIAL_TAG: 'partial-tag',
});

export default class AutoCloseHandler {
  /**
   * @param {object} autoCloseOptions - Resolved autoClose options
   * @param {string} autoCloseOptions.onEof        - 'throw' | 'closeAll'
   * @param {string} autoCloseOptions.onMismatch   - 'throw' | 'recover' | 'discard'
   * @param {boolean} autoCloseOptions.collectErrors
   */
  constructor(autoCloseOptions) {
    this.onEof = autoCloseOptions.onEof || 'throw';
    this.onMismatch = autoCloseOptions.onMismatch || 'throw';
    this.collectErrors = autoCloseOptions.collectErrors || false;
    this.errors = [];
  }

  /**
   * Called at end-of-document when `tagsStack` is non-empty.
   *
   * @param {object}   parserState
   * @param {Array}    parserState.tagsStack       - Parser's open-tag stack
   * @param {object}   parserState.currentTagDetail - The currently open TagDetail
   * @param {object}   parserState.outputBuilder   - Live OutputBuilder instance
   * @param {object}   parserState.readonlyMatcher - Read-only Matcher proxy
   * @param {object}   parserState.source          - Current InputSource (for position)
   * @param {Function} parserState.addTextNode     - Bound addTextNode on the parser
   */
  handleEof(parserState) {
    if (this.onEof === 'throw') {
      throw new ParseError('Unexpected data in the end of document', ErrorCode.UNEXPECTED_TRAILING_DATA);
    }

    // onEof === 'closeAll'
    // Close from innermost outward using the parser's canonical popTag(),
    // which keeps the parser stack and output builder in sync automatically.

    const { addTextNode, popTag } = parserState;

    let current = parserState.currentTagDetail;

    while (current && !current.root) {
      this._recordError(AutoCloseErrorType.UNCLOSED_EOF, {
        tag: current.name,
        expected: null,
        line: current.line,
        col: current.col,
        index: current.index,
      });

      addTextNode();
      popTag();

      // popTag() already updated currentTagDetail via tagsStack.pop()
      current = parserState.currentTagDetail;
    }
  }

  /**
   * Called when a closing tag name doesn't match `currentTagDetail.name`.
   *
   * Returns an object describing what the caller should do:
   *   { action: 'close-matched' } — handler already closed intermediates;
   *                                  caller should now close the matched tag normally
   *   { action: 'discard' }       — caller should skip this closing tag entirely
   *
   * @param {string}   closingTagName   - The mismatched closing tag we just read
   * @param {object}   parserState      - Same shape as handleEof
   * @returns {{ action: string }}
   */
  handleMismatch(closingTagName, parserState) {
    const { tagsStack, currentTagDetail, source, addTextNode } = parserState;

    if (this.onMismatch === 'throw') {
      throw new ParseError(
        `Unexpected closing tag '${closingTagName}' expecting '${currentTagDetail.name}'`,
        ErrorCode.MISMATCHED_CLOSE_TAG,
        { line: source ? source.line : undefined, col: source ? source.cols : undefined, index: source ? source.startIndex : undefined }
      );
    }

    if (this.onMismatch === 'discard') {
      this._recordError(AutoCloseErrorType.MISMATCHED_CLOSE, {
        tag: closingTagName,
        expected: currentTagDetail.name,
        line: source ? source.line : null,
        col: source ? source.cols : null,
        index: source ? source.startIndex : null,
      });
      return { action: 'discard' };
    }

    // onMismatch === 'recover'
    // Scan the stack (top → bottom) for the closest matching opener.
    // tagsStack holds ancestors with index 0 = root, last = parent of current.
    // currentTagDetail is the open tag at the top that didn't match.

    // Build a unified view: [root...ancestors, current] — we check current first
    // (it's the top), then walk down toward the root.
    const stackSnapshot = [...tagsStack, currentTagDetail];

    let matchIndex = -1;
    const stackSnapshotLength = stackSnapshot.length;
    for (let i = stackSnapshotLength - 1; i >= 0; i--) {
      if (stackSnapshot[i].name === closingTagName) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex === -1) {
      // No match anywhere — phantom closing tag
      this._recordError(AutoCloseErrorType.PHANTOM_CLOSE, {
        tag: closingTagName,
        expected: currentTagDetail.name,
        line: source ? source.line : null,
        col: source ? source.cols : null,
        index: source ? source.startIndex : null,
      });
      return { action: 'discard' };
    }

    // Close everything above the match (innermost first), then signal the
    // caller to close the matched tag itself in the normal path.
    const levelsToClose = stackSnapshotLength - 1 - matchIndex;

    for (let i = 0; i < levelsToClose; i++) {
      const tag = stackSnapshot[stackSnapshotLength - 1 - i];

      this._recordError(AutoCloseErrorType.MISMATCHED_CLOSE, {
        tag: tag.name,
        expected: closingTagName,
        line: tag.line,
        col: tag.col,
        index: tag.index,
      });

      addTextNode();
      parserState.popTag();
    }

    // Update currentTagDetail to the matched one so the normal close path works.
    // popTag() has already walked the stack up by levelsToClose steps; the next
    // currentTagDetail is the one we want to match against.
    parserState.currentTagDetail = stackSnapshot[matchIndex];

    return { action: 'close-matched' };
  }

  /**
   * Called when the source ended mid-way through a tag token.
   * Records the partial-tag error and delegates remaining open tags to handleEof.
   *
   * @param {Error}  originalError  - The error thrown by the read function
   * @param {object} parserState    - Same shape as handleEof
   */
  handlePartialTag(originalError, parserState) {
    this._recordError(AutoCloseErrorType.PARTIAL_TAG, {
      tag: _extractPartialTagName(originalError),
      expected: null,
      line: parserState.source ? parserState.source.line : null,
      col: parserState.source ? parserState.source.cols : null,
      index: parserState.source ? parserState.source.startIndex : null,
    });

    // Discard any partially-accumulated text from the broken tag
    parserState.tagTextData = '';

    // Close whatever was legitimately open before this truncation
    this.handleEof(parserState);
  }

  /**
   * Return a copy of the collected error list.
   * Empty array when collectErrors is false or no errors occurred.
   * @returns {Array}
   */
  getErrors() {
    return this.errors.slice();
  }

  /**
   * Reset error log (useful if the same handler instance is reused).
   */
  reset() {
    this.errors = [];
  }

  // ── Private ──────────────────────────────────────────────────────────────

  _recordError(type, detail) {
    if (!this.collectErrors) return;
    this.errors.push({ type, ...detail });
  }
}

/**
 * Best-effort extraction of a partial tag name from a source-exhausted error.
 * Accepts the full error object so it can inspect both message and code.
 *
 * ParseError from readClosingTagName (new format):
 *   message: "Unexpected end of source reading closing tag '</di'"
 *
 * Legacy plain Error (old format, kept for safety):
 *   message: "Unexpected end of source. Reading closing tag '</di'"
 *
 * ParseError from readTagExp / readPiExp — opening tag truncated before '>':
 *   No tag name is embedded; returns null.
 */
function _extractPartialTagName(err) {
  if (!err) return null;
  const message = typeof err.message === 'string' ? err.message : String(err);
  // Match both "reading closing tag" (new, lowercase) and
  // "Reading closing tag"  (old, capitalised, period-separated)
  const closeMatch = message.match(/[Rr]eading closing tag '<\/([^']*)/);
  if (closeMatch) return closeMatch[1] || null;
  return null;
}