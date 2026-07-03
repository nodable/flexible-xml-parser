# Contributing to Flex XML Parser

Thank you for your interest in contributing to Flex XML Parser! This document provides guidelines and instructions for contributing.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)

## Code of Conduct

Be respectful, constructive, and professional in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/flexible-xml-parser.git`
3. Create a branch: `git checkout -b feature/your-feature-name`

## Development Setup

```bash
# Install dependencies (currently minimal)
npm install

# Run tests
npm run test

# Performance tests
node bench/bench.mjs
```

## Making Changes

### Adding New Options

1. Add to `defaultOptions` in `OptionsBuilder.js`
2. Handle in `syncBackwardCompatibility()` if it's a top-level option
3. Update TypeScript definitions in `index.d.ts`
4. Document in docs/options.md for new options and in relevant file in docs folder.


### Writing Tests

Add tests following jasmine syntax. Use testRunner methods to run test for all supported input sources.

```javascript
runAcrossAllInputSources(
  "should handle multiple attributes on root tag",
  `<root version="1.0" lang="en"><child/></root>`,
  (result) => {
    expect(result.root["@_version"]).toBe(1);
    expect(result.root["@_lang"]).toBe("en");
  },
  { skip: { attributes: false } }
);
```

### Test Coverage

Ensure your changes are covered by tests:
- Positive test cases (expected behavior)
- Negative test cases (error handling)
- Edge cases
- Backward compatibility

## Submitting Changes

1. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

   Use conventional commit messages:
   - `feat:` New feature
   - `fix:` Bug fix
   - `docs:` Documentation changes
   - `test:` Test additions/changes
   - `refactor:` Code refactoring
   - `perf:` Performance improvements
   - `chore:` Maintenance tasks

2. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create a Pull Request**:
   - Provide a clear description of changes
   - Reference any related issues
   - Include test results
   - Update documentation if needed

## Coding Standards

Understand the responsibility of each method, and class. Try to DRY (Do not Repeat Yourself)

### JavaScript Style

- Use ES6+ features
- Use `const` and `let`, not `var`
- Use arrow functions where appropriate
- Use template literals for string concatenation
- Add JSDoc comments for public APIs

```javascript
/**
 * Parse XML string to JavaScript object
 * @param {string} xmlData - XML string to parse
 * @param {boolean|Object} validationOption - Optional validation
 * @returns {Object} Parsed JavaScript object
 */
parse(xmlData, validationOption) {
  // Implementation
}
```

### Module Imports

Always use explicit `.js` extensions:

```javascript
// Good
import XMLParser from './XMLParser.js';

// Bad
import XMLParser from './XMLParser';
```

### Error Handling

Provide descriptive error messages:

```javascript
// Good
throw new Error(`Invalid tag name '${tagName}' at line ${lineNumber}`);

// Bad  
throw new Error('Invalid tag');
```

### Performance

- Avoid unnecessary object creation in hot paths
- Reuse variables where possible
- Use early returns to reduce nesting
- Profile before optimizing

### Documentation

- Update README.md for user-facing changes
- Update detail documentation in docs folder in relevant file.
- Add JSDoc comments for all public APIs
- Include examples for new features
- Don't update CHANGELOG.md. This would be updated at the time of release.

## Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows project style guidelines
- [ ] All tests pass (`node test-suite.js`)
- [ ] New features have tests
- [ ] Documentation is updated
- [ ] TypeScript definitions are updated
- [ ] No console.log or debugging code
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with main
- [ ] No change in generated files like browser bundle or `package-lock.json` etc.

## Questions?

Feel free to:
- Open an issue for discussion
- Ask questions in pull requests
- Reach out to maintainers

Thank you for contributing!
