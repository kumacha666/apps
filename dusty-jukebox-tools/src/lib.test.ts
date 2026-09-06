import { describe, expect, test } from "vitest";
import Encoding from "encoding-japanese";
import { detectGarbled, repairGarbledText, sheetRange } from "./lib";

// テスト内で「正しい文字化け」を合成するためのヘルパー。repairGarbledTextの逆変換
// （UTF-8として書かれた文字列をShift_JIS/CP932のバイト列として読み直すとどう見えるか）を
// 再現する。本アプリの文字化けはこの経路（UTF-8→SJIS誤デコード）で発生したことを実測で
// 確認済み（CLAUDE.md参照）。
function garble(text: string): string {
  const utf8Bytes = new TextEncoder().encode(text);
  const codes = Encoding.convert(Array.from(utf8Bytes), { to: "UNICODE", from: "SJIS" });
  return Encoding.codeToString(codes);
}

describe("lib", () => {
  test("sheetRange: 通常のシート名はそのままクォートする", () => {
    expect(sheetRange("index", "A1")).toBe("'index'!A1");
  });

  test("sheetRange: スペース・アポストロフィを含むシート名も壊れないA1範囲にする", () => {
    expect(sheetRange("My Index", "A1")).toBe("'My Index'!A1");
    expect(sheetRange("O'Brien", "A1")).toBe("'O''Brien'!A1");
  });

  test("detectGarbled: 正常な日本語・英語タイトルは化けていないと判定する", () => {
    expect(detectGarbled("負けないで")).toBe(false);
    expect(detectGarbled("Heaven Is A Place On Earth")).toBe(false);
    expect(detectGarbled("")).toBe(false);
    expect(detectGarbled(undefined)).toBe(false);
  });

  test("detectGarbled: U+FFFD（デコード失敗マーカー）を含む場合は化けと判定する", () => {
    expect(detectGarbled("譁�蟄怜喧縺�")).toBe(true);
  });

  test("detectGarbled: 典型的なUTF-8/Shift_JIS誤変換パターンを検出する", () => {
    expect(detectGarbled("繧ｹ繝斐・繝峨Ρ繧ｴ繝ｳ")).toBe(true);
  });

  test("detectGarbled: マーカー文字が1回だけの偶然一致では化け扱いにしない", () => {
    expect(detectGarbled("通常のテキストに縺が1回だけ含まれる")).toBe(false);
  });

  test("garble() ヘルパー自体が既知の文字化けサンプルを再現できることの確認", () => {
    // dusty-jukebox本体のlib.test.tsに実在するサンプル。このヘルパーの正しさの裏付け。
    expect(garble("こんにちは")).toBe("縺薙ｓ縺ｫ縺｡縺ｯ");
  });

  test("repairGarbledText: UTF-8がShift_JISとして誤デコードされた文字列を元に戻す", () => {
    const original = "こんにちは世界";
    const garbled = garble(original);
    expect(detectGarbled(garbled)).toBe(true);
    expect(repairGarbledText(garbled)).toBe(original);
  });

  test("repairGarbledText: アーティスト名等の実例でも往復できる", () => {
    const original = "世界が終るまでは";
    const garbled = garble(original);
    expect(repairGarbledText(garbled)).toBe(original);
  });

  test("repairGarbledText: UTF-8バイト列の区切りがSJIS2バイト文字の境界とずれる文字列は、元の誤デコード時点で既に情報が失われているため修復できずnullを返す", () => {
    // 「負けないで」はこの往復では復元できない実例（誤デコード時点でバイト境界がずれ、
    // 末尾の不完全なリードバイトが破棄されるため）。誤った値を書き込むよりnullを返す方が安全。
    const garbled = garble("負けないで");
    expect(repairGarbledText(garbled)).toBeNull();
  });

  test("repairGarbledText: 正常なテキスト（化けていない）はnullを返す", () => {
    expect(repairGarbledText("負けないで")).toBeNull();
    expect(repairGarbledText("Heaven Is A Place On Earth")).toBeNull();
  });

  test("repairGarbledText: 空文字はnullを返す", () => {
    expect(repairGarbledText("")).toBeNull();
  });

  test("repairGarbledText: 修復結果がなお文字化けと判定される場合はnullを返す（誤った修復を書き込まない）", () => {
    // U+FFFDを含む文字列はSJIS化けの往復では直らない典型例（別種の破損）
    const result = repairGarbledText("譁�蟄怜喧縺�");
    expect(result === null || !detectGarbled(result)).toBe(true);
  });
});
