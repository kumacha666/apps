import { copyFileSync } from "fs";

// npm's deploy script previously used the Unix `cp` command, which is not
// available on plain Windows cmd/PowerShell (only Git Bash/WSL). Use Node's
// own file copy so `npm run deploy` works the same on every platform.
copyFileSync("dist/app.js", "app.js");
