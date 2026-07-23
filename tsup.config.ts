import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const packageVersion = readPackageVersion();

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  outDir: "dist",
  dts: {
    entry: "src/index.ts",
  },
  sourcemap: true,
  clean: true,
  shims: false,
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
