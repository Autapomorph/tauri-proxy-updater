export const { GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } = process.env;

export const GITHUB_API_VERSION = '2026-03-10';

export const REPO_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

export interface GitHubAsset {
  id: number;
  name: string;
  url: string;
}

export interface GitHubContentItem {
  name: string;
  type: string;
}

export interface GitHubRelease {
  assets?: GitHubAsset[];
  body: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at: string;
  tag_name: string;
}

export function validateEnv(): void {
  if (!GITHUB_OWNER || !GITHUB_REPO || !GITHUB_TOKEN) {
    throw new Error(
      'Server configuration error: Missing required environment variables (GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN)',
    );
  }
}

export function getGitHubHeaders(headers: Record<string, string> = {}): Record<string, string> {
  validateEnv();

  return {
    'User-Agent': 'Tauri-Updater-Proxy',
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
    ...headers,
  };
}
