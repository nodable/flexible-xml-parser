/**
 * Shared scanTagExpEnd implementations for sources whose buffer is a JS string
 * (StringSource, FeedableSource, CharScanStrategy).
 *
 * Two separate functions instead of one with a flag — the flag was evaluated
 * inside the loop on every character, which adds overhead to the hottest path
 * in the parser. The caller resolves which variant to use once, before the
 * scan begins.
 *
 * Neither function is exported as a method — each source assigns both onto
 * itself so `this` binding works correctly with zero indirection.
 */

/**
 * Scan for the unquoted '>' that ends a tag expression, and record each
 * quote boundary in `this._quotePairs` as it goes. Used when attributes
 * will be parsed (skip.attributes is false).
 *
 * @returns {number} relative offset of the unquoted '>' from startIndex,
 *   or -1 if the buffer is exhausted (chunk boundary for FeedableSource,
 *   malformed input for StringSource/CharScanStrategy).
 */
export function scanTagExpEnd() {
  const buf = this.buffer;
  const len = buf.length;
  const start = this.startIndex;
  const pairs = this._quotePairs;
  const capacity = pairs.length;
  let pairsLen = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = start; i < len; i++) {
    const c = buf[i];
    if (c === "'") {
      if (!inDouble) {
        inSingle = !inSingle;
        if (pairsLen < capacity) pairs[pairsLen++] = i - start;
      }
    } else if (c === '"') {
      if (!inSingle) {
        inDouble = !inDouble;
        if (pairsLen < capacity) pairs[pairsLen++] = i - start;
      }
    } else if (c === '>' && !inSingle && !inDouble) {
      this._quotePairsLen = pairsLen;
      return i - start;
    }
  }
  this._quotePairsLen = pairsLen;
  return -1;
}

/**
 * Scan for the unquoted '>' that ends a tag expression, without recording
 * quote positions. Used when attributes are being skipped entirely
 * (skip.attributes is true) — nobody will read _quotePairs, so don't pay
 * to populate it.
 *
 * @returns {number} relative offset of the unquoted '>' from startIndex,
 *   or -1 if the buffer is exhausted.
 */
export function scanTagExpEndFast() {
  const buf = this.buffer;
  const len = buf.length;
  const start = this.startIndex;
  let inSingle = false;
  let inDouble = false;
  for (let i = start; i < len; i++) {
    const c = buf[i];
    if (c === "'") {
      if (!inDouble) inSingle = !inSingle;
    } else if (c === '"') {
      if (!inSingle) inDouble = !inDouble;
    } else if (c === '>' && !inSingle && !inDouble) {
      return i - start;
    }
  }
  return -1;
}
