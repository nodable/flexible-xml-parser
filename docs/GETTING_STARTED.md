# Getting Started with Flex XML Parser v6

Welcome to Flex XML Parser v6! This guide will get you up and running quickly.

## Installation

```bash
npm install flex-xml-parser
```

## Your First Parser

Create a file `example.js`:

```javascript
import XMLParser from 'flex-xml-parser';

const xmlData = `
  <books>
    <book id="1">
      <title>The Great Gatsby</title>
      <author>F. Scott Fitzgerald</author>
      <year>1925</year>
      <price>10.99</price>
    </book>
    <book id="2">
      <title>1984</title>
      <author>George Orwell</author>
      <year>1949</year>
      <price>12.99</price>
    </book>
  </books>
`;

const parser = new XMLParser({
  ignoreAttributes: false  // We want to parse the 'id' attribute
});

const result = parser.parse(xmlData);
console.log(JSON.stringify(result, null, 2));
```

Run it:
```bash
node example.js
```

Output:
```json
{
  "books": {
    "book": [
      {
        "@_id": "1",
        "title": "The Great Gatsby",
        "author": "F. Scott Fitzgerald",
        "year": 1925,
        "price": 10.99
      },
      {
        "@_id": "2",
        "title": "1984",
        "author": "George Orwell",
        "year": 1949,
        "price": 12.99
      }
    ]
  }
}
```

## Common Use Cases

### 1. Parse Configuration Files

```javascript
import XMLParser from 'flex-xml-parser';

const configXml = `
  <config>
    <database>
      <host>localhost</host>
      <port>5432</port>
      <name>myapp</name>
    </database>
    <cache>
      <enabled>true</enabled>
      <ttl>3600</ttl>
    </cache>
  </config>
`;

const parser = new XMLParser();
const config = parser.parse(configXml);

// Access config values
console.log(config.config.database.host);    // 'localhost'
console.log(config.config.database.port);    // 5432 (automatically converted to number)
console.log(config.config.cache.enabled);    // true (automatically converted to boolean)
```

### 2. Parse RSS Feeds

```javascript
import XMLParser from 'flex-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  transformTagName: (tagName) => tagName.replace(':', '_')  // Handle namespaced tags
});

const feed = parser.parse(rssFeedXml);

for (const item of feed.rss.channel.item) {
  console.log(`Title: ${item.title}`);
  console.log(`Link: ${item.link}`);
  console.log(`Date: ${item.pubDate}`);
  console.log('---');
}
```

### 3. Parse API Responses

```javascript
import XMLParser from 'flex-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  tags: {
    valueParsers: ['trim', 'boolean', 'number']
  }
});

const response = await fetch('https://api.example.com/data.xml');
const xmlText = await response.text();
const data = parser.parse(xmlText);

console.log(data);
```

### 4. Keep Leading Zeros

```javascript
import XMLParser from 'flex-xml-parser';
import numberParser from 'flex-xml-parser/valueParsers/number';

const xmlData = `
  <products>
    <product>
      <sku>00123</sku>
      <price>19.99</price>
    </product>
  </products>
`;

const parser = new XMLParser({
  tags: {
    valueParsers: [
      'trim',
      new numberParser({
        leadingZeros: false  // Keep leading zeros in SKUs
      }),
      'boolean'
    ]
  }
});

const result = parser.parse(xmlData);
console.log(result.products.product.sku);    // "00123" (kept as string)
console.log(result.products.product.price);  // 19.99 (converted to number)
```

### 5. Disable All Parsing (Raw Strings)

```javascript
import XMLParser from 'flex-xml-parser';

const parser = new XMLParser({
  tags: { valueParsers: [] },
  attributes: { valueParsers: [] }
});

const xmlData = '<data><number>123</number><bool>true</bool></data>';
const result = parser.parse(xmlData);

console.log(result.data.number);  // "123" (string)
console.log(result.data.bool);    // "true" (string)
```

### 6. Parse with Validation

```javascript
import XMLParser from 'flex-xml-parser';

const parser = new XMLParser();

const untrustedXml = getUserInput();  // From user/external source

try {
  // Validate before parsing
  const result = parser.parse(untrustedXml, true);
  console.log('Valid XML:', result);
} catch (error) {
  console.error('Invalid XML:', error.message);
  // Handle error gracefully
}
```

