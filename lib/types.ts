export interface GitHubAsset {
  id: number;
  name: string;
  url: string;
}

export interface GitHubRelease {
  assets?: GitHubAsset[];
  body: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at: string;
  tag_name: string;
}

export interface GitHubContentItem {
  name: string;
  type: string;
}

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

export interface ParsedFrontmatter {
  content: string;
  meta: Record<string, unknown>;
}
