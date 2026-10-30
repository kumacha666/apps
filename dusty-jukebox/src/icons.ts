// 一覧の行の操作ボタンに使う小さなインラインSVGアイコン（スプライトを使わないのは、行をDOM APIで
// 動的に組み立てるため）。名前を増やすと下のRecordがコンパイルエラーで更新漏れを知らせる。
export type IconName = "play" | "pause" | "prev" | "next" | "shuffle" | "repeat" | "repeat-one" | "up" | "down" | "trash";

const ICON_PATHS: Record<IconName, { path: string; filled: boolean }> = {
  play: { path: "M8 5v14l11-7z", filled: true },
  pause: { path: "M7 5h4v14H7zM13 5h4v14h-4z", filled: true },
  prev: { path: "M6 5h2v14H6zM20 5v14L9 12z", filled: true },
  next: { path: "M16 5h2v14h-2zM4 5v14l11-7z", filled: true },
  shuffle: { path: "M3 7h3.5c2 0 3 1 4 2.5l3 5c1 1.5 2 2.5 4 2.5H21M18 14l3 3-3 3M3 17h3.5c1.2 0 2-.4 2.7-1.2M14.8 8.7C15.5 7.6 16.3 7 17.5 7H21M18 4l3 3-3 3", filled: false },
  repeat: { path: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3", filled: false },
  "repeat-one": { path: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3M11 10h1.5v4", filled: false },
  up: { path: "M6 15l6-6 6 6", filled: false },
  down: { path: "M6 9l6 6 6-6", filled: false },
  trash: { path: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3", filled: false },
};

export function iconSvg(name: IconName): string {
  const { path, filled } = ICON_PATHS[name];
  return `<svg class="ic${filled ? " fill" : ""}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}
