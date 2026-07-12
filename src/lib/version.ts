type ParsedVersion = {
  core: number[];
  prerelease: string[];
};

function parseVersion(version: string): ParsedVersion | null {
  const normalized = version.trim().replace(/^v/i, "").split("+", 1)[0] ?? "";
  const prereleaseSeparatorIndex = normalized.indexOf("-");
  const coreText = prereleaseSeparatorIndex >= 0 ? normalized.slice(0, prereleaseSeparatorIndex) : normalized;
  const prereleaseText = prereleaseSeparatorIndex >= 0 ? normalized.slice(prereleaseSeparatorIndex + 1) : "";
  if (!coreText || !/^\d+(?:\.\d+)*$/.test(coreText)) return null;

  return {
    core: coreText.split(".").map(Number),
    prerelease: prereleaseText ? prereleaseText.split(".") : [],
  };
}

export function compareVersions(leftVersion: string, rightVersion: string): number | null {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);
  if (!left || !right) return null;

  const coreLength = Math.max(left.core.length, right.core.length);
  for (let index = 0; index < coreLength; index += 1) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }

  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length === 0 ? 1 : -1;
  }

  const prereleaseLength = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < prereleaseLength; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) return leftPart === undefined ? -1 : 1;
    if (leftPart === rightPart) continue;

    const leftIsNumeric = /^\d+$/.test(leftPart);
    const rightIsNumeric = /^\d+$/.test(rightPart);
    if (leftIsNumeric && rightIsNumeric) return Math.sign(Number(leftPart) - Number(rightPart));
    if (leftIsNumeric !== rightIsNumeric) return leftIsNumeric ? -1 : 1;
    return leftPart.localeCompare(rightPart) < 0 ? -1 : 1;
  }

  return 0;
}

export function isNewerVersion(candidateVersion: string, currentVersion: string) {
  return compareVersions(candidateVersion, currentVersion) === 1;
}
