import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

const GLOBS = [
  "src",
  "supabase/functions",
  "index.html",
  "README.md",
  ".env.example",
  "supabase/functions/.env.example",
];

const SKIP_DIR = new Set(["node_modules", "dist", ".git"]);
const SKIP_FILE = /\.(sql|json|csv)$/i;

/** Do not rewrite internal trade status keys or migration history. */
function shouldSkipContentReplace(filePath, content) {
  if (SKIP_FILE.test(filePath)) return true;
  if (filePath.includes(`${path.sep}migrations${path.sep}`)) return true;
  if (filePath.endsWith("scripts/rebrand-to-vrna.mjs")) return true;
  if (filePath.endsWith("src/lib/brand.ts")) return true;
  if (filePath.endsWith("supabase/functions/_shared/brand.ts")) return true;
  return false;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function rebrandContent(text) {
  return text
    .replaceAll("EXCH.", "VRNA")
    .replaceAll("EXCH→", "VRNA→")
    .replaceAll("EXCH<", "VRNA<")
    .replaceAll("New at EXCH", "New at VRNA")
    .replaceAll("About EXCH", "About VRNA")
    .replaceAll("Sell on EXCH", "Sell on VRNA")
    .replaceAll("new-at-exch", "new-at-vrna")
    .replaceAll("home-new-at-exch", "home-new-at-vrna");
}

const files = GLOBS.flatMap((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.statSync(abs).isDirectory() ? walk(abs) : [abs];
}).filter((f) => /\.(tsx?|html|md|example)$/i.test(f));

let changed = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const raw = fs.readFileSync(file, "utf8");
  if (shouldSkipContentReplace(rel, raw)) continue;
  const next = rebrandContent(raw);
  if (next !== raw) {
    fs.writeFileSync(file, next);
    changed += 1;
    console.log("updated", rel);
  }
}

console.log(`Done. ${changed} file(s) updated.`);
