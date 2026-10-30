import { describe, expect, test } from "vitest";
import { iconSvg, type IconName } from "./icons";

const NAMES: IconName[] = ["play", "up", "down", "trash"];

describe("iconSvg", () => {
  test.each(NAMES)("%sはスクリーンリーダーに読ませない装飾のSVGを返す", (name) => {
    const svg = iconSvg(name);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain("<path d=");
  });

  test("塗りつぶし系（play）だけ.fillクラスを持つ", () => {
    expect(iconSvg("play")).toContain('class="ic fill"');
    expect(iconSvg("up")).toContain('class="ic"');
  });
});
