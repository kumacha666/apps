import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

/**
 * このapiKey等はクライアント向けの公開鍵であり機密情報ではない（Firebase Web SDKの仕様、
 * apps/emoji-dm/CLAUDE.md参照）。プロジェクト「mori-no-yakai」（AI学習用アカウント、
 * asia-southeast1）をFirebaseコンソールで作成済み。
 */
const firebaseConfig = {
  apiKey: "AIzaSyBUWOun6Fc6R58T_FAxDB217kypYi_Y59c",
  authDomain: "mori-no-yakai.firebaseapp.com",
  databaseURL: "https://mori-no-yakai-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mori-no-yakai",
  storageBucket: "mori-no-yakai.firebasestorage.app",
  messagingSenderId: "126231981141",
  appId: "1:126231981141:web:b593b219aeec9f8a7078dc",
  measurementId: "G-TK8226P7P9",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
