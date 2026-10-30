// 画面上部のタブ（再生リスト / ライブラリ / アルバム / プレイリスト / 設定）。
// タブのID・表示名・キーボード操作（矢印キー・Home/End）の移動先を純粋ロジックとして持ち、
// DOMへの結線（aria-selected・hidden・フォーカス）はmain.tsが担う。
export type TabId = "queue" | "library" | "albums" | "playlists" | "settings";

export const TAB_IDS: readonly TabId[] = ["queue", "library", "albums", "playlists", "settings"];

// Record型にしてあるので、TabIdを増やすとここがコンパイルエラーになり更新漏れに気づける。
export const TAB_LABELS: Record<TabId, string> = {
  queue: "再生リスト",
  library: "ライブラリ",
  albums: "アルバム",
  playlists: "プレイリスト",
  settings: "設定",
};

export const DEFAULT_TAB: TabId = "queue";

export function isTabId(value: unknown): value is TabId {
  return typeof value === "string" && (TAB_IDS as readonly string[]).includes(value);
}

// WAI-ARIAのタブパターン：←→で隣のタブ（端では反対側の端へ循環）、Home/Endで先頭/末尾。
// 対象外のキーは null（何もしない）。
export function nextTabForKey(current: TabId, key: string): TabId | null {
  const index = TAB_IDS.indexOf(current);
  switch (key) {
    case "ArrowRight":
      return TAB_IDS[(index + 1) % TAB_IDS.length];
    case "ArrowLeft":
      return TAB_IDS[(index - 1 + TAB_IDS.length) % TAB_IDS.length];
    case "Home":
      return TAB_IDS[0];
    case "End":
      return TAB_IDS[TAB_IDS.length - 1];
    default:
      return null;
  }
}
