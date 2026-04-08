
```javascript
parserOptions = {
  exitIf: (matcher) => {
    return matcher.matches(new Expression("root.stop"));
  }
}

//
parser.wasExited; //true or false
```
