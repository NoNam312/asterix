// Writes extension/config.js so a locally loaded extension talks to the same Supabase project.
// Usage: npm run extension:config [-- --app-url http://localhost:3000]
import { writeFileSync } from "node:fs";
import { configSource, DEFAULT_APP_URL, loadSupabaseEnv } from "./extension-env.mjs";

const appUrlFlag = process.argv.indexOf("--app-url");
const appUrl = appUrlFlag === -1 ? DEFAULT_APP_URL : process.argv[appUrlFlag + 1];

writeFileSync(
  new URL("../extension/config.js", import.meta.url),
  configSource({ ...loadSupabaseEnv(), appUrl }),
);
console.log(`Wrote extension/config.js (app: ${appUrl})`);
