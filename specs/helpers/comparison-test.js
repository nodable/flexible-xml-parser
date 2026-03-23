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

const flexResult = new FlexParser().parse(testXML);
const fastResult = new FastParser().parse(testXML);

console.log('Flex:', flexResult);
console.log('Fast:', fastResult);
console.log('Match:', JSON.stringify(flexResult) === JSON.stringify(fastResult));