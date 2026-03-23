/**
 * Minimal jasmine-compatible test runner for Node.js (ESM)
 * Supports: describe, xdescribe, it, xit, beforeEach, afterEach, beforeAll, afterAll, expect
 */

// ─── State ───────────────────────────────────────────────────────────────────

const suites = [];        // root suite list
let currentSuite = null;  // suite currently being defined
const rootSuite = makeSuite('[root]', null);
currentSuite = rootSuite;

const results = { passed: 0, failed: 0, skipped: 0, errors: [] };

// ─── Suite / Spec factories ───────────────────────────────────────────────────

function makeSuite(description, parent, skip = false) {
  return {
    description,
    parent,
    skip,
    specs: [],
    children: [],
    beforeEach: [],
    afterEach: [],
    beforeAll: [],
    afterAll: [],
  };
}

function makeSpec(description, fn, suite, skip = false) {
  return { description, fn, suite, skip };
}

// ─── Public API (globals) ─────────────────────────────────────────────────────

global.describe = function (description, fn) {
  const suite = makeSuite(description, currentSuite);
  currentSuite.children.push(suite);
  const prev = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = prev;
};

global.xdescribe = function (description, fn) {
  const suite = makeSuite(description, currentSuite, true);
  currentSuite.children.push(suite);
  const prev = currentSuite;
  currentSuite = suite;
  try { fn(); } catch (_) {}
  currentSuite = prev;
};

global.fdescribe = global.describe; // focused not needed here

global.it = function (description, fn) {
  currentSuite.specs.push(makeSpec(description, fn, currentSuite));
};

global.xit = function (description, fn) {
  currentSuite.specs.push(makeSpec(description, fn, currentSuite, true));
};

global.fit = global.it;

global.beforeEach = function (fn) { currentSuite.beforeEach.push(fn); };
global.afterEach  = function (fn) { currentSuite.afterEach.push(fn); };
global.beforeAll  = function (fn) { currentSuite.beforeAll.push(fn); };
global.afterAll   = function (fn) { currentSuite.afterAll.push(fn); };

// ─── Matchers ─────────────────────────────────────────────────────────────────

function Expectation(actual, negated = false) {
  this.actual = actual;
  this.negated = negated;

  Object.defineProperty(this, 'not', {
    get: () => new Expectation(actual, !negated)
  });
}

Expectation.prototype._assert = function (pass, message, extra = '') {
  if (this.negated) pass = !pass;
  if (!pass) {
    const prefix = this.negated ? 'Expected NOT: ' : 'Expected: ';
    throw new AssertionError(`${prefix}${message}${extra ? ' ' + extra : ''}`);
  }
};

class AssertionError extends Error {
  constructor(msg) { super(msg); this.name = 'AssertionError'; }
}

Expectation.prototype.toBe = function (expected) {
  this._assert(
    Object.is(this.actual, expected),
    `${fmt(this.actual)} to be ${fmt(expected)}`
  );
};

Expectation.prototype.toEqual = function (expected) {
  this._assert(
    deepEqual(this.actual, expected),
    `${fmt(this.actual)} to equal ${fmt(expected)}`
  );
};

Expectation.prototype.toBeDefined = function () {
  this._assert(this.actual !== undefined, `${fmt(this.actual)} to be defined`);
};

Expectation.prototype.toBeUndefined = function () {
  this._assert(this.actual === undefined, `${fmt(this.actual)} to be undefined`);
};

Expectation.prototype.toBeNull = function () {
  this._assert(this.actual === null, `${fmt(this.actual)} to be null`);
};

Expectation.prototype.toBeTruthy = function () {
  this._assert(!!this.actual, `${fmt(this.actual)} to be truthy`);
};

Expectation.prototype.toBeFalsy = function () {
  this._assert(!this.actual, `${fmt(this.actual)} to be falsy`);
};

Expectation.prototype.toBeGreaterThan = function (n) {
  this._assert(this.actual > n, `${fmt(this.actual)} to be greater than ${n}`);
};

Expectation.prototype.toBeLessThan = function (n) {
  this._assert(this.actual < n, `${fmt(this.actual)} to be less than ${n}`);
};

Expectation.prototype.toBeGreaterThanOrEqual = function (n) {
  this._assert(this.actual >= n, `${fmt(this.actual)} to be >= ${n}`);
};

Expectation.prototype.toBeCloseTo = function (expected, precision = 2) {
  const delta = Math.abs(expected - this.actual);
  const threshold = Math.pow(10, -precision) / 2;
  this._assert(delta < threshold, `${fmt(this.actual)} to be close to ${expected} (precision ${precision})`);
};

Expectation.prototype.toContain = function (expected) {
  let pass;
  if (typeof this.actual === 'string') {
    pass = this.actual.includes(expected);
  } else if (Array.isArray(this.actual)) {
    pass = this.actual.some(item => deepEqual(item, expected));
  } else {
    pass = false;
  }
  this._assert(pass, `${fmt(this.actual)} to contain ${fmt(expected)}`);
};

Expectation.prototype.toMatch = function (pattern) {
  const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  this._assert(re.test(String(this.actual)), `${fmt(this.actual)} to match ${pattern}`);
};

