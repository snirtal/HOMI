import { spawn } from "node:child_process";

const children = [
  spawn("npm", ["run", "dev", "-w", "@homi/server"], { stdio: "inherit" }),
  spawn("npm", ["run", "dev", "-w", "@homi/client"], { stdio: "inherit" }),
];

function stop() {
  for (const child of children) child.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
