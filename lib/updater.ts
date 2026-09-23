import type { GitHubAsset } from './github.js';

export interface TauriPlatformUpdate {
  signature: string;
  url: string;
}

export interface TauriUpdateResponse {
  notes: string;
  platforms: Record<string, TauriPlatformUpdate>;
  pub_date: string;
  version: string;
}

export interface MatchedAssets {
  binaryAsset: GitHubAsset | null;
  sigAsset: GitHubAsset | null;
}
