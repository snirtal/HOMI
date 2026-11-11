import { spawnSync } from "node:child_process";
import { existsSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));

const client = spawnSync("npm", ["run", "build", "-w", "@homi/client"], {
  cwd: root,
  stdio: "inherit",
});
if (client.status !== 0) process.exit(client.status ?? 1);

const output = path.join(root, ".vercel", "output");
rmSync(output, { recursive: true, force: true });
const fnDir = path.join(output, "functions", "api.func");
mkdirSync(fnDir, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ["server/src/vercel.ts"],
  outfile: path.join(fnDir, "index.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  legalComments: "none",
  plugins: [
    {
      name: "resolve-ts-js",
      setup(build) {
        build.onResolve({ filter: /^pg-native$/ }, () => ({ path: "pg-native", external: true }));
        build.onResolve({ filter: /^\..*\.js$/ }, (args) => {
          const tsFile = path.resolve(args.resolveDir, args.path.slice(0, -3) + ".ts");
          if (existsSync(tsFile)) return { path: tsFile };
          return undefined;
        });
      },
    },
  ],
});

cpSync(path.join(root, "client", "dist"), path.join(output, "static"), { recursive: true });

writeFileSync(
  path.join(fnDir, ".vc-config.json"),
  `${JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.js",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      maxDuration: 15,
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  path.join(output, "config.json"),
  `${JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/api", dest: "/api" },
        { src: "/api/(.*)", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  )}\n`,
);
