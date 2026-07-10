import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

/**
 * このapiKey等はクライアント向けの公開鍵であり機密情報ではない（Firebase Web SDKの仕様、
 * apps/emoji-dm/CLAUDE.md参照）。ただし値そのものはFirebaseコンソールでプロジェクトを
 * 作成してから取得する必要があるため、下記はプレースホルダー。
 *
 * セットアップ手順は CLAUDE.md を参照。
 *   1. Firebaseコンソール（AI学習用アカウント）で新規プロジェクト作成
 *   2. Realtime Database を有効化（認証は使わない）
 *   3. Web アプリを登録し、表示された設定値をここに貼り付ける
 */
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  databaseURL: "https://REPLACE_ME-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
