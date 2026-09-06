// dusty-jukebox（本体）のsrc/auth.tsを移植。トークンモデル（initTokenClient）・GISの
// error_callback処理・多重呼び出しガード等はすべて同じ設計。唯一の違いは要求スコープ：
// このアプリはカタログ補正（表記ゆれ統一・文字化け修復）専用で、Google Driveの音源ファイル
// 自体には一切アクセスしないため、drive.readonlyは要求せずSPREADSHEETS_SCOPEのみにする
// （最小権限の原則。ユーザーへの同意画面もその分シンプルになる）。
export const SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export const OAUTH_SCOPES = SPREADSHEETS_SCOPE;

export interface TokenState {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const EXPIRY_SKEW_MS = 60_000;

export function computeExpiresAt(expiresInSeconds: number, now: number = Date.now()): number {
  return now + expiresInSeconds * 1000;
}

export function isTokenValid(state: TokenState | null | undefined, now: number = Date.now()): state is TokenState {
  if (!state) return false;
  return state.expiresAt - EXPIRY_SKEW_MS > now;
}

export interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export function hasAllRequiredScopes(grantedScope: string | undefined, requiredScopes: string): boolean {
  const granted = new Set((grantedScope ?? "").split(" ").filter(Boolean));
  return requiredScopes.split(" ").every((scope) => granted.has(scope));
}

export interface GisTokenErrorResponse {
  type: string;
  message?: string;
}

export interface GisTokenClient {
  callback: (resp: GisTokenResponse) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
}

export interface GisAccounts {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (resp: GisTokenResponse) => void;
      error_callback: (err: GisTokenErrorResponse) => void;
    }) => GisTokenClient;
  };
}

declare global {
  interface Window {
    google?: { accounts: GisAccounts };
  }
}

export class AuthError extends Error {}

export class DriveAuth {
  private tokenClient: GisTokenClient | null = null;
  private state: TokenState | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private pendingEnsure: Promise<string> | null = null;

  init(clientId: string): void {
    if (!window.google) {
      throw new AuthError("Google Identity Servicesのスクリプトが読み込まれていません");
    }
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: OAUTH_SCOPES,
      callback: () => {},
      error_callback: (err) => {
        this.pendingReject?.(new AuthError(err.message ?? err.type));
        this.pendingReject = null;
      },
    });
  }

  getAccessToken(): string | null {
    return isTokenValid(this.state) ? this.state.accessToken : null;
  }

  clearToken(): void {
    this.state = null;
  }

  requestAccessToken(opts?: { prompt?: string }): Promise<TokenState> {
    if (!this.tokenClient) {
      return Promise.reject(new AuthError("DriveAuth.init()が呼ばれていません"));
    }
    if (this.pendingReject) {
      return Promise.reject(new AuthError("ログイン処理が既に進行中です"));
    }
    const client = this.tokenClient;
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      client.callback = (resp) => {
        this.pendingReject = null;
        if (resp.error || !resp.access_token) {
          reject(new AuthError(resp.error_description ?? resp.error ?? "アクセストークン取得に失敗しました"));
          return;
        }
        if (!hasAllRequiredScopes(resp.scope, OAUTH_SCOPES)) {
          reject(new AuthError("権限が許可されませんでした。再度ログインし、スプレッドシートへの権限を許可してください。"));
          return;
        }
        const state: TokenState = {
          accessToken: resp.access_token,
          expiresAt: computeExpiresAt(resp.expires_in ?? 0),
        };
        this.state = state;
        resolve(state);
      };
      client.requestAccessToken(opts);
    });
  }

  async ensureAccessToken(): Promise<string> {
    const existing = this.getAccessToken();
    if (existing) return existing;
    if (this.pendingEnsure) return this.pendingEnsure;

    const ensure = this.requestAccessToken({ prompt: "" })
      .then((state) => state.accessToken)
      .finally(() => {
        this.pendingEnsure = null;
      });
    this.pendingEnsure = ensure;
    return ensure;
  }
}
