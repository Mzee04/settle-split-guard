/**
 * Production start. Render sets PORT; local runs use 3847.
 * Node reads the variable so the port does not depend on the shell that npm uses.
 */
const { spawn } = require("node:child_process");

const port = process.env.PORT && /^\d+$/.test(process.env.PORT) ? process.env.PORT : "3847";
const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-H", "0.0.0.0", "-p", port], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
