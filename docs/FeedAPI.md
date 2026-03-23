# Streaming Feed API Proposal for flex-xml-parser

## Overview

This proposal introduces a flexible streaming feed API that allows incremental XML data feeding while maintaining the core parsing capabilities and flexibility of flex-xml-parser.

## Current Architecture Analysis

### Strengths
1. **Already stream-ready internally**: The parser uses `StringSource`/`BufferSource` with buffer boundary management
2. **Character-by-character processing**: Main parsing loop reads one character at a time
3. **State preservation**: Parser maintains state through `tagsStack`, `currentTagDetail`, `tagTextData`
4. **Pluggable output builders**: Clean separation between parsing logic and output generation

### Key Components
- **StringSource/BufferSource**: Input abstraction with buffer management
- **Xml2JsParser**: Core parsing state machine
- **XMLParser**: Public API wrapper
- **OutputBuilder**: Result construction

## Proposed API Design

### 1. Basic Feed API

```javascript
const parser = new XMLParser(options);

// Feed data incrementally
parser.feed('<root><item>');
parser.feed('value1</item>');
parser.feed('<item>value2');
parser.feed('</item></root>');

// Finalize and get result
const result = parser.end();
```

### 2. Extended API with Callbacks

```javascript
const parser = new XMLParser({
  ...normalOptions,
  onNeedData: () => {
    // Called when parser needs more data to continue
    // User can call parser.feed() here or return data
    const chunk = getNextChunk();
    if (chunk) {
      parser.feed(chunk);
    }
  },
  onTagComplete: (tagName, value, path) => {
    // Optional: streaming output - called when a tag is fully parsed
    console.log('Completed tag:', tagName, 'at path:', path);
  },
  onError: (error) => {
    // Handle parsing errors
    console.error('Parse error:', error);
  }
});

parser.feed(data);
const result = parser.end();
```

### 3. Stream Integration (Node.js)

```javascript
import { XMLParser } from 'flex-xml-parser';
import { createReadStream } from 'fs';

const parser = new XMLParser(options);

// Direct stream support
const stream = createReadStream('large-file.xml');
const result = await parser.parseStream(stream);

// OR manual feeding from stream
stream.on('data', chunk => parser.feed(chunk));
stream.on('end', () => {
  const result = parser.end();
  console.log(result);
});
```

### 4. Async/Promise API

```javascript
const parser = new XMLParser(options);

// Returns a promise that resolves when more data is fed
await parser.feedAsync('<root>');
await parser.feedAsync('<item>value</item>');
const result = await parser.endAsync();
```

## Implementation Strategy

### Phase 1: Core Feed Mechanism

#### 1.1 Modify Input Sources

Create a `FeedableSource` class that can accept incremental data:

```javascript
class FeedableSource {
  constructor() {
    this.buffer = '';
    this.startIndex = 0;
    this.isComplete = false;
    this.waitingForData = false;
  }

  feed(data) {
    // Convert buffer/string to string
    const newData = typeof data === 'string' ? data : data.toString();
    
    // Append to buffer
    this.buffer += newData;
    this.waitingForData = false;
  }

  end() {
    this.isComplete = true;
  }

  canRead() {
    const available = this.buffer.length - this.startIndex > 0;
    if (!available && !this.isComplete) {
      this.waitingForData = true;
      return false;
    }
    return available;
  }

  // Implement same interface as StringSource
  readCh() { /* ... */ }
  readChAt(index) { /* ... */ }
  readStr(n, from) { /* ... */ }
  readUpto(stopStr) { /* ... */ }
  updateBufferBoundary(n) { 
    this.startIndex += n;
    // Optimization: Clear processed data to free memory
    if (this.startIndex > 1024) {
      this.buffer = this.buffer.substring(this.startIndex);
      this.startIndex = 0;
    }
  }
}
```

#### 1.2 Modify Xml2JsParser

