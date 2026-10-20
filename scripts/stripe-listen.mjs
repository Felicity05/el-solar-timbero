// Local test mode only. Credentials go into the child environment, never argv
// or logs. Requires Stripe CLI installed (STRIPE_CLI_BIN can name its path).
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key || !/^(sk|rk)_test_/.test(key)) throw new Error("A Stripe TEST secret/restricted key is required");
const port = process.env.STRIPE_LOCAL_PORT || "3000";
if (!/^\d{4,5}$/.test(port)) throw new Error("Invalid local port");
const child = spawn(
  process.env.STRIPE_CLI_BIN || "stripe",
  ["listen", "--events", "payment_intent.succeeded,payment_intent.payment_failed", "--forward-to", `http://localhost:${port}/api/stripe/webhook`],
  { env: { ...process.env, STRIPE_API_KEY: key }, stdio: ["ignore", "pipe", "pipe"] },
);
let secretSaved = false;
let buffer = "";
function output(chunk) {
  buffer += chunk.toString();
  const found = buffer.match(/\bwhsec_[A-Za-z0-9]+(?=\s)/);
  if (found && !secretSaved) {
    const path = ".env.development.local";
    let env = readFileSync(path, "utf8");
    const line = `STRIPE_WEBHOOK_SECRET=${found[0]}`;
    env = /^STRIPE_WEBHOOK_SECRET=.*$/m.test(env) ? env.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, line) : `${env.trimEnd()}\n${line}\n`;
    writeFileSync(path, env, { mode: 0o600 });
    secretSaved = true;
    console.log(`Stripe TEST listener ready on localhost:${port}; signing secret saved to ignored .env.development.local. Restart the app if needed.`);
  }
  if (/\[200\]/.test(chunk.toString())) console.log("Stripe webhook delivered: HTTP 200");
  if (/\[(400|500|503)\]/.test(chunk.toString())) console.error("Stripe webhook rejected; inspect the local Next.js server logs.");
  if (buffer.length > 20000) buffer = buffer.slice(-2000);
}
child.stdout.on("data", output);
child.stderr.on("data", output);
child.on("error", () => {
  console.error("Stripe CLI could not start. Install the official Stripe CLI or set STRIPE_CLI_BIN.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  if (!secretSaved) console.error("Stripe listener exited before providing a secret. Check test-key permissions and network access.");
  process.exitCode = code ?? 0;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
