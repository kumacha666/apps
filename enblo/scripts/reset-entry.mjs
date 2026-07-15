/**
 * postbuild: restore-entry.mjs が退避した .entry-backup.html の内容を
 * root index.html に書き戻し、バックアップを削除する。
 * git checkoutで丸ごと戻す方式だと、コミット前の手動編集が残っていた場合に
 * 消えてしまうため、ビルド直前の実際の内容を復元する（2026-07-15、Codexレビュー指摘）。
 * バックアップが無ければ何もしない（restore-entry.mjsが呼ばれていない場合の安全策）。
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";

const path = new URL("../index.html", import.meta.url).pathname;
const backupPath = new URL("../.entry-backup.html", import.meta.url).pathname;

if (!existsSync(backupPath)) {
  console.log("No entry backup found, skipping restore.");
  process.exit(0);
}

const original = readFileSync(backupPath, "utf8");
writeFileSync(path, original);
unlinkSync(backupPath);
console.log("Entry reset: index.html restored to its pre-build content.");