### 7. Handle CDATA

```javascript
import XMLParser from 'flex-xml-parser';

const xmlData = `
  <content>
    <description>Some text</description>
    <html><![CDATA[<div><p>HTML content</p></div>]]></html>
  </content>
`;

// Option 1: Merge CDATA into text (default)
const parser1 = new XMLParser();
const result1 = parser1.parse(xmlData);
console.log(result1.content.html);  
// "<div><p>HTML content</p></div>"

// Option 2: Separate CDATA property
const parser2 = new XMLParser({
  cdataPropName: '__cdata'
});
const result2 = parser2.parse(xmlData);
console.log(result2.content.html.__cdata);
// "<div><p>HTML content</p></div>"
```

### 8. Handle Namespaces

```javascript
import XMLParser from 'flex-xml-parser';

const xmlData = `
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <m:GetPrice xmlns:m="http://www.example.com/prices">
        <m:Item>Apple</m:Item>
      </m:GetPrice>
    </soap:Body>
  </soap:Envelope>
`;

const parser = new XMLParser({
  removeNSPrefix: true,  // Remove 'soap:' and 'm:' prefixes
  ignoreAttributes: false
});

const result = parser.parse(xmlData);
console.log(result.Envelope.Body.GetPrice.Item);  // "Apple"
```

## Next Steps

1. **Read the full documentation**: See `DOCUMENTATION.md` for complete API reference
2. **Check examples**: Look at `test-basic.js` and `test-suite.js` for more examples
3. **Explore options**: Review all available options in `DOCUMENTATION.md`
4. **Try different output builders**: Experiment with NodeTreeBuilder and JsMinArrBuilder
5. **Create custom value parsers**: Build parsers for your specific data formats

## Quick Reference

### Most Used Options

```javascript
const parser = new XMLParser({
  // Attributes
  ignoreAttributes: false,           // Parse attributes
  attributeNamePrefix: '@_',         // Prefix for attributes
  
  // Values
  tags: {
    valueParsers: ['trim', 'boolean', 'number']  // Auto-convert types
  },
  
  // Namespaces
  removeNSPrefix: true,              // Remove namespace prefixes
  
  // Special content
  cdataPropName: '__cdata',          // Property for CDATA
  commentPropName: '__comment',      // Property for comments
  
  // Structure
  unpairedTags: ['br', 'img'],       // Self-closing tags
  alwaysCreateTextNode: false,       // Force text node property
  
  // Security
  processEntities: false,            // Don't expand entities (for untrusted XML)
  maxEntityCount: 100,               // Limit entity count
  maxEntitySize: 1048576            // Limit entity size (1MB)
});
```

### Common Patterns

```javascript
// Pattern 1: Parse config with attributes and numbers
new XMLParser({
  ignoreAttributes: false,
  tags: { valueParsers: ['trim', 'number', 'boolean'] }
})

// Pattern 2: Parse untrusted XML safely
new XMLParser({
  processEntities: false,
  maxEntityCount: 50,
  maxEntitySize: 512 * 1024
})

// Pattern 3: Keep everything as strings
new XMLParser({
  tags: { valueParsers: [] },
  attributes: { valueParsers: [] }
})

// Pattern 4: Clean namespace handling
new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false
})
```

## Troubleshooting

**Q: My numbers are staying as strings**
```javascript
// Make sure number parser is enabled
const parser = new XMLParser({
  tags: { valueParsers: ['number'] }
});
```

**Q: I don't see attributes**
```javascript
// Enable attribute parsing
const parser = new XMLParser({
  ignoreAttributes: false
});
```

**Q: Leading zeros are being removed**
```javascript
import numberParser from 'flex-xml-parser/valueParsers/number';

const parser = new XMLParser({
  tags: {
    valueParsers: [
      new numberParser({ leadingZeros: false })
    ]
  }
});
```

## Need Help?

- Check `DOCUMENTATION.md` for complete API reference
- Look at test files for more examples
- Open an issue on GitHub

Happy parsing! 🎉
