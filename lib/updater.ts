export interface TauriPlatformUpdate {
  signature: string;
  url: string;
}

export type KnownTauriTarget =
  | 'darwin-aarch64'
  | 'darwin-universal'
  | 'darwin-x86_64'
  | 'linux-aarch64'
  | 'linux-armv7'
  | 'linux-i686'
  | 'linux-x86_64'
  | 'windows-aarch64'
  | 'windows-i686'
  | 'windows-x86_64';

export interface TauriUpdateResponse {
  notes: string;
  platforms: Partial<Record<KnownTauriTarget, TauriPlatformUpdate>> &
    Record<string, TauriPlatformUpdate>;
  pub_date: string;
  version: string;
}

export interface ReleaseAsset {
  name: string;
}

export interface MatchedAssets<T extends ReleaseAsset = ReleaseAsset> {
  binaryAsset: T | null;
  sigAsset: T | null;
}

export const ASSET_EXTENSION = {
  APP_IMAGE: '.AppImage',
  APP_IMAGE_TAR: '.AppImage.tar.gz',
  APP_TAR: '.app.tar.gz',
  DEB: '.deb',
  DMG: '.dmg',
  EXE: '.exe',
  GZ: '.gz',
  MSI: '.msi',
  MSI_ZIP: '.msi.zip',
  NSIS_ZIP: '.nsis.zip',
  RPM: '.rpm',
  SIG: '.sig',
  TAR_GZ: '.tar.gz',
  ZIP: '.zip',
} as const;

export type AssetExtension = (typeof ASSET_EXTENSION)[keyof typeof ASSET_EXTENSION];

export const ARCHITECTURE_KEYWORD = {
  AARCH64: 'aarch64',
  AMD64: 'amd64',
  ARM: 'arm',
  ARM64: 'arm64',
  I686: 'i686',
  UNIVERSAL: 'universal',
  X64: 'x64',
  X86: 'x86',
  X86_32: '32',
  X86_64: 'x86_64',
} as const;

export type ArchitectureKeyword = (typeof ARCHITECTURE_KEYWORD)[keyof typeof ARCHITECTURE_KEYWORD];

export const PLATFORM_KEYWORD = {
  DARWIN: 'darwin',
  LINUX: 'linux',
  MAC: 'mac',
  MACOS: 'macos',
  OSX: 'osx',
  WIN: 'win',
  WINDOWS: 'windows',
} as const;

export type PlatformKeyword = (typeof PLATFORM_KEYWORD)[keyof typeof PLATFORM_KEYWORD];

export const LINUX_EXTENSIONS = [
  ASSET_EXTENSION.APP_IMAGE_TAR,
  ASSET_EXTENSION.TAR_GZ,
  ASSET_EXTENSION.APP_IMAGE,
  ASSET_EXTENSION.DEB,
  ASSET_EXTENSION.RPM,
] as const;

export const WINDOWS_EXTENSIONS = [
  ASSET_EXTENSION.NSIS_ZIP,
  ASSET_EXTENSION.MSI_ZIP,
  ASSET_EXTENSION.EXE,
  ASSET_EXTENSION.MSI,
  ASSET_EXTENSION.ZIP,
] as const;

export const DARWIN_EXTENSIONS = [
  ASSET_EXTENSION.APP_TAR,
  ASSET_EXTENSION.TAR_GZ,
  ASSET_EXTENSION.GZ,
  ASSET_EXTENSION.DMG,
] as const;

export const FALLBACK_EXTENSIONS = [
  ASSET_EXTENSION.EXE,
  ASSET_EXTENSION.APP_IMAGE_TAR,
  ASSET_EXTENSION.APP_TAR,
] as const;

function hasExtension(filename: string, extensions: readonly string[]): boolean {
  return extensions.some(ext => filename.endsWith(ext));
}

function pickBestAsset<T extends ReleaseAsset>(
  candidates: T[],
  allAssets: T[],
  targetLower: string,
  preferredExtensions: readonly string[],
): T | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  const isTargetUniversal = targetLower.includes(ARCHITECTURE_KEYWORD.UNIVERSAL);

  const getScore = (asset: T): number => {
    const nameLower = asset.name.toLowerCase();
    let score = 0;

    // 1. Signature availability: In Tauri, auto-updater requires an accompanying signature (.sig)
    const hasSig = allAssets.some(other => other.name === `${asset.name}${ASSET_EXTENSION.SIG}`);
    if (hasSig) {
      score += 1000;
    }

    // 2. Portable penalty: Portable archives/binaries are standalone distributions, not auto-updater targets
    const isPortable = /(?:^|[-_.]|(?<=[a-z0-9]))portable(?:$|[-_.])/i.test(nameLower);
    if (isPortable) {
      score -= 500;
    }

    // 3. Extension preference based on preferred order in preferredExtensions
    // Earlier items in preferredExtensions have higher precedence
    const extIndex = preferredExtensions.findIndex(ext => nameLower.endsWith(ext));
    if (extIndex !== -1) {
      score += (preferredExtensions.length - extIndex) * 50;
    }

    // Windows setup executable bonus
    if (nameLower.includes('-setup.exe') || nameLower.includes('_setup.exe')) {
      score += 40;
    }

    // 4. Universal bonus for Darwin
    if (isTargetUniversal && nameLower.includes(ARCHITECTURE_KEYWORD.UNIVERSAL)) {
      score += 200;
    }

    return score;
  };

  return [...candidates].sort((a, b) => getScore(b) - getScore(a))[0];
}

