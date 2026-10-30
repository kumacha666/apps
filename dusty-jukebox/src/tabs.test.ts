import { describe, expect, test } from "vitest";
import { DEFAULT_TAB, TAB_IDS, TAB_LABELS, isTabId, nextTabForKey } from "./tabs";

describe("tabs", () => {
  test("全てのタブIDに表示名があり、既定のタブはTAB_IDSに含まれる", () => {
    for (const id of TAB_IDS) expect(TAB_LABELS[id]).not.toBe("");
    expect(TAB_IDS).toContain(DEFAULT_TAB);
  });

  test("isTabIdは既知のタブIDだけを受け付ける", () => {
    expect(isTabId("library")).toBe(true);
    expect(isTabId("unknown")).toBe(false);
    expect(isTabId(undefined)).toBe(false);
    expect(isTabId(3)).toBe(false);
  });

  test("→/←は隣のタブへ移り、端では反対側の端へ循環する", () => {
    expect(nextTabForKey("queue", "ArrowRight")).toBe("library");
    expect(nextTabForKey("library", "ArrowLeft")).toBe("queue");
    expect(nextTabForKey("settings", "ArrowRight")).toBe("queue");
    expect(nextTabForKey("queue", "ArrowLeft")).toBe("settings");
  });

  test("Home/Endは先頭/末尾へ移り、それ以外のキーは何もしない", () => {
    expect(nextTabForKey("albums", "Home")).toBe("queue");
    expect(nextTabForKey("albums", "End")).toBe("settings");
    expect(nextTabForKey("albums", "Enter")).toBeNull();
    expect(nextTabForKey("albums", "ArrowDown")).toBeNull();
  });
});
