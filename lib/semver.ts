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

export interface EligibleReleaseCandidate {
  draft?: boolean;
  prerelease?: boolean;
  tagName: string;
}

export interface GetEligibleReleasesOptions {
  wantPrerelease: boolean;
}

export function getEligibleReleases<T extends EligibleReleaseCandidate>(
  releases: T[],
  options: GetEligibleReleasesOptions,
): T[] {
  const eligible = releases.filter(r => {
    if (r.draft) {
      return false;
    }

    const releaseVer = r.tagName.replace(/^v/, '').trim();
    const parsed = semver.valid(releaseVer);
    if (!parsed) {
      return false;
    }

    if (!options.wantPrerelease) {
      const isPre = Boolean(r.prerelease) || !isStableVersion(releaseVer);
      if (isPre) {
        return false;
      }
    }

    return true;
  });

  return eligible.sort((a, b) => compareSemver(a.tagName, b.tagName));
}
