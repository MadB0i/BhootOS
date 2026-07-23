import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const packageVersion = readPackageVersion();

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  outDir: "dist",
  dts: false,
  sourcemap: true,
  clean: true,
  shims: false,
  banner: {
    js: "#!/usr/bin/env node",
  },
  platform: "node",
  target: "node20",
  bundle: true,
  define: {
    __BHOOTOS_VERSION__: JSON.stringify(packageVersion),
  },
});

function readPackageVersion(): string {
  const metadata: unknown = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  );

  if (
    typeof metadata !== "object" ||
    metadata === null ||
    !("version" in metadata) ||
    typeof metadata.version !== "string"
  ) {
    throw new TypeError("package.json must contain a string version");
  }

  return metadata.version;
}
