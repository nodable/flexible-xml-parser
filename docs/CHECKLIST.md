Pre release
* [ ] npm audit and yarn audit
* [ ] No local package installation
* [ ] Change log has been updated
* [ ] Added/updated documentation for new properties/features
* [ ] `package-lock.json` reflects the right version : `npm install`
* [ ] Browser bundle `npm run bundle`
* [ ] TS and CJS typings are updated
  - fxp.d.cts
  - fxp.d.ts
  check here
  - https://www.typescriptlang.org/play/
  - https://github.com/NaturalIntelligence/fxp-type-testing
* [ ] ReadMe file or docs are updated for any change, user list, performance report, links etc.
* [ ] Single test is not running `fit`
* [ ] tags are assigned to latest commit `git tag -a v1.2.0 -m "ExpressionSet"`

In general
* [ ] tests are added/updated

Post release
* [ ] `git push origin main --tags`
* [ ] Tagged and Released on github
* [ ] Notified to the users

To remove tag
git tag -d <tag_name>