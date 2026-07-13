// 部屋作成（ホスト）を身内専用に限定するための合言葉ゲート。
// 認証基盤を持たない静的ホスティング構成のため、フロントエンドに埋め込んだ合言葉と
// 一致するかだけを見る簡易な抑止力（ソースを見れば合言葉自体は分かる）。
// 一度合言葉が一致すればそのスマホのlocalStorageに解錠済みフラグを保存し、
// 以後はそのスマホでだけ「部屋をつくる」がノータッチで使えるようにする。
const HOST_PASSPHRASE = "1night";
export const HOST_UNLOCK_STORAGE_KEY = "mori-no-yakai-host-unlocked";

export function verifyHostPassphrase(input: string): boolean {
  return input.trim() === HOST_PASSPHRASE;
}

export function isHostUnlocked(): boolean {
  return localStorage.getItem(HOST_UNLOCK_STORAGE_KEY) === "1";
}

export function unlockHost(): void {
  localStorage.setItem(HOST_UNLOCK_STORAGE_KEY, "1");
}
