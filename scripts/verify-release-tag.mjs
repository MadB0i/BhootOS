import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = resolve(process.env["GITHUB_WORKSPACE"] ?? ".");
const packageJson = JSON.parse(
  readFileSync(resolve(workspace, "package.json"), "utf8"),
);
const version = packageJson.version;
const refType = process.env["GITHUB_REF_TYPE"];
const refName = process.env["GITHUB_REF_NAME"];

const failure = releasePolicyFailure(version, refType, refName);
if (failure === undefined) {
  process.stdout.write(`Verified release tag v${version}.\n`);
} else {
  process.stderr.write(`bhootos release: ${failure}\n`);
  process.exitCode = 1;
}

function releasePolicyFailure(candidateVersion, candidateRefType, candidateRefName) {
  if (candidateRefType !== "tag") {
    return 'Release publication requires GITHUB_REF_TYPE="tag".';
  }
  if (
    typeof candidateVersion !== "string" ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(
      candidateVersion,
    )
  ) {
    return "Release publication requires a stable x.y.z package version.";
  }
  if (candidateRefName !== `v${candidateVersion}`) {
    return `Release tag "${String(candidateRefName)}" must exactly match package version "${candidateVersion}" as "v${candidateVersion}".`;
  }
  return undefined;
}
