import { describe, expect, it } from "vitest";
import { appendDiagLogEntry, formatDiagLog, formatDiagLogEntry, parseDiagLog } from "./backgroundDiag";

describe("appendDiagLogEntry", () => {
  it("appends without mutating the input array", () => {
    const entries = [{ t: 1, event: "a" }];
    const next = appendDiagLogEntry(entries, { t: 2, event: "b" });
    expect(entries).toEqual([{ t: 1, event: "a" }]);
    expect(next).toEqual([{ t: 1, event: "a" }, { t: 2, event: "b" }]);
  });

  it("drops the oldest entries once maxEntries is exceeded", () => {
    const entries = [{ t: 1, event: "a" }, { t: 2, event: "b" }];
    const next = appendDiagLogEntry(entries, { t: 3, event: "c" }, 2);
    expect(next).toEqual([{ t: 2, event: "b" }, { t: 3, event: "c" }]);
  });
});

describe("formatDiagLogEntry / formatDiagLog", () => {
  it("includes the detail when present and omits it otherwise", () => {
    expect(formatDiagLogEntry({ t: 0, event: "foo" })).toBe("1970-01-01T00:00:00.000Z foo");
    expect(formatDiagLogEntry({ t: 0, event: "foo", detail: "bar" })).toBe("1970-01-01T00:00:00.000Z foo bar");
  });

  it("joins multiple entries with newlines in order", () => {
    const entries = [{ t: 0, event: "a" }, { t: 1000, event: "b", detail: "d" }];
    expect(formatDiagLog(entries)).toBe("1970-01-01T00:00:00.000Z a\n1970-01-01T00:00:01.000Z b d");
  });

  it("returns an empty string for an empty log", () => {
    expect(formatDiagLog([])).toBe("");
  });
});

describe("parseDiagLog", () => {
  it("returns an empty array for null/empty input", () => {
    expect(parseDiagLog(null)).toEqual([]);
    expect(parseDiagLog("")).toEqual([]);
  });

  it("returns an empty array for malformed JSON", () => {
    expect(parseDiagLog("{not json")).toEqual([]);
  });

  it("returns an empty array when the parsed value is not an array", () => {
    expect(parseDiagLog(JSON.stringify({ t: 0, event: "a" }))).toEqual([]);
  });

  it("filters out entries missing t or event", () => {
    const raw = JSON.stringify([
      { t: 1, event: "a" },
      { t: 2 },
      { event: "b" },
      { t: "3", event: "c" },
      null,
      "not an object",
    ]);
    expect(parseDiagLog(raw)).toEqual([{ t: 1, event: "a" }]);
  });

  it("round-trips entries produced by appendDiagLogEntry", () => {
    const entries = appendDiagLogEntry([], { t: 5, event: "x", detail: "y" });
    expect(parseDiagLog(JSON.stringify(entries))).toEqual(entries);
  });
});
