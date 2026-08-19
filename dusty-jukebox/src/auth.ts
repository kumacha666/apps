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

// GISはトークン取得の失敗をcallbackではなくerror_callbackで通知する場合がある
// （ユーザーがOAuthポップアップを閉じた・ブラウザがポップアップをブロックした等）。
// これをハンドルしないとrequestAccessToken()のPromiseが永遠にpendingのままになる
// （2026-08-19 Codexレビュー指摘）。
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

// GISのトークンクライアント初期化・要求まわりの薄いラッパー。
// window.googleへの依存・コールバックベースAPIのためユニットテストの対象外とし（README同様の方針）、
// 期限計算等の純粋ロジック（computeExpiresAt/isTokenValid）だけをテストする。
export class DriveAuth {
  private tokenClient: GisTokenClient | null = null;
  private state: TokenState | null = null;
  // requestAccessToken()実行中のreject。GISのcallback/error_callbackはどちらも
  // トークンクライアント単位の1つの登録先にしかならないため、多重実行を防ぐガードにも使う
  private pendingReject: ((err: Error) => void) | null = null;
  // ensureAccessToken()の多重呼び出しが同じ更新処理を共有するための進行中Promise（下記参照）
  private pendingEnsure: Promise<string> | null = null;

  init(clientId: string): void {
    if (!window.google) {
      throw new AuthError("Google Identity Servicesのスクリプトが読み込まれていません");
    }
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_READONLY_SCOPE,
      callback: () => {}, // requestAccessToken()の都度差し替える
      error_callback: (err) => {
        // ポップアップを閉じた・ブロックされた等、callbackが一度も呼ばれないまま終わるケース。
        // pendingRejectが無ければ(このクラスの外で発生した無関係なエラー等)何もしない
        this.pendingReject?.(new AuthError(err.message ?? err.type));
        this.pendingReject = null;
      },
    });
  }

  getAccessToken(): string | null {
    return isTokenValid(this.state) ? this.state.accessToken : null;
  }

  // Drive APIが401を返した場合（取り消し・失効等、ローカルのexpiresAtではまだ有効に
  // 見えていても実際には拒否されるケース）に呼ぶ。呼ばないと、次回のensureAccessToken()が
  // 同じ拒否済みトークンを期限マージンに入るまで返し続け、再スキャンが必ず失敗する
  // （2026-08-19 Codexレビュー指摘）。呼び出し元（main.ts）で401/AuthError検知時に呼び出す。
  clearToken(): void {
    this.state = null;
  }

  // prompt: ""はサイレント取得（既存セッションがあれば同意画面を出さない）。
  // 明示ログイン時は呼び出し側でprompt: "consent"等を指定する。
  requestAccessToken(opts?: { prompt?: string }): Promise<TokenState> {
    if (!this.tokenClient) {
      return Promise.reject(new AuthError("DriveAuth.init()が呼ばれていません"));
    }
    // 前回の要求が完了していないうちに二重に呼ぶと、callback/error_callbackの
    // 登録が上書きされ最初のPromiseが永遠にpendingのまま残ってしまうため、明示的に弾く
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
  //
  // drive.tsのフォルダ走査は兄弟フォルダを並行に処理するため、トークンが期限マージンに
  // 入ったタイミングで複数のensureAccessToken()が同時に呼ばれうる。requestAccessToken()の
  // 多重実行ガードにそのまま任せると、最初の1件だけが実際に更新を試み、残りは
  // 「進行中です」で即座にrejectされ、大量のフォルダが取得失敗扱いになってしまう
  // （2026-08-19 Codexレビュー指摘）。進行中の更新Promiseを共有することでこれを避ける。
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
