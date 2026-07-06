import { describe, it, expect } from "vitest";
import { CLASSES, getClassById, basicClasses, advancedClasses } from "./classes";

describe("getClassById", () => {
  it("returns the matching class", () => {
    expect(getClassById("warrior").name).toBe("戦士");
  });
  it("throws for unknown id", () => {
    expect(() => getClassById("nope")).toThrow();
  });
});

describe("basicClasses / advancedClasses", () => {
  it("partitions all classes by tier with no overlap", () => {
    const basic = basicClasses();
    const advanced = advancedClasses();
    expect(basic.length + advanced.length).toBe(CLASSES.length);
    expect(basic.every((c) => c.tier === "basic")).toBe(true);
    expect(advanced.every((c) => c.tier === "advanced")).toBe(true);
  });
});
