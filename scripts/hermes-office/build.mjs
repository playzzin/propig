import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const out = new URL("../../output/hermes-office-web/", import.meta.url);
await mkdir(out, { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ["src/components/admin/hermes-office/main.tsx"],
  outfile: fileURLToPath(new URL("app.js", out)),
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
await writeFile(
  new URL("index.html", out),
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Hermes AI Office · 나의 AI 회사</title><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
);
console.log("Office browser build complete");
