import { describe, expect, test } from "vitest";
import {
  computeExpiresAt,
  isTokenValid,
  hasAllRequiredScopes,
  DriveAuth,
  AuthError,
  DRIVE_READONLY_SCOPE,
  SPREADSHEETS_SCOPE,
  OAUTH_SCOPES,
  type GisAccounts,
  type GisTokenErrorResponse,
  type GisTokenResponse,
} from "./auth";

// window.googleへの依存部分は、DriveAuth自体をフェイクのGISクライアントで駆動してテストする。
// 目的はGISとの通信内容の再現ではなく、Codexレビューで指摘された2つの回帰防止:
// (1) error_callback（ポップアップを閉じた等）でPromiseがpendingのまま残らないこと
// (2) 前回の要求が完了しないうちの二重呼び出しでPromiseが迷子にならないこと
function installFakeGis(): {
  emitToken: (resp: GisTokenResponse) => void;
  emitError: (err: GisTokenErrorResponse) => void;
  requestAccessTokenCallCount: () => number;
} {
  let onToken: (resp: GisTokenResponse) => void = () => {};
  let onError: (err: GisTokenErrorResponse) => void = () => {};
  let requestCount = 0;

  const oauth2: GisAccounts["oauth2"] = {
    initTokenClient: (config) => {
      onToken = config.callback;
      onError = config.error_callback;
      return {
        get callback() {
          return onToken;
        },
        set callback(cb) {
          onToken = cb;
        },
        requestAccessToken: () => {
          requestCount += 1;
        },
      };
    },
  };
  (globalThis as unknown as { window: Window }).window = {
    google: { accounts: { oauth2 } },
  } as unknown as Window;

  return {
    emitToken: (resp) => onToken(resp),
    emitError: (err) => onError(err),
    requestAccessTokenCallCount: () => requestCount,
  };
}

describe("auth", () => {
  test("computeExpiresAt: expires_in秒後のepoch msを返す", () => {
    expect(computeExpiresAt(3600, 1000)).toBe(1000 + 3600 * 1000);
  });

  test("isTokenValid: stateが無ければ無効", () => {
    expect(isTokenValid(null)).toBe(false);
    expect(isTokenValid(undefined)).toBe(false);
  });

  test("isTokenValid: 期限まで十分余裕があれば有効", () => {
    const state = { accessToken: "t", expiresAt: 1_000_000 };
    expect(isTokenValid(state, 1_000_000 - 120_000)).toBe(true);
  });

  test("isTokenValid: 期限の60秒前を切ったら無効（安全マージン）", () => {
    const state = { accessToken: "t", expiresAt: 1_000_000 };
    expect(isTokenValid(state, 1_000_000 - 60_000)).toBe(false);
    expect(isTokenValid(state, 1_000_000 - 1_000)).toBe(false);
  });

  test("isTokenValid: 期限を過ぎていれば無効", () => {
    const state = { accessToken: "t", expiresAt: 1_000_000 };
    expect(isTokenValid(state, 1_000_001)).toBe(false);
  });

  test("DriveAuth: error_callback（ポップアップを閉じた等）でrequestAccessToken()のPromiseがrejectされる", async () => {
    const gis = installFakeGis();
    const auth = new DriveAuth();
    auth.init("dummy-client-id");

    const pending = auth.requestAccessToken({ prompt: "consent" });
    gis.emitError({ type: "popup_closed" });

    await expect(pending).rejects.toBeInstanceOf(AuthError);
  });

  test("DriveAuth: 前回の要求が完了しないうちの二重呼び出しは即座にrejectされ、最初の要求はそのまま解決できる", async () => {
    const gis = installFakeGis();
    const auth = new DriveAuth();
    auth.init("dummy-client-id");

    const first = auth.requestAccessToken({ prompt: "consent" });
    await expect(auth.requestAccessToken({ prompt: "consent" })).rejects.toBeInstanceOf(AuthError);

    gis.emitToken({ access_token: "token-1", expires_in: 3600, scope: OAUTH_SCOPES });
    const state = await first;
    expect(state.accessToken).toBe("token-1");
  });

  test("DriveAuth: ensureAccessToken()の並行呼び出しは同じ更新を共有する（drive.tsの並行フォルダ走査を想定）", async () => {
    const gis = installFakeGis();
    const auth = new DriveAuth();
    auth.init("dummy-client-id");

    // 兄弟フォルダの並行走査から同時にensureAccessToken()が呼ばれる状況を再現する
    const results = Promise.all([auth.ensureAccessToken(), auth.ensureAccessToken(), auth.ensureAccessToken()]);
    gis.emitToken({ access_token: "shared-token", expires_in: 3600, scope: OAUTH_SCOPES });

    expect(await results).toEqual(["shared-token", "shared-token", "shared-token"]);
    // requestAccessToken()（GISへの実際の要求）は1回しか呼ばれていない
    expect(gis.requestAccessTokenCallCount()).toBe(1);
  });

  test("DriveAuth: clearToken()はキャッシュ済みトークンを無効化する（2026-08-19 Codexレビュー指摘: 401後もトークンを残すと再スキャンが必ず同じ拒否済みトークンで失敗する）", async () => {
    const gis = installFakeGis();
    const auth = new DriveAuth();
    auth.init("dummy-client-id");

    const pending = auth.requestAccessToken({ prompt: "consent" });
    gis.emitToken({ access_token: "revoked-token", expires_in: 3600, scope: OAUTH_SCOPES });
    await pending;
    expect(auth.getAccessToken()).toBe("revoked-token");

    auth.clearToken();
    expect(auth.getAccessToken()).toBeNull();
  });

  test("hasAllRequiredScopes: 要求スコープが全て付与されていればtrue", () => {
    expect(hasAllRequiredScopes(OAUTH_SCOPES, OAUTH_SCOPES)).toBe(true);
  });

  test("hasAllRequiredScopes: 一部スコープが欠けていればfalse", () => {
    expect(hasAllRequiredScopes(DRIVE_READONLY_SCOPE, OAUTH_SCOPES)).toBe(false);
    expect(hasAllRequiredScopes(SPREADSHEETS_SCOPE, OAUTH_SCOPES)).toBe(false);
  });

  test("hasAllRequiredScopes: scopeが無い（undefined）場合はfalse", () => {
    expect(hasAllRequiredScopes(undefined, OAUTH_SCOPES)).toBe(false);
  });

  test("DriveAuth: 詳細同意画面で一部スコープだけ許可された場合、requestAccessToken()はAuthErrorでrejectされる（2026-08-20 Codexレビュー指摘：access_tokenがあってもDrive/Sheetsの片方だけ許可された場合を検知できていなかった）", async () => {
    const gis = installFakeGis();
    const auth = new DriveAuth();
    auth.init("dummy-client-id");

    const pending = auth.requestAccessToken({ prompt: "consent" });
    // Drive権限だけ許可され、Sheets権限は拒否されたケースを模す
    gis.emitToken({ access_token: "partial-token", expires_in: 3600, scope: DRIVE_READONLY_SCOPE });

    await expect(pending).rejects.toBeInstanceOf(AuthError);
    expect(auth.getAccessToken()).toBeNull(); // 部分許可のトークンはstateに保存されない
  });
});
