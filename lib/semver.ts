import semver from 'semver';

export type SortOrder = 'asc' | 'desc';

export function compareSemver(a: string, b: string, order: SortOrder = 'desc'): number {
  const cleanA = a.replace(/^v/, '').trim();
  const cleanB = b.replace(/^v/, '').trim();
  const validA = semver.valid(cleanA);
  const validB = semver.valid(cleanB);

  if (validA && validB) {
    return order === 'desc' ? semver.rcompare(validA, validB) : semver.compare(validA, validB);
  }

  if (validA) {
    return -1;
  }

  if (validB) {
    return 1;
  }

  if (order === 'desc') {
    return cleanB.localeCompare(cleanA);
  }

  return cleanA.localeCompare(cleanB);
}

export function isStableVersion(version: string): boolean {
  const parsed = semver.parse(version);

  if (!parsed) {
    return false;
  }

  return parsed.prerelease.length === 0;
}
