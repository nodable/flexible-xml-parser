**1.11.1 (2026-07-16)**
- fix: fix for multiple DOCTYPE declarations found.

**1.11.0 (2026-07-16)**
- fix: previously all attributes without value or unquoted values were being treated as boolean attributes.
- fix: multiple spaces to single space for `\n` or `\r`
- a literal tab inside an attribute value folds to one space
- feat: allow/ignore/error when boolean attributes are found.
- feat: overwrite/ignore/error when duplicate attributes are found.
- feat: Error on Illegal Control Code
- feat: Error on Unquoted attribute value

**1.10.1 (2026-07-14)**
- fix(#10): Position metadata becomes buffer-relative after auto-flush

**1.10.0 (2026-07-11)**
- docs: Add `bufferSize` option
- feat: replace string decoder with custom implementation
- fix (#6): Buffer overflow when parsing XML with huge XML payload


**1.9.0 (2026-07-10)**
- perf: matchAhead for knowen string sequence
- perf: remove row/col to improve speed (10%)
- perf: speed up tag expression reading
- perf: obj creation, skip expressin matching when options are not set

**1.8.0 (2026-07-06)**
- feat: Support multiple encodings
- feat: make santization optional for output builders, who don't want to produce JSON.
- perf: cache tag/attr name validation.

**1.7.0 (2026-07-03)**
- perf: upgrade to xml-naming v0.3.0 to support caching
- perf: parse attributes only once
- perf: quote aware scan: `scanTagExpEnd` to all input sources
- perf: call tag reading methods frequency wise
- perf: autoflush
- fix(#5): StreamSource and FeedableSource don't respect multi-byte characters


**1.6.1 (2026-06-30)**
- Pass xml declaration attributes to output builder irrespection of parser options.

**1.6.0 (2026-06-30)**
- Pass xml declaration attributes to output builder irrespection of parser options.

**1.5.0 (2026-06-30)**
- TagDetail.index/line/col now points at '<' (not past '>')
- TagDetail.openEnd — offset right after the opening tag's '>'
- closeElement(matcher, closeMeta) — new 2nd arg
- addAttribute(name, value, matcher, attrMeta) — new 4th arg
- onStopNode(tagDetail, raw, matcher, stopEnd) — new 4th arg

**1.4.0 (2026-06-16)**
- keep `xml:space` to support spaces in parsed values.
  impact: 'trim' is replaced with 'ws' in pipeline. It means, whitespaces in tags values would be normalized.
- upgrade `base-output-builder` to v2
  check [Changelog.md](https://github.com/nodable/flexible-output-builders/blob/main/Changelogs.md)
- upgrade `compact-output-builder` to v2
  check [Changelog.md](https://github.com/nodable/flexible-output-builders/blob/main/Changelogs.md)
- upgrade `@nodable/entities` to v2.2.0
- upgrade `path-expression-matcher` to v1.6.1


**1.3.0 (2026-06-16)**
- support `skip.whitespaceText`
- update base output builder for typings

**1.2.2 (2026-06-02)**
- fix: cjs typings

**1.2.1 (2026-05-28)**
- update dependencies to fix duplicate entites
- include fxp.cjs in npm package


**1.2.0 (2026-05-13)**
- fix: Tag name can be separated with rest of the tag expression by any type of spaces.
- fix: parser should not fail when tag expresison is very long
- fix: stop node with namespace should work
- support `feedable.bufferSize` option to improve/speed up feed method.
- integrate `xml-naming` library that would also consider xml version
 