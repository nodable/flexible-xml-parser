import { XMLParser as FlexParser } from '../../src/index.js';
import { XMLParser as FastParser } from 'fast-xml-parser';

const testXML = `
<root>
  <num>123</num>
  <hex>0xFF</hex>
  <float>3.14</float>
  <inf>1e1000</inf>
</root>
`;

const iterations = 10000;

console.time('flex-xml-parser');
for (let i = 0; i < iterations; i++) {
  new FlexParser().parse(testXML);
}
console.timeEnd('flex-xml-parser');

console.time('fast-xml-parser');
for (let i = 0; i < iterations; i++) {
  new FastParser().parse(testXML);
}
console.timeEnd('fast-xml-parser');