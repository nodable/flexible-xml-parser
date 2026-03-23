
import XMLParser from "../src/XMLParser.js";

xdescribe("Skip Nodes", function () {

  it("should skip specified nodes entirely", function () {
    const xmlData = `
      <root>
        <keep>
          <data>keep this</data>
        </keep>
        <skip>
          <data>skip this</data>
        </skip>
        <alsokeep>
          <data>also keep</data>
        </alsokeep>
      </root>`;

    const options = {
      skip: ["root.skip"]
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(result.root.keep.data).toBe("keep this");
    expect(result.root.skip).toBeUndefined();
    expect(result.root.alsokeep.data).toBe("also keep");
  });

  it("should skip multiple nodes", function () {
    const xmlData = `
      <root>
        <section1>data1</section1>
        <section2>data2</section2>
        <section3>data3</section3>
      </root>`;

    const options = {
      skip: ["root.section1", "root.section3"]
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(result.root.section1).toBeUndefined();
    expect(result.root.section2).toBe("data2");
    expect(result.root.section3).toBeUndefined();
  });

  it("should use 'only' option to include specific nodes", function () {
    const xmlData = `
      <root>
        <include>data1</include>
        <exclude>data2</exclude>
        <alsoinclude>data3</alsoinclude>
      </root>`;

    const options = {
      only: ["root.include", "root.alsoinclude"]
    };

    const parser = new XMLParser(options);
    const result = parser.parse(xmlData);

    expect(result.root.include).toBe("data1");
    expect(result.root.exclude).toBeUndefined();
    expect(result.root.alsoinclude).toBe("data3");
  });

});