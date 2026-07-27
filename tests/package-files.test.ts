import { describe, expect, it } from "vitest";

import { validatePackageFiles } from "../scripts/package-files.mjs";

const STABLE_PACKAGE_FILES = [
  "LICENSE",
  "README.md",
  "dist/cli.js",
  "dist/cli.js.map",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/index.js.map",
  "episodes/kaun-hai/story.json",
  "package.json",
] as const;

describe("package file validation", () => {
  it("accepts one generated chunk with its matching source map", () => {
    expect(() =>
      validatePackageFiles(packageFiles("TMWN4FMT")),
    ).not.toThrow();
  });

  it("accepts a different valid generated chunk hash", () => {
    expect(() =>
      validatePackageFiles(packageFiles("BLYX33TY")),
    ).not.toThrow();
  });

  it("rejects a source map without a generated JavaScript chunk", () => {
    const files = packageFiles("TMWN4FMT").filter(
      (file) => file !== "dist/chunk-TMWN4FMT.js",
    );

    expect(() => validatePackageFiles(files)).toThrowError(
      /Invalid or unmatched chunk files:[\s\S]*expected exactly one .*\.js, found 0/u,
    );
  });

  it("rejects a generated chunk without its source map", () => {
    const files = packageFiles("TMWN4FMT").filter(
      (file) => file !== "dist/chunk-TMWN4FMT.js.map",
    );

    expect(() => validatePackageFiles(files)).toThrowError(
      /Invalid or unmatched chunk files:[\s\S]*expected exactly one .*\.js\.map, found 0/u,
    );
  });

  it("rejects a source map whose basename does not match the chunk", () => {
    const files = packageFiles("TMWN4FMT").map((file) =>
      file === "dist/chunk-TMWN4FMT.js.map"
        ? "dist/chunk-BLYX33TY.js.map"
        : file,
    );

    expect(() => validatePackageFiles(files)).toThrowError(
      /expected source map "dist\/chunk-TMWN4FMT\.js\.map".*"dist\/chunk-BLYX33TY\.js\.map"/u,
    );
  });

  it("rejects an extra generated JavaScript chunk", () => {
    const files = [
      ...packageFiles("TMWN4FMT"),
      "dist/chunk-BLYX33TY.js",
    ];

    expect(() => validatePackageFiles(files)).toThrowError(
      /expected exactly one dist\/chunk-\[A-Z0-9\]\+\.js, found 2/u,
    );
  });

  it("rejects an unexpected package file", () => {
    const files = [
      ...packageFiles("TMWN4FMT"),
      "docs/architecture.md",
    ];

    expect(() => validatePackageFiles(files)).toThrowError(
      /Unexpected files:[\s\S]*docs\/architecture\.md/u,
    );
  });

  it("reports missing stable package files", () => {
    const files = packageFiles("TMWN4FMT").filter(
      (file) => file !== "README.md",
    );

    expect(() => validatePackageFiles(files)).toThrowError(
      /Missing stable files:[\s\S]*README\.md/u,
    );
  });
});

function packageFiles(hash: string): string[] {
  return [
    ...STABLE_PACKAGE_FILES,
    `dist/chunk-${hash}.js`,
    `dist/chunk-${hash}.js.map`,
  ];
}