```javascript
export default class Xml2JsParser {
  constructor(options) {
    // ... existing code ...
    this.isPaused = false;
    this.onNeedData = options.onNeedData || null;
  }

  parseXml() {
    while(this.source.canRead()) {
      // If source is waiting for data
      if (this.source.waitingForData) {
        if (this.onNeedData) {
          this.onNeedData();
          // After callback, try again
          if (!this.source.canRead()) {
            this.isPaused = true;
            return; // Pause parsing
          }
        } else {
          this.isPaused = true;
          return; // Pause until feed() is called
        }
      }

      let ch = this.source.readCh();
      // ... rest of parsing logic ...
    }
  }

  resume() {
    if (this.isPaused) {
      this.isPaused = false;
      this.parseXml();
    }
  }
}
```

#### 1.3 Update XMLParser API

```javascript
export default class XMLParser {
  constructor(options) {
    this.externalEntities = {};
    this.options = buildOptions(options);
    this.parser = null;
    this.source = null;
  }

  // New: Initialize for streaming
  startStreaming() {
    this.source = new FeedableSource();
    this.parser = new Xml2JsParser(this.options);
    this.parser.source = this.source;
    // Initialize parser state
    this.parser.outputBuilder = this.options.OutputBuilder.getInstance(this.options);
    this.parser.root = { root: true, name: "" };
    this.parser.currentTagDetail = this.parser.root;
  }

  // Feed data incrementally
  feed(data) {
    if (!this.source) {
      this.startStreaming();
    }
    
    this.source.feed(data);
    
    // Resume parsing if paused
    if (this.parser.isPaused) {
      this.parser.resume();
    } else {
      // Start parsing
      this.parser.parseXml();
    }
  }

  // Finalize and get result
  end() {
    if (!this.source) {
      throw new Error('No data fed. Call feed() before end()');
    }
    
    this.source.end();
    
    // Complete any remaining parsing
    if (this.parser.isPaused) {
      this.parser.resume();
    }
    
    return this.parser.outputBuilder.getOutput();
  }

  // Existing parse method remains unchanged for backward compatibility
  parse(xmlData) {
    // ... existing implementation ...
  }
}
```

### Phase 2: Enhanced Features

#### 2.1 Error Recovery

```javascript
feed(data, options = {}) {
  try {
    // ... feed logic ...
  } catch (error) {
    if (options.continueOnError) {
      // Store error but continue
      this.errors.push(error);
    } else {
      throw error;
    }
  }
}
```

#### 2.2 Progressive Output (Streaming Results)

```javascript
const options = {
  onTagComplete: (tagName, value, path, matcher) => {
    // Stream output as tags complete
    // Useful for processing large documents incrementally
    if (matcher.matches('root > item')) {
      processItem(value);
    }
  }
};
```

#### 2.3 Memory Management

```javascript
const options = {
  maxBufferSize: 10 * 1024 * 1024, // 10MB
  autoFlush: true, // Auto-clear processed buffer
  onBufferFull: (size) => {
    console.warn(`Buffer full: ${size} bytes`);
  }
};
```

## Usage Examples

### Example 1: Chunked Network Response

```javascript
// Parsing XML from HTTP response
async function parseFromUrl(url) {
  const response = await fetch(url);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  const parser = new XMLParser();
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) {
      return parser.end();
    }
    
    const chunk = decoder.decode(value, { stream: true });
    parser.feed(chunk);
  }
}
```

### Example 2: Large File Processing

```javascript
import { createReadStream } from 'fs';

const parser = new XMLParser({
  onTagComplete: (tagName, value, path) => {
    // Process each record as it's parsed
    if (path === 'root.records.record') {
      saveToDatabase(value);
    }
  }
});

const stream = createReadStream('huge-file.xml', { 
  encoding: 'utf8',
  highWaterMark: 64 * 1024 // 64KB chunks
});

stream.on('data', chunk => {
  parser.feed(chunk);
});

stream.on('end', () => {
  parser.end();
  console.log('Processing complete');
});
```

### Example 3: Interactive Parsing

```javascript
const parser = new XMLParser({
  onNeedData: () => {
    console.log('Parser needs more data...');
  }
});

// Simulate slow data arrival
parser.feed('<root>');
setTimeout(() => parser.feed('<item>'), 100);
setTimeout(() => parser.feed('value'), 200);
setTimeout(() => parser.feed('</item></root>'), 300);
setTimeout(() => {
  const result = parser.end();
  console.log(result);
}, 400);
```

### Example 4: WebSocket Stream

