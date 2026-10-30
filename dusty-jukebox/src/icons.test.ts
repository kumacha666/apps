import { describe, expect, test } from "vitest";
import { iconSvg, type IconName } from "./icons";

const NAMES: IconName[] = ["play", "pause", "prev", "next", "shuffle", "repeat", "repeat-one", "up", "down", "trash"];

describe("iconSvg", () => {
  test.each(NAMES)("%sはスクリーンリーダーに読ませない装飾のSVGを返す", (name) => {
    const svg = iconSvg(name);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain("<path d=");
  });

  test("塗りつぶし系（play/pause/prev/next）だけ.fillクラスを持つ", () => {
    for (const name of ["play", "pause", "prev", "next"] as const) expect(iconSvg(name)).toContain('class="ic fill"');
    for (const name of ["shuffle", "repeat", "repeat-one", "up", "down", "trash"] as const) expect(iconSvg(name)).toContain('class="ic"');
  });
});
