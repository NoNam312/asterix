// Zips the Chrome extension (with a generated config.js) into public/questlog-extension.zip,
// so it can be downloaded from the Settings page on any computer. Runs before every build.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { zipSync } from "fflate";
import { configSource, DEFAULT_APP_URL, loadSupabaseEnv } from "./extension-env.mjs";

const root = new URL("../extension/", import.meta.url);
const FOLDER = "questlog-extension"; // unzips into this folder

function collect(dir, prefix = "") {
  const files = {};
  for (const name of readdirSync(new URL(dir, root))) {
    const rel = `${prefix}${name}`;
    if (rel === "config.js") continue; // replaced by the generated one below
    const url = new URL(`${dir}${name}`, root);
    if (statSync(url).isDirectory()) Object.assign(files, collect(`${dir}${name}/`, `${rel}/`));
    else files[`${FOLDER}/${rel}`] = new Uint8Array(readFileSync(url));
  }
  return files;
}

const appUrl = process.env.EXTENSION_APP_URL || DEFAULT_APP_URL;
const files = collect("");
files[`${FOLDER}/config.js`] = new TextEncoder().encode(configSource({ ...loadSupabaseEnv(), appUrl }));

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/questlog-extension.zip", import.meta.url), zipSync(files, { level: 9 }));
console.log(`Packaged ${Object.keys(files).length} extension files -> public/questlog-extension.zip (app: ${appUrl})`);