Expectation.prototype.toThrow = function (expected) {
  if (typeof this.actual !== 'function') {
    throw new AssertionError(`Expected a function, got ${fmt(this.actual)}`);
  }
  let threw = false;
  let error = null;
  try { this.actual(); } catch (e) { threw = true; error = e; }

  if (this.negated) {
    if (threw) throw new AssertionError(`Expected function NOT to throw, but it threw: ${error?.message}`);
    return;
  }

  if (!threw) throw new AssertionError(`Expected function to throw but it did not`);

  if (expected !== undefined) {
    if (typeof expected === 'string') {
      if (!error.message.includes(expected))
        throw new AssertionError(`Expected throw message to contain "${expected}", got "${error.message}"`);
    } else if (expected instanceof RegExp) {
      if (!expected.test(error.message))
        throw new AssertionError(`Expected throw message to match ${expected}, got "${error.message}"`);
    } else if (typeof expected === 'function') {
      if (!(error instanceof expected))
        throw new AssertionError(`Expected to throw ${expected.name}, got ${error?.constructor?.name}`);
    }
  }
};

Expectation.prototype.toThrowError = Expectation.prototype.toThrow;

global.expect = function (actual) {
  return new Expectation(actual);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch (_) { return String(v); }
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const RESET  = '\x1b[0m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

function collectBeforeEach(suite) {
  const hooks = [];
  let s = suite;
  while (s) { if (s.beforeEach.length) hooks.unshift(...s.beforeEach); s = s.parent; }
  return hooks;
}

function collectAfterEach(suite) {
  const hooks = [];
  let s = suite;
  while (s) { if (s.afterEach.length) hooks.push(...s.afterEach); s = s.parent; }
  return hooks;
}

function suitePath(suite) {
  const parts = [];
  let s = suite;
  while (s && s.description !== '[root]') { parts.unshift(s.description); s = s.parent; }
  return parts.join(' > ');
}

async function runSuite(suite, indent = 0) {
  if (suite.skip) {
    // Count all specs in this suite as skipped
    countSkipped(suite);
    return;
  }

  const pad = '  '.repeat(indent);

  if (suite.description !== '[root]') {
    console.log(`${pad}${BOLD}${suite.description}${RESET}`);
  }

  for (const fn of suite.beforeAll) {
    try { await fn(); } catch (e) {
      console.error(`${pad}  ${RED}beforeAll FAILED: ${e.message}${RESET}`);
    }
  }

  for (const spec of suite.specs) {
    if (spec.skip) {
      results.skipped++;
      console.log(`${pad}  ${YELLOW}○ ${spec.description}${RESET}`);
      continue;
    }

    const beforeEachHooks = collectBeforeEach(spec.suite);
    const afterEachHooks  = collectAfterEach(spec.suite);

    try {
      for (const fn of beforeEachHooks) await fn();
      await spec.fn();
      for (const fn of afterEachHooks) await fn();
      results.passed++;
      console.log(`${pad}  ${GREEN}✓ ${spec.description}${RESET}`);
    } catch (e) {
      results.failed++;
      const fullName = `${suitePath(spec.suite)} > ${spec.description}`;
      console.log(`${pad}  ${RED}✗ ${spec.description}${RESET}`);
      console.log(`${pad}    ${DIM}${e.message}${RESET}`);
      results.errors.push({ name: fullName, message: e.message, stack: e.stack });
    }
  }

  for (const child of suite.children) {
    await runSuite(child, suite.description === '[root]' ? 0 : indent + 1);
  }

  for (const fn of suite.afterAll) {
    try { await fn(); } catch (e) {
      console.error(`${pad}  ${RED}afterAll FAILED: ${e.message}${RESET}`);
    }
  }
}

function countSkipped(suite) {
  results.skipped += suite.specs.length;
  for (const child of suite.children) countSkipped(child);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runFiles(specFiles) {
  // Import all spec files — this registers describe/it blocks
  for (const file of specFiles) {
    try {
      await import(file);
    } catch (e) {
      console.error(`${RED}Failed to load ${file}: ${e.message}${RESET}`);
      console.error(e.stack);
    }
  }

  console.log('\n' + BOLD + '='.repeat(60) + RESET);
  console.log(BOLD + ' Running Tests' + RESET);
  console.log(BOLD + '='.repeat(60) + RESET + '\n');

  await runSuite(rootSuite);

  // Summary
  console.log('\n' + BOLD + '='.repeat(60) + RESET);
  console.log(
    `${BOLD}Results:${RESET}  ` +
    `${GREEN}${results.passed} passed${RESET}  ` +
    `${RED}${results.failed} failed${RESET}  ` +
    `${YELLOW}${results.skipped} skipped${RESET}`
  );

  if (results.errors.length > 0) {
    console.log('\n' + BOLD + RED + 'Failed Tests:' + RESET);
    for (const err of results.errors) {
      console.log(`\n  ${RED}● ${err.name}${RESET}`);
      console.log(`    ${err.message}`);
    }
  }

  console.log('');
  process.exit(results.failed > 0 ? 1 : 0);
}
