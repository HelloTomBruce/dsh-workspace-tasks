import { defineConfig, type UserConfig } from "tsdown";

const CLIENT_EXTERNALS = ["react", "react/jsx-runtime", "react-dom", "react-dom/client"];

const node: UserConfig = {
  name: "dsh-workspace-tasks",
  entry: { index: "lib/types/index.js" },
  outDir: "lib",
  format: ["esm"],
  platform: "node",
  target: "es2022",
  fixedExtension: false,
  dts: false,
  clean: false,
  external: [/^@deepseek-ai\//],
};

const client: UserConfig = {
  name: "dsh-workspace-tasks/client",
  entry: { client: "lib/types/client/index.js" },
  outDir: "lib",
  format: "cjs",
  platform: "browser",
  dts: false,
  sourcemap: true,
  minify: false,
  clean: false,
  external: CLIENT_EXTERNALS,
  noExternal: (id) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  outputOptions: {
    entryFileNames: "client.js",
    banner: `window.__ModuleLoader__.load({ id: "dsh-workspace-tasks", factory: (require) => {`,
    footer: "return module.exports; } });",
    intro: "var module = { exports: {} }; var exports = module.exports;",
  },
};

export default defineConfig([node, client]);
