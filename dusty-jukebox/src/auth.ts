// CONCEPT.md 5節「Phase 1」の認証設計: サーバーを持たないブラウザ完結構成のため、
// Google Identity Servicesの「トークンモデル」（initTokenClient）を使う。
// refresh tokenは発行されない短命のaccess token（目安1時間）のみが得られるため、
// 期限が近づいたらユーザー操作なしでの再取得を試み、失敗したら再ログインを促す設計にする（5節参照）。
//
// CONCEPT.md 2節の絶対制約: 音源データには一切書き込まない。この制約をスコープレベルで
// 技術的に保証するため、要求するスコープは drive.readonly のみに固定する（Sheets書き込みは
// 別スコープとして索引実装時に追加する）。
export const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export interface TokenState {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// トークンの実際の失効ちょうどではなく、この猶予分だけ早めに「期限切れ」とみなす。
// リクエストの往復中に失効するのを避けるための安全マージン。
const EXPIRY_SKEW_MS = 60_000;

export function computeExpiresAt(expiresInSeconds: number, now: number = Date.now()): number {
  return now + expiresInSeconds * 1000;
}

export function isTokenValid(state: TokenState | null | undefined, now: number = Date.now()): state is TokenState {
  if (!state) return false;
  return state.expiresAt - EXPIRY_SKEW_MS > now;
}

// Google Identity Servicesのトークンクライアントが最低限持つ形（型パッケージを追加せず自前定義）
export interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
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
    }) => GisTokenClient;
  };
}

declare global {
  interface Window {
    google?: { accounts: GisAccounts };
  }
}

export class AuthError extends Error {}

// GISのトークンクライアント初期化・要求まわりの薄いラッパー。
// window.googleへの依存・コールバックベースAPIのためユニットテストの対象外とし（README同様の方針）、
// 期限計算等の純粋ロジック（computeExpiresAt/isTokenValid）だけをテストする。
export class DriveAuth {
  private tokenClient: GisTokenClient | null = null;
  private state: TokenState | null = null;

  init(clientId: string): void {
    if (!window.google) {
      throw new AuthError("Google Identity Servicesのスクリプトが読み込まれていません");
    }
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_READONLY_SCOPE,
      callback: () => {}, // requestAccessToken()の都度差し替える
    });
  }

  getAccessToken(): string | null {
    return isTokenValid(this.state) ? this.state.accessToken : null;
  }

  // prompt: ""はサイレント取得（既存セッションがあれば同意画面を出さない）。
  // 明示ログイン時は呼び出し側でprompt: "consent"等を指定する。
  requestAccessToken(opts?: { prompt?: string }): Promise<TokenState> {
    if (!this.tokenClient) {
      return Promise.reject(new AuthError("DriveAuth.init()が呼ばれていません"));
    }
    const client = this.tokenClient;
    return new Promise((resolve, reject) => {
      client.callback = (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new AuthError(resp.error_description ?? resp.error ?? "アクセストークン取得に失敗しました"));
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

  // 期限が近ければサイレント再取得を試み、有効なトークンを返す。
  // サイレント取得が失敗した場合（同意が必要等）は呼び出し側でrequestAccessToken({prompt: "consent"})を促す
  async ensureAccessToken(): Promise<string> {
    const existing = this.getAccessToken();
    if (existing) return existing;
    const state = await this.requestAccessToken({ prompt: "" });
    return state.accessToken;
  }
}
