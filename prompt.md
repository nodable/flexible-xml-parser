Attached is the code of flexible XML parser. It is designed to overcome a few issues of fast-xml-parser.
- it allows to setup their own **value parsers** and **output builders**. So user can configure the output format and value parsing as per their needs. User can even change the sequence of value parsers. This reduces multiple options to be provided by the library. In result, simplify and more organized options.
- it supports stream and feedable (partial) XML input along with buffer and string input.



