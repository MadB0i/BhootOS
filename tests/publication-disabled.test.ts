import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface PackageManifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly private?: unknown;
  readonly bin?: unknown;
  readonly exports?: unknown;
  readonly files?: unknown;
  readonly scripts?: Readonly<Record<string, unknown>>;
}

const workflowsDirectory = resolve(".github/workflows");
const packageManifest = JSON.parse(
  readFileSync(resolve("package.json"), "utf8"),
) as PackageManifest;
const ciWorkflow = readFileSync(
  resolve(workflowsDirectory, "ci.yml"),
  "utf8",
);

describe("publication-disabled policy", () => {
  it("marks the package private without removing package architecture", () => {
    expect(packageManifest).toMatchObject({
      name: "bhootos",
      version: "0.1.0",
      private: true,
    });
    expect(packageManifest.bin).toBeDefined();
    expect(packageManifest.exports).toBeDefined();
    expect(packageManifest.files).toBeDefined();
  });

  it("does not define a publication lifecycle script", () => {
    expect(packageManifest.scripts).toBeDefined();
    expect(packageManifest.scripts).not.toHaveProperty("prepublishOnly");
    expect(packageManifest.scripts).not.toHaveProperty("publish");
  });

  it("keeps only the normal CI workflow", () => {
    expect(
      readdirSync(workflowsDirectory).sort((left, right) =>
        left.localeCompare(right),
      ),
    ).toEqual(["ci.yml"]);
    expect(existsSync(resolve(workflowsDirectory, "release.yml"))).toBe(false);
  });

  it("preserves the complete operating-system and Node.js CI matrix", () => {
    expect(ciWorkflow).toContain(
      "os: [ubuntu-latest, windows-latest]",
    );
    expect(ciWorkflow).toContain("node: [20, 24]");
    expect(ciWorkflow).toContain("pnpm install --frozen-lockfile");
    expect(ciWorkflow).toContain("run: pnpm check");
  });

  it("contains no tag trigger or publication credential", () => {
    expect(ciWorkflow).not.toMatch(/tags:/u);
    expect(ciWorkflow).not.toContain("${{ secrets.");
    expect(ciWorkflow).not.toMatch(/NODE_AUTH_TOKEN/u);
    expect(ciWorkflow).not.toMatch(/registry-url/u);
    expect(ciWorkflow).not.toMatch(/id-token:\s*write/u);
  });
});
