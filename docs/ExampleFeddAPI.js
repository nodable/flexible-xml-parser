/**
 * Practical examples of using the feed API
 */

import XMLParser from './src/XMLParser-streaming.js';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

console.log('\n=== Feed API Usage Examples ===\n');

// ============================================================================
// Example 1: Basic chunked parsing
// ============================================================================
console.log('Example 1: Basic chunked parsing');
console.log('-----------------------------------');

const parser1 = new XMLParser();

parser1.feed('<root>');
parser1.feed('<item>value1</item>');
parser1.feed('<item>value2</item>');
parser1.feed('</root>');

const result1 = parser1.end();
console.log('Result:', JSON.stringify(result1, null, 2));

// ============================================================================
// Example 2: Simulating network streaming (async chunks)
// ============================================================================
console.log('\nExample 2: Simulating network streaming');
console.log('------------------------------------------');

async function parseFromNetwork() {
  const parser = new XMLParser();

  // Simulate chunks arriving over time
  const chunks = [
    '<root><users>',
    '<user id="1">',
    '<name>Alice</name>',
    '<email>alice@example.com</email>',
    '</user>',
    '<user id="2">',
    '<name>Bob</name>',
    '<email>bob@example.com</email>',
    '</user>',
    '</users></root>'
  ];

  for (const chunk of chunks) {
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate delay
    parser.feed(chunk);
  }

  return parser.end();
}

await parseFromNetwork().then(result => {
  console.log('Network stream result:', JSON.stringify(result, null, 2));
});

// ============================================================================
// Example 3: Using callbacks for streaming output
// ============================================================================
console.log('\nExample 3: Streaming output with callbacks');
console.log('--------------------------------------------');

const completedItems = [];
const parser3 = new XMLParser({
  ignoreAttributes: false,
  onTagComplete: (tagName, value, path, matcher) => {
    // Process items as they complete
    if (tagName === 'product') {
      completedItems.push(value);
      console.log(`  ✓ Completed product: ${JSON.stringify(value)}`);
    }
  }
});

parser3.feed('<catalog>');
parser3.feed('<product id="1"><name>Widget</name><price>9.99</price></product>');
parser3.feed('<product id="2"><name>Gadget</name><price>19.99</price></product>');
parser3.feed('<product id="3"><name>Doohickey</name><price>29.99</price></product>');
parser3.feed('</catalog>');

const result3 = parser3.end();
console.log(`\nProcessed ${completedItems.length} products in streaming mode`);

// ============================================================================
// Example 4: Method chaining
// ============================================================================
console.log('\nExample 4: Method chaining');
console.log('---------------------------');

const result4 = new XMLParser()
  .feed('<config>')
  .feed('<database>')
  .feed('<host>localhost</host>')
  .feed('<port>5432</port>')
  .feed('</database>')
  .feed('</config>')
  .end();

console.log('Config:', JSON.stringify(result4, null, 2));

// ============================================================================
// Example 5: Monitoring buffer stats
// ============================================================================
console.log('\nExample 5: Monitoring buffer stats');
console.log('------------------------------------');

const parser5 = new XMLParser();
parser5.feed('<root><large>');
parser5.feed('x'.repeat(1000));

const stats = parser5.getBufferStats();
console.log('Buffer stats after feeding:');
console.log(`  Total size: ${stats.totalSize} bytes`);
console.log(`  Unprocessed: ${stats.unprocessedSize} bytes`);
console.log(`  Waiting for data: ${stats.waitingForData}`);
console.log(`  Paused: ${stats.isPaused}`);

parser5.feed('</large></root>');
parser5.end();

// ============================================================================
// Example 6: Handling errors
// ============================================================================
console.log('\nExample 6: Error handling');
console.log('--------------------------');

const parser6 = new XMLParser({
  onError: (error) => {
    console.log('  Parser error caught:', error.message);
  }
});

try {
  parser6.feed('<root>');
  parser6.feed('<item>value</wrong>'); // Mismatched tag
  parser6.feed('</root>');
  parser6.end();
} catch (error) {
  console.log('  Error caught in try/catch:', error.message);
}

// ============================================================================
// Example 7: Processing large XML files in chunks
// ============================================================================
console.log('\nExample 7: Large file processing (simulated)');
console.log('----------------------------------------------');

function simulateLargeFileProcessing() {
  const parser = new XMLParser({
    onTagComplete: (tagName, value, path) => {
      if (tagName === 'record') {
        // Process each record immediately instead of storing all in memory
        // In real scenario: saveToDatabase(value);
        console.log(`  Processed record: ${JSON.stringify(value).substring(0, 50)}...`);
      }
    }
  });

  // Simulate reading large file in chunks
  parser.feed('<dataset>');

  for (let i = 1; i <= 5; i++) {
    parser.feed(`<record id="${i}">`);
    parser.feed(`<data>Data for record ${i}</data>`);
    parser.feed('</record>');
  }

  parser.feed('</dataset>');
  parser.end();

  console.log('  Large file processing complete');
}

simulateLargeFileProcessing();

// ============================================================================
// Example 8: Reusing parser for multiple documents
// ============================================================================
console.log('\nExample 8: Reusing parser');
console.log('--------------------------');

const reusableParser = new XMLParser();

// Parse first document
reusableParser.feed('<doc1><item>value1</item></doc1>');
const doc1 = reusableParser.end();
console.log('Document 1:', JSON.stringify(doc1));

// Parse second document
reusableParser.feed('<doc2><item>value2</item></doc2>');
const doc2 = reusableParser.end();
console.log('Document 2:', JSON.stringify(doc2));

// ============================================================================
// Example 9: Working with different data types
// ============================================================================
console.log('\nExample 9: Different data types');
console.log('--------------------------------');

const parser9 = new XMLParser();

// String
parser9.feed('<root>');

// Buffer
parser9.feed(Buffer.from('<item>'));

// String again
parser9.feed('value');

// Buffer again
parser9.feed(Buffer.from('</item>'));

parser9.feed('</root>');

const result9 = parser9.end();
console.log('Mixed input types result:', JSON.stringify(result9));

// ============================================================================
// Example 10: Value parsers in streaming mode
// ============================================================================
console.log('\nExample 10: Value parsers in streaming');
console.log('----------------------------------------');

const parser10 = new XMLParser({
  // Value parsers work the same in streaming mode
});

parser10.feed('<data>');
parser10.feed('<boolean>true</boolean>');
parser10.feed('<integer>42</integer>');
parser10.feed('<float>3.14159</float>');
parser10.feed('<hex>0xFF</hex>');
parser10.feed('<string>hello</string>');
parser10.feed('</data>');

const result10 = parser10.end();
console.log('Parsed values:');
console.log('  boolean:', result10.data.boolean, typeof result10.data.boolean);
console.log('  integer:', result10.data.integer, typeof result10.data.integer);
console.log('  float:', result10.data.float, typeof result10.data.float);
console.log('  hex:', result10.data.hex, typeof result10.data.hex);
console.log('  string:', result10.data.string, typeof result10.data.string);

console.log('\n=== Examples Complete ===\n');