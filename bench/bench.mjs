import XMLParser from './../src/XMLParser.js';

function buildDoc(n) {
  let s = '<catalog>';
  for (let i = 0; i < n; i++) {
    s += `<item id="${i}" sku="SKU-${i}" category="cat-${i % 20}" active="true" featured="false" weight="${(i * 1.5).toFixed(2)}">`;
    s += `<name>Item number ${i}</name><desc>Some description text for item ${i} with a bit more content to simulate real text nodes.</desc>`;
    // s += `<script>if (a < b && c > ${i}) { doStuff('${i}'); }</script>`;
    s += `</item>`;
  }
  s += '</catalog>';
  return s;
}

const doc = buildDoc(20000);
console.log('doc size (chars):', doc.length);

const options = {
  skip: {
    attributes: false,
    nameValidation: true,
    protoValidation: true,

  },
  asciiOnlyName: true,
  // tags: { stopNodes: ['..script'] }
};

function run(label, iterations) {
  // warmup
  for (let i = 0; i < 2; i++) {
    const p = new XMLParser(options);
    p.parse(doc);
  }
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    const p = new XMLParser(options);
    p.parse(doc);
  }
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  console.log(`${label}: ${iterations} iterations, total ${ms.toFixed(1)}ms, avg ${(ms / iterations).toFixed(2)}ms/parse`);
}

run('parse()', 15);

// feed()/end() streaming-ish benchmark, chunked
function runFeed(label, iterations, chunkSize) {
  for (let i = 0; i < 2; i++) {
    const p = new XMLParser(options);
    for (let off = 0; off < doc.length; off += chunkSize) p.feed(doc.slice(off, off + chunkSize));
    p.end();
  }
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    const p = new XMLParser(options);
    for (let off = 0; off < doc.length; off += chunkSize) p.feed(doc.slice(off, off + chunkSize));
    p.end();
  }
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  console.log(`${label}: ${iterations} iterations, chunk=${chunkSize}, total ${ms.toFixed(1)}ms, avg ${(ms / iterations).toFixed(2)}ms/parse`);
}

runFeed('feed()/end() 4KB chunks', 10, 4096);
