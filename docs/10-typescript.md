# 10 — TypeScript

`@nodable/flexible-xml-parser` ships complete TypeScript definitions for both ESM (`src/fxp.d.ts`) and CommonJS (`lib/fxp.d.cts`). No `@types` package is needed.

---

## Basic Usage

```typescript
import XMLParser, { X2jOptions } from '@nodable/flexible-xml-parser';

const options: X2jOptions = {
  skip:    { attributes: false, nsPrefix: true },
  nameFor: { cdata: '#cdata' },
  limits:  { maxNestedTags: 100 },
};

const parser = new XMLParser(options);
const result = parser.parse('<root><tag>42</tag></root>');
```

---

## Key Exported Types

| Export | Description |
|---|---|
| `XMLParser` | The parser class (also the default export) |
| `X2jOptions` | Full options interface for `new XMLParser(options)` |
| `ParseError` | Error class thrown on parse failures |
| `ErrorCode` | Const object with all error code strings |
| `ErrorCodeValue` | Union type of all error code values |
| `SkipOptions` | Type for the `skip` option group |
| `NameForOptions` | Type for the `nameFor` option group |
| `AttributeOptions` | Type for the `attributes` option group |
| `TagOptions` | Type for the `tags` option group |
| `DoctypeOptions` | Type for the `doctypeOptions` option group |
| `LimitsOptions` | Type for the `limits` option group |
| `FeedableOptions` | Type for the `feedable` option group |
| `SkipTagEntry` | Object form of a `skip.tags` entry |
| `StopNodeEntry` | Object form of a `stopNodes` entry |
| `Enclosure` | `{ open: string; close: string }` pair |
| `xmlEnclosures` | Built-in XML enclosure array (comments + CDATA) |
| `quoteEnclosures` | Built-in quote enclosure array |

---

## Error Handling

```typescript
import XMLParser, { ParseError, ErrorCode } from '@nodable/flexible-xml-parser';

const parser = new XMLParser({ limits: { maxNestedTags: 100 } });

try {
  parser.parse(xml);
} catch (e) {
  if (e instanceof ParseError) {
    // e.code is typed as ErrorCodeValue
    if (e.code === ErrorCode.LIMIT_MAX_NESTED_TAGS) {
      console.error('Document too deeply nested');
    } else {
      console.error(e.code, e.message, `line ${e.line} col ${e.col}`);
    }
  } else {
    throw e;
  }
}
```

---

## Custom Output Builder

`BaseOutputBuilder` and `ElementType` are imported from `@nodable/base-output-builder`:

```typescript
import { BaseOutputBuilder, ElementType } from '@nodable/base-output-builder';
import type { TagDetail, ReadOnlyMatcher } from '@nodable/base-output-builder';

class TagListBuilder extends BaseOutputBuilder {
  private tags: string[] = [];

  addElement(tag: TagDetail, matcher: ReadOnlyMatcher): void {
    this.tags.push(tag.name);
  }

  getOutput(): string[] {
    return this.tags;
  }
}
```

---

## Custom Value Parser

```typescript
import { ElementType } from '@nodable/base-output-builder';
import type { ValueParserContext } from '@nodable/base-output-builder';

class UpperCaseParser {
  parse(val: unknown, context?: ValueParserContext): unknown {
    if (context?.elementType === ElementType.ATTRIBUTE) return val;
    return typeof val === 'string' ? val.toUpperCase() : val;
  }
}
```

---

## ESM vs CommonJS

The package uses `"type": "module"` with a bundled CJS output. TypeScript resolves the correct types automatically via the `exports` field in `package.json`:

- ESM (`import`): resolves to `src/fxp.d.ts`
- CJS (`require`): resolves to `lib/fxp.d.cts`

No extra `tsconfig` configuration is needed for standard setups.

---

*This is the end of the documentation series.*

← Back to [README](../README.md)
