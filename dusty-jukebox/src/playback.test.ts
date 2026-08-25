import { describe, expect, test } from "vitest";
import { streamUrl } from "./playback";

describe("streamUrl", () => {
  test("アプリスコープ配下の相対ストリームURLを組み立て、fileIdをエンコードする", () => {
    expect(streamUrl("id/with ? characters")).toBe("./stream/id%2Fwith%20%3F%20characters");
  });
});
