
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
 