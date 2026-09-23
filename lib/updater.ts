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
] as const;

export const WINDOWS_EXTENSIONS = [
  ASSET_EXTENSION.EXE,
  ASSET_EXTENSION.MSI,
  ASSET_EXTENSION.ZIP,
] as const;

export const DARWIN_EXTENSIONS = [
  ASSET_EXTENSION.APP_TAR,
  ASSET_EXTENSION.DMG,
  ASSET_EXTENSION.TAR_GZ,
  ASSET_EXTENSION.GZ,
] as const;

export const FALLBACK_EXTENSIONS = [
  ASSET_EXTENSION.EXE,
  ASSET_EXTENSION.APP_IMAGE_TAR,
  ASSET_EXTENSION.APP_TAR,
] as const;

function hasExtension(filename: string, extensions: readonly string[]): boolean {
  return extensions.some(ext => filename.endsWith(ext));
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

    binaryAsset =
      macAssets.find(a => {
        if (isTargetUniversal) {
          return a.name.toLowerCase().includes(ARCHITECTURE_KEYWORD.UNIVERSAL);
        }
        return matchesArch(a.name);
      }) ??
      macAssets.find(a => a.name.toLowerCase().includes(ARCHITECTURE_KEYWORD.UNIVERSAL)) ??
      macAssets[0];
  } else if (
    targetLower.includes(PLATFORM_KEYWORD.WINDOWS) ||
    (targetLower.includes(PLATFORM_KEYWORD.WIN) && !targetLower.includes(PLATFORM_KEYWORD.DARWIN))
  ) {
    const winAssets = assets.filter(
      a => hasExtension(a.name, WINDOWS_EXTENSIONS) && !a.name.endsWith(ASSET_EXTENSION.SIG),
    );

    binaryAsset = winAssets.find(a => matchesArch(a.name)) ?? winAssets[0];
  } else if (targetLower.includes(PLATFORM_KEYWORD.LINUX)) {
    const linuxAssets = assets.filter(
      a => hasExtension(a.name, LINUX_EXTENSIONS) && !a.name.endsWith(ASSET_EXTENSION.SIG),
    );

    binaryAsset = linuxAssets.find(a => matchesArch(a.name)) ?? linuxAssets[0];
  } else {
    const allCandidates = assets.filter(
      a => hasExtension(a.name, FALLBACK_EXTENSIONS) && !a.name.endsWith(ASSET_EXTENSION.SIG),
    );

    binaryAsset = allCandidates.find(a => matchesArch(a.name)) ?? allCandidates[0];
  }

  if (!binaryAsset) {
    return { binaryAsset: null, sigAsset: null };
  }

  const sigAsset = assets.find(a => a.name === `${binaryAsset.name}${ASSET_EXTENSION.SIG}`) ?? null;

  return { binaryAsset, sigAsset };
}
