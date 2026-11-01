import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("writes a header and rows with CRLF and a BOM", () => {
    expect(toCsv([["a", "b"], [1, true]])).toBe("﻿a,b\r\n1,true\r\n");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([["x,y", 'say "hi"', "l1\nl2"]])).toBe('﻿"x,y","say ""hi""","l1\nl2"\r\n');
  });
  it("renders null as empty", () => {
    expect(toCsv([[null, "x"]])).toBe("﻿,x\r\n");
  });
  it("defuses spreadsheet formulas in text", () => {
    expect(toCsv([["=1+1", "+cmd", "-2", "@a", "ok"]])).toBe("﻿'=1+1,'+cmd,'-2,'@a,ok\r\n");
  });
  it("leaves real numbers alone, even negative", () => {
    expect(toCsv([[-5, 3.5]])).toBe("﻿-5,3.5\r\n");
  });
});
