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
2. Clone your fork: `git clone https://github.com/your-username/flex-xml-parser.git`
3. Create a branch: `git checkout -b feature/your-feature-name`

## Development Setup

```bash
# Install dependencies (currently minimal)
npm install

# Run basic tests
node test-basic.js

# Run comprehensive test suite
node test-suite.js
```

## Project Structure

```
flex-xml-parser/
├── XMLParser.js              # Main entry point
├── Xml2JsParser.js           # Core parsing engine
├── OptionsBuilder.js         # Options management
├── validator.js              # XML validation
├── DocTypeReader.js          # DOCTYPE parsing
├── OutputBuilders/           # Output format builders
│   ├── BaseOutputBuilder.js
│   ├── JsObjBuilder.js
│   ├── JsArrBuilder.js
│   └── JsMinArrBuilder.js
├── valueParsers/             # Value transformation
│   ├── trim.js
│   ├── booleanParser.js
│   ├── number.js
│   └── currency.js
├── inputSource/              # Input handling
│   ├── StringSource.js
│   └── BufferSource.js
├── util.js                   # Utility functions
├── index.js                  # Package exports
└── index.d.ts                # TypeScript definitions
```

## Making Changes

### Adding a New Value Parser

1. Create a new file in `valueParsers/`:

```javascript
// valueParsers/dateParser.js
export default class DateParser {
  constructor(options) {
    this.options = options || {};
  }
  
  parse(val) {
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return new Date(val);
    }
    return val;
  }
}
```

2. Export it in `index.js`:

```javascript
export { default as dateParser } from './valueParsers/dateParser.js';
```

3. Add TypeScript definition in `index.d.ts`:

```typescript
export class dateParser implements ValueParser {
  constructor(options?: any);
  parse(value: any): any;
}
```

4. Add tests in `test-suite.js`

### Adding a New Output Builder

1. Create a new file in `OutputBuilders/`:

```javascript
// OutputBuilders/MyBuilder.js
import BaseOutputBuilder from './BaseOutputBuilder.js';

export default class MyOutputBuilder {
  constructor(options) {
    this.options = options || {};
  }
  
  getInstance(parserOptions) {
    return new MyBuilderInstance(parserOptions, this.options);
  }
}

class MyBuilderInstance extends BaseOutputBuilder {
  constructor(parserOptions, builderOptions) {
    super();
    this.options = { ...builderOptions, ...parserOptions };
    // Initialize your data structure
  }
  
  addElement(tag) {
    // Handle opening tag
  }
  
  closeElement() {
    // Handle closing tag
  }
  
  addValue(text) {
    // Handle text content
  }
  
  getOutput() {
    // Return final output
    return this.result;
  }
}

export { MyBuilderInstance };
```

2. Export in `index.js`

3. Add TypeScript definitions

4. Add documentation and examples

### Adding New Options

1. Add to `defaultOptions` in `OptionsBuilder.js`
2. Handle in `syncBackwardCompatibility()` if it's a top-level option
3. Update TypeScript definitions in `index.d.ts`
4. Document in DOCUMENTATION.md

## Testing

### Running Tests

```bash
# Basic functionality tests
node test-basic.js

# Comprehensive test suite
node test-suite.js

# Individual test
node -e "
import XMLParser from './XMLParser.js';
const parser = new XMLParser();
const result = parser.parse('<root><tag>value</tag></root>');
console.log(result);
"
```

### Writing Tests

Add tests to `test-suite.js`:

```javascript
addTest('Your test name', async () => {
  const { default: XMLParser } = await import('./XMLParser.js');
  
  const xmlData = `<root>...</root>`;
  const expected = { ... };
  
  const parser = new XMLParser({ /* options */ });
  const result = parser.parse(xmlData);
  
  assertEqual(result, expected, 'Test description');
});
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
- Update DOCUMENTATION.md for detailed documentation
- Add JSDoc comments for all public APIs
- Include examples for new features
- Update CHANGELOG.md

## Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows project style guidelines
- [ ] All tests pass (`node test-suite.js`)
- [ ] New features have tests
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated
- [ ] TypeScript definitions are updated
- [ ] No console.log or debugging code
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with main

## Questions?

Feel free to:
- Open an issue for discussion
- Ask questions in pull requests
- Reach out to maintainers

Thank you for contributing!