export function findReleaseAssets<T extends ReleaseAsset>(
  assets: T[],
  target: string,
): MatchedAssets<T> {
  const targetLower = target.toLowerCase();
  const isArm =
    targetLower.includes(ARCHITECTURE_KEYWORD.AARCH64) ||
    targetLower.includes(ARCHITECTURE_KEYWORD.ARM64) ||
    targetLower.includes(ARCHITECTURE_KEYWORD.ARM);
  const isX64 =
    targetLower.includes(ARCHITECTURE_KEYWORD.X86_64) ||
    targetLower.includes(ARCHITECTURE_KEYWORD.X64) ||
    targetLower.includes(ARCHITECTURE_KEYWORD.AMD64);
  const isX86 =
    targetLower.includes(ARCHITECTURE_KEYWORD.I686) ||
    targetLower.includes(ARCHITECTURE_KEYWORD.X86) ||
    targetLower.includes(ARCHITECTURE_KEYWORD.X86_32);

  const matchesArch = (name: string): boolean => {
    const nameLower = name.toLowerCase();

    if (isArm) {
      return (
        nameLower.includes(ARCHITECTURE_KEYWORD.ARM64) ||
        nameLower.includes(ARCHITECTURE_KEYWORD.AARCH64) ||
        nameLower.includes(ARCHITECTURE_KEYWORD.ARM)
      );
    }

    if (isX64) {
      return (
        (nameLower.includes(ARCHITECTURE_KEYWORD.X64) ||
          nameLower.includes(ARCHITECTURE_KEYWORD.X86_64) ||
          nameLower.includes(ARCHITECTURE_KEYWORD.AMD64)) &&
        !nameLower.includes(ARCHITECTURE_KEYWORD.ARM64) &&
        !nameLower.includes(ARCHITECTURE_KEYWORD.AARCH64)
      );
    }

    if (isX86) {
      return (
        (nameLower.includes(ARCHITECTURE_KEYWORD.X86) ||
          nameLower.includes(ARCHITECTURE_KEYWORD.I686) ||
          nameLower.includes(ARCHITECTURE_KEYWORD.X86_32)) &&
        !nameLower.includes(ARCHITECTURE_KEYWORD.X86_64) &&
        !nameLower.includes(ARCHITECTURE_KEYWORD.ARM64)
      );
    }

    return true;
  };

  let binaryAsset: T | undefined;

  if (
    targetLower.includes(PLATFORM_KEYWORD.DARWIN) ||
    targetLower.includes(PLATFORM_KEYWORD.MAC) ||
    targetLower.includes(PLATFORM_KEYWORD.MACOS) ||
    targetLower.includes(PLATFORM_KEYWORD.OSX)
  ) {
    const macAssets = assets.filter(
      a => hasExtension(a.name, DARWIN_EXTENSIONS) && !a.name.endsWith(ASSET_EXTENSION.SIG),
    );

    const isTargetUniversal = targetLower.includes(ARCHITECTURE_KEYWORD.UNIVERSAL);
    const macCandidates = macAssets.filter(
      a =>
        (isTargetUniversal
          ? a.name.toLowerCase().includes(ARCHITECTURE_KEYWORD.UNIVERSAL)
          : matchesArch(a.name)) || a.name.toLowerCase().includes(ARCHITECTURE_KEYWORD.UNIVERSAL),
    );

    binaryAsset =
      pickBestAsset(
        macCandidates.length > 0 ? macCandidates : macAssets,
        assets,
        targetLower,
        DARWIN_EXTENSIONS,
      ) ?? macAssets[0];
  } else if (
    targetLower.includes(PLATFORM_KEYWORD.WINDOWS) ||
    (targetLower.includes(PLATFORM_KEYWORD.WIN) && !targetLower.includes(PLATFORM_KEYWORD.DARWIN))
  ) {
    const winAssets = assets.filter(
      a => hasExtension(a.name, WINDOWS_EXTENSIONS) && !a.name.endsWith(ASSET_EXTENSION.SIG),
    );
    const winCandidates = winAssets.filter(a => matchesArch(a.name));

    binaryAsset =
      pickBestAsset(
        winCandidates.length > 0 ? winCandidates : winAssets,
        assets,
        targetLower,
        WINDOWS_EXTENSIONS,
      ) ?? winAssets[0];
  } else if (targetLower.includes(PLATFORM_KEYWORD.LINUX)) {
    const linuxAssets = assets.filter(
      a => hasExtension(a.name, LINUX_EXTENSIONS) && !a.name.endsWith(ASSET_EXTENSION.SIG),
    );
    const linuxCandidates = linuxAssets.filter(a => matchesArch(a.name));

    binaryAsset =
      pickBestAsset(
        linuxCandidates.length > 0 ? linuxCandidates : linuxAssets,
        assets,
        targetLower,
        LINUX_EXTENSIONS,
      ) ?? linuxAssets[0];
  } else {
    const allCandidates = assets.filter(
      a => hasExtension(a.name, FALLBACK_EXTENSIONS) && !a.name.endsWith(ASSET_EXTENSION.SIG),
    );
    const archCandidates = allCandidates.filter(a => matchesArch(a.name));

    binaryAsset =
      pickBestAsset(
        archCandidates.length > 0 ? archCandidates : allCandidates,
        assets,
        targetLower,
        FALLBACK_EXTENSIONS,
      ) ?? allCandidates[0];
  }

  if (!binaryAsset) {
    return { binaryAsset: null, sigAsset: null };
  }

  const sigAsset = assets.find(a => a.name === `${binaryAsset.name}${ASSET_EXTENSION.SIG}`) ?? null;

  return { binaryAsset, sigAsset };
}
