import { describe, expect, it } from "vitest";

import { csvCell } from "./csv";

describe("csvCell — formula-injection safety", () => {
  it("prefixes cells that start with a formula trigger", () => {
    // No other special chars → just the leading single quote.
    for (const lead of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
      expect(csvCell(lead)).toBe(`'${lead}`);
    }
  });

  it("prefixes AND quotes a formula that contains a quote", () => {
    // '=HYPERLINK("x")' → prefix "'", escape the inner quote, then RFC-quote.
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
  });

  it("quotes a formula that also contains a comma", () => {
    // leading '=' → prefix "'", then comma forces RFC-4180 quoting
    expect(csvCell("=cmd,evil")).toBe('"\'=cmd,evil"');
  });

  it("leaves ordinary text untouched", () => {
    expect(csvCell("Wei Chen")).toBe("Wei Chen");
    expect(csvCell("Tampines St 11")).toBe("Tampines St 11");
    expect(csvCell("")).toBe("");
  });

  it("RFC-4180-quotes commas, quotes, and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });
});
