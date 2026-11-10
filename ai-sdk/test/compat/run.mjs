// Installs the packed package into fresh projects for each supported ai/zod
// combination (plain `npm install`, no --legacy-peer-deps), then type-checks
// the Exa docs example and runs consumer.test.mjs.
//
//   node test/compat/run.mjs              # test this checkout
//   node test/compat/run.mjs --baseline   # test the published 2.1.0 for comparison
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const baseline = process.argv.includes("--baseline");
const matrix = [
  { ai: "6", zod: "3" },
  { ai: "6", zod: "4" },
  { ai: "7", zod: "3" },
  { ai: "7", zod: "4" },
];

let pkgSpec = "@exalabs/ai-sdk@2.1.0";
if (!baseline) {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "ignore" });
  const out = execFileSync("npm", ["pack", "--silent", "--pack-destination", tmpdir()], { cwd: root }).toString().trim().split("\n").pop();
  pkgSpec = join(tmpdir(), out);
}

const sh = (cmd, args, cwd) => {
  try {
    return { ok: true, out: execFileSync(cmd, args, { cwd, stdio: "pipe", env: { ...process.env, EXA_API_KEY: "" } }).toString() };
  } catch (e) {
    return { ok: false, out: (e.stdout?.toString() ?? "") + (e.stderr?.toString() ?? "") };
  }
};

const summary = [];
for (const { ai, zod } of matrix) {
  const dir = mkdtempSync(join(tmpdir(), `exa-ai-sdk-ai${ai}-zod${zod}-`));
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, noEmit: true, skipLibCheck: true, types: ["node"] },
    include: ["docs-example.ts"],
  }));
  copyFileSync(join(here, "consumer.test.mjs"), join(dir, "consumer.test.mjs"));
  copyFileSync(join(here, "docs-example.ts"), join(dir, "docs-example.ts"));
  const label = `ai@${ai} zod@${zod}`;
  const install = sh("npm", ["install", "--no-audit", "--no-fund", pkgSpec, `ai@${ai}`, `zod@${zod}`, "typescript@5", "@types/node@22"], dir);
  if (!install.ok) {
    summary.push({ label, install: "FAIL", types: "-", runtime: "-", detail: install.out.split("\n").filter((l) => /ERESOLVE|peer ai|Found: ai/.test(l)).slice(0, 3).join(" | ") });
    continue;
  }
  const versions = sh("npm", ["ls", "ai", "zod", "@exalabs/ai-sdk", "--depth=0"], dir).out.trim().split("\n").slice(1).join(", ");
  const tsc = sh("npx", ["tsc", "-p", "."], dir);
  const run = sh("node", ["--test", "consumer.test.mjs"], dir);
  const pass = /(?:#|ℹ) pass (\d+)/.exec(run.out)?.[1] ?? "?";
  const fail = /(?:#|ℹ) fail (\d+)/.exec(run.out)?.[1] ?? "?";
  summary.push({
    label,
    install: "ok",
    types: tsc.ok ? "ok" : "FAIL",
    runtime: `${pass} pass / ${fail} fail`,
    detail: [versions.replace(/[├└│─┬ ]+/g, " ").trim(), tsc.ok ? "" : tsc.out.split("\n").filter(Boolean).slice(0, 2).join(" | ")].filter(Boolean).join(" ; "),
  });
  if (!run.ok && process.env.VERBOSE) console.log(run.out);
}

console.log(`package: ${baseline ? pkgSpec : "this checkout (npm pack)"}`);
for (const r of summary) console.log(`${r.label.padEnd(14)} install=${r.install.padEnd(4)} types=${r.types.padEnd(4)} runtime=${r.runtime.padEnd(16)} ${r.detail}`);
process.exit(summary.every((r) => r.install === "ok" && r.types === "ok" && /^\d+ pass \/ 0 fail$/.test(r.runtime)) ? 0 : 1);