```javascript
const ws = new WebSocket('ws://example.com/xml-stream');
const parser = new XMLParser();

ws.onmessage = (event) => {
  parser.feed(event.data);
};

ws.onclose = () => {
  const result = parser.end();
  console.log('Final result:', result);
};
```

## Backward Compatibility

✅ **100% Backward Compatible**: Existing `parse()`, `parseBytesArr()`, and `parseStream()` methods remain unchanged.

```javascript
// Old API - still works exactly the same
const parser = new XMLParser(options);
const result = parser.parse(xmlString);

// New API - optional
const streamingParser = new XMLParser(options);
streamingParser.feed(chunk1);
streamingParser.feed(chunk2);
const result2 = streamingParser.end();
```

## Performance Considerations

### Memory Optimization
1. **Buffer truncation**: Clear processed data when buffer exceeds threshold
2. **Configurable limits**: Allow users to set max buffer size
3. **Streaming output**: Process and discard data as tags complete

### Performance Metrics
- **Memory usage**: ~O(buffer size) instead of O(total document size)
- **Latency**: Start processing immediately, don't wait for complete document
- **Throughput**: Similar to current implementation for full-document parsing

## Security Considerations

1. **Buffer limits**: Prevent memory exhaustion attacks
2. **Entity processing**: Existing entity limits still apply
3. **Partial document handling**: Validate at end() that document is complete

## Testing Strategy

### Unit Tests
```javascript
describe('Feed API', () => {
  it('should parse XML fed in chunks', () => {
    const parser = new XMLParser();
    parser.feed('<root>');
    parser.feed('<item>value1</item>');
    parser.feed('<item>value2</item>');
    parser.feed('</root>');
    
    const result = parser.end();
    expect(result).toEqual({
      root: {
        item: ['value1', 'value2']
      }
    });
  });

  it('should handle single character chunks', () => {
    const parser = new XMLParser();
    const xml = '<root><item>test</item></root>';
    
    for (let char of xml) {
      parser.feed(char);
    }
    
    const result = parser.end();
    expect(result.root.item).toBe('test');
  });

  it('should throw error on incomplete document', () => {
    const parser = new XMLParser();
    parser.feed('<root><item>');
    
    expect(() => parser.end()).toThrow();
  });
});
```

### Integration Tests
- Test with real HTTP streams
- Test with large files (>100MB)
- Test with various chunk sizes
- Test error scenarios

## Migration Guide

### For Library Users

**No changes required** for existing code. The feed API is purely additive.

**To use new feed API:**

```javascript
// Before (still works)
const result = parser.parse(xmlString);

// After (new capability)
parser.feed(chunk1);
parser.feed(chunk2);
const result = parser.end();
```

### For Library Maintainers

1. Add `FeedableSource` class
2. Update `Xml2JsParser` to support pause/resume
3. Add feed/end methods to `XMLParser`
4. Add comprehensive tests
5. Update documentation
6. No breaking changes to existing code

## Alternatives Considered

### Alternative 1: Generator-based API
```javascript
function* parse(chunks) {
  for (const chunk of chunks) {
    yield processChunk(chunk);
  }
}
```
❌ More complex, less intuitive for users

### Alternative 2: Event Emitter
```javascript
parser.on('data', chunk => {});
parser.on('end', result => {});
```
❌ Mixes output with input, less clear API

### Alternative 3: Pull-based Iterator
```javascript
const iterator = parser.parse();
iterator.feed(chunk);
const result = iterator.next();
```
❌ Overcomplicated for simple use cases

## Conclusion

The proposed feed API provides:

✅ **Flexibility**: Support multiple feeding patterns  
✅ **Backward compatibility**: Zero breaking changes  
✅ **Performance**: Efficient memory usage for large documents  
✅ **Simplicity**: Intuitive API that matches user expectations  
✅ **Power**: Advanced features (callbacks, streaming output) available when needed  

The implementation leverages existing internal architecture (buffer management, state machine) making it a natural extension of the current design rather than a fundamental rewrite.

## Recommended Next Steps

1. **Prototype**: Implement `FeedableSource` and basic feed/end API
2. **Test**: Create comprehensive test suite
3. **Refine**: Based on real-world usage patterns
4. **Document**: Update README and add examples
5. **Release**: Ship as 6.1.0 (minor version, backward compatible)