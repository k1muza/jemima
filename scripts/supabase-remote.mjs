// Runs Supabase CLI commands against the hosted database using SUPABASE_DB_URL
// from .env.local, without printing the connection string.
//   node scripts/supabase-remote.mjs push    → apply supabase/migrations
//   node scripts/supabase-remote.mjs types   → regenerate src/types/database.ts
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const mask = (text) => text.replace(/(postgres(?:ql)?:\/\/[^:/]+:)[^@]+@/g, "$1****@");
// On Windows npx runs through cmd.exe, so quote the URL to keep characters like & literal.
const dbUrlArg = process.platform === "win32" ? `"${dbUrl}"` : dbUrl;
const supabase = (args) =>
  spawnSync("npx", ["supabase", ...args, "--db-url", dbUrlArg], {
    shell: process.platform === "win32",
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });

const command = process.argv[2];
let result;

if (command === "push") {
  result = supabase(["db", "push", "--yes"]);
  process.stdout.write(mask(result.stdout ?? ""));
} else if (command === "types") {
  result = supabase(["gen", "types", "typescript", "--schema", "public"]);
  if (result.status === 0) {
    writeFileSync(
      "src/types/database.ts",
      "// Generated from the live schema — regenerate with `npm run db:types` (see README).\n\n" + result.stdout,
    );
    spawnSync("npx", ["--yes", "prettier@3.3.3", "--write", "src/types/database.ts"], {
      shell: process.platform === "win32",
      stdio: "ignore",
    });
    console.log("Wrote src/types/database.ts");
  }
} else {
  console.error("Usage: node scripts/supabase-remote.mjs <push|types>");
  process.exit(1);
}

process.stderr.write(mask(result.stderr ?? ""));
process.exit(result.status ?? 1);
