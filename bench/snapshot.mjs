import XMLParser from './src/XMLParser.js';
import { xmlEnclosures } from './src/StopNodeProcessor.js';
import { CompactBuilderFactory, CompactBuilder } from '@nodable/compact-builder';

const cases = [];

function add(name, xml, options) {
  cases.push({ name, xml, options });
}

const ATTRS_ON = { skip: { attributes: false } };

add('basic', `<root a="1" b='2' c><child ns:x="y" xmlns:ns="urn:x">text &amp; more</child></root>`, ATTRS_ON);
add('attrs-many', `<a a1="v1" a2="v2" a3="v3" bool a5="v5" a6="multi word" a7="line1&#10;line2"><b/></a>`, ATTRS_ON);
add('self-closing-unpaired', `<root><br/><img src="x.png"/><br></root>`, { tags: { unpaired: ['br'] }, skip: { attributes: false } });
add('namespaces', `<ns:root xmlns:ns="urn:x" ns:attr="v"><ns:child>hi</ns:child></ns:root>`, ATTRS_ON);
add('skip-ns', `<ns:root xmlns:ns="urn:x" ns:attr="v"><ns:child>hi</ns:child></ns:root>`, { skip: { nsPrefix: true, attributes: false } });
add('cdata', `<root><![CDATA[some <raw> & text]]></root>`);
add('comment', `<root><!-- a comment --><child/></root>`);
add('pi', `<?xml version="1.0" encoding="UTF-8"?><root><?pi-target data?><child/></root>`);
add('doctype', `<!DOCTYPE root [ <!ENTITY foo "bar"> ]><root>&foo;</root>`, { doctypeOptions: { enabled: true } });
add('stopnode-plain', `<root><script>if (a < b && c > d) { alert('x'); }</script><after>ok</after></root>`, {
  tags: { stopNodes: ['root.script'] }
});
add('stopnode-nested', `<root><code>outer <code>inner</code> end</code></root>`, {
  tags: { stopNodes: [{ expression: 'root.code', nested: true }] }
});
add('stopnode-enclosures', `<root><style>.a { content: "<b>"; } /* <c> */</style></root>`, {
  tags: { stopNodes: [{ expression: 'root.style', skipEnclosures: [...xmlEnclosures, { open: '"', close: '"' }] }] }
});
add('skiptag', `<root><secret>drop me</secret><keep>me</keep></root>`, {
  skip: { tags: ['root.secret'] }
});
add('mismatched-autoclose', `<root><a><b>text</a></root>`, { autoClose: 'recover' });
add('deep-nesting', `<a><b><c><d attr1="x" attr2="y"><e>leaf</e></d></c></b></a>`, ATTRS_ON);
add('long-text', `<root>${'x'.repeat(5000)}</root>`);
add('many-attrs', `<root ${Array.from({length: 50}, (_,i)=>`a${i}="v${i}"`).join(' ')}>hi</root>`, ATTRS_ON);
add('empty-attrs-edge', `<root a="" b=''></root>`, ATTRS_ON);
add('unicode-names', `<réunion attr="é">café</réunion>`, ATTRS_ON);
add('dangerous-attr', `<root toString="x" hasOwnProperty="y">z</root>`, ATTRS_ON);
add('boolean-attrs', `<input disabled checked type="text"/>`, ATTRS_ON);
add('multiline-attr', `<root a="line1\nline2\r\nline3">x</root>`, ATTRS_ON);
add('exitIf', `<root><a>1</a><stop/><b>2</b></root>`, {
  exitIf: (m) => m.getCurrentTag() === 'stop'
});

add('attr-position-index', `<root a="1" bbbb="22" c="333"><child x="y"/></root>`, ATTRS_ON);
add('attr-single-vs-double-quote', `<root a='single' b="double" c=mixed></root>`, ATTRS_ON);
add('attr-value-with-newlines', `<root a="a\nb\rc\r\nd"/>`, ATTRS_ON);
add('attr-xmlns-drop', `<root xmlns="urn:default" xmlns:ns="urn:ns" ns:x="1" y="2"/>`, { skip: { nsPrefix: true, attributes: false } });
add('attr-order-preserved', `<root z="1" a="2" m="3"/>`, ATTRS_ON);
add('big-doc-perf', (() => {
  let s = '<root>';
  for (let i = 0; i < 2000; i++) s += `<item id="${i}" name="item-${i}" active="true" tag="x">value ${i}</item>`;
  s += '</root>';
  return s;
})(), ATTRS_ON);

add('ascii-only-name-rejects-unicode', `<réunion attr="é">café</réunion>`, { asciiOnlyName: true, skip: { attributes: false } });
add('ascii-only-name-accepts-ascii', `<room attr="ok">hi</room>`, { asciiOnlyName: true, skip: { attributes: false } });
add('skip-name-validation', `<1bad-name attr="x">y</1bad-name>`, { skip: { nameValidation: true, attributes: false } });
add('skip-proto-validation', `<root __proto__="x">y</root>`, { skip: { protoValidation: true, attributes: false } });
add('doctype-entity-name-validation', `<!DOCTYPE root [ <!ENTITY 1bad "x"> ]><root>&amp;</root>`, { doctypeOptions: { enabled: true } });

const results = {};
for (const c of cases) {
  try {
    const parser = new XMLParser(c.options);
    const out = parser.parse(c.xml);
    results[c.name] = { ok: true, out };
  } catch (e) {
    results[c.name] = { ok: false, err: e.message, code: e.code };
  }
}

// Feed API test
try {
  const parser = new XMLParser();
  parser.feed('<root><a>1</a>');
  parser.feed('<b>2</b></root>');
  results['feed-api'] = { ok: true, out: parser.end() };
} catch (e) {
  results['feed-api'] = { ok: false, err: e.message, code: e.code };
}

// parseBytesArr test
try {
  const parser = new XMLParser();
  const buf = Buffer.from('<root a="1">hello</root>', 'utf8');
  results['bytes-api'] = { ok: true, out: parser.parseBytesArr(buf) };
} catch (e) {
  results['bytes-api'] = { ok: false, err: e.message, code: e.code };
}

// Position metadata regression (mirrors specs/position-*_spec.js patterns)
{
  const posEvents = [];
  class RecordingBuilder extends CompactBuilder {
    addElement(tag, matcher) {
      posEvents.push({ name: tag.name, line: tag.line, col: tag.col, index: tag.index, openEnd: tag.openEnd });
      super.addElement(tag, matcher);
    }
  }
  const factory = {
    getInstance(parserOpts, readonlyMatcher) {
      const base = new CompactBuilderFactory();
      return new RecordingBuilder(parserOpts, base.builderOptions, readonlyMatcher, base.registry);
    }
  };
  const xml = `<root><a/>\n<b/><![CDATA[l1\nl2\nl3]]><tail/></root>`;
  try {
    const p = new XMLParser({ OutputBuilder: factory });
    const out = p.parse(xml);
    results['position-meta-events'] = { ok: true, out, events: posEvents };
  } catch (e) {
    results['position-meta-events'] = { ok: false, err: e.message, code: e.code };
  }
}

console.log(JSON.stringify(results, null, 2));
