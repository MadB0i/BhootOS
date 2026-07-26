import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const script = resolve("scripts/verify-release-tag.mjs");

function verifyRelease(
  version: string,
  refType: string,
  refName: string,
) {
  const workspace = mkdtempSync(join(tmpdir(), "bhootos-release-policy-"));
  try {
    writeFileSync(
      join(workspace, "package.json"),
      JSON.stringify({ version }),
      "utf8",
    );
    return spawnSync(process.execPath, [script], {
      cwd: workspace,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_WORKSPACE: workspace,
        GITHUB_REF_TYPE: refType,
        GITHUB_REF_NAME: refName,
      },
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

describe("release tag policy", () => {
  it("accepts an exact stable tag", () => {
    const result = verifyRelease("0.1.0", "tag", "v0.1.0");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("Verified release tag v0.1.0.\n");
    expect(result.stderr).toBe("");
  });

  it.each([
    ["0.1.0", "tag", "v0.1.1", "must exactly match"],
    ["0.2.0-rc.1", "tag", "v0.2.0-rc.1", "stable x.y.z"],
    ["0.1.0", "branch", "main", 'GITHUB_REF_TYPE="tag"'],
  ])(
    "rejects unsafe release input %s / %s / %s",
    (version, refType, refName, message) => {
      const result = verifyRelease(version, refType, refName);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
    },
  );

  it("checks mainline ancestry before the publish step", () => {
    const workflow = readFileSync(
      resolve(".github/workflows/release.yml"),
      "utf8",
    );
    const ancestryCheck = workflow.indexOf(
      'git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main',
    );
    const publish = workflow.indexOf(
      "npm publish --provenance --access public",
    );

    expect(workflow).toContain("fetch-depth: 0");
    expect(ancestryCheck).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(ancestryCheck);
  });
});
