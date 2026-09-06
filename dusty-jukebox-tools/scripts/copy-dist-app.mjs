import { copyFileSync } from "fs";

// Node's own file copy so `npm run deploy` works the same on every platform
// (dusty-jukeboxと同じ理由、CLAUDE.md参照：`cp`はWindows標準のcmd/PowerShellに存在しない）。
copyFileSync("dist/app.js", "app.js");
