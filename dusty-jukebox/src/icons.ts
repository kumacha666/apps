// 一覧の行の操作ボタンに使う小さなインラインSVGアイコン（スプライトを使わないのは、行をDOM APIで
// 動的に組み立てるため）。名前を増やすと下のRecordがコンパイルエラーで更新漏れを知らせる。
export type IconName = "play" | "up" | "down" | "trash";

const ICON_PATHS: Record<IconName, { path: string; filled: boolean }> = {
  play: { path: "M8 5v14l11-7z", filled: true },
  up: { path: "M6 15l6-6 6 6", filled: false },
  down: { path: "M6 9l6 6 6-6", filled: false },
  trash: { path: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", filled: false },
};

export function iconSvg(name: IconName): string {
  const { path, filled } = ICON_PATHS[name];
  return `<svg class="ic${filled ? " fill" : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}
