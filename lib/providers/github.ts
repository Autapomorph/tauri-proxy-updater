import {
  type GitProvider,
  type StreamAssetResult,
  type UnifiedAsset,
  type UnifiedRelease,
  DEFAULT_CONTENT_TYPE,
} from './types.js';
import {
  GIT_API_URL,
  GIT_TOKEN,
  REPO_NAME,
  REPO_OWNER,
  validateProviderEnv,
} from '../config/index.js';

interface RawGitHubAsset {
  id: number;
  name: string;
  url: string;
}

interface RawGitHubRelease {
  assets?: RawGitHubAsset[];
  body: string;
  draft?: boolean;
  name?: string;
  prerelease?: boolean;
  published_at: string;
  tag_name: string;
}

interface RawGitHubContentItem {
  name: string;
  type: string;
}

const DEFAULT_GITHUB_API_URL = 'https://api.github.com';

export class GitHubProvider implements GitProvider {
  private get baseUrl(): string {
    return GIT_API_URL || DEFAULT_GITHUB_API_URL;
  }

  private get repoUrl(): string {
    return `${this.baseUrl}/repos/${REPO_OWNER}/${REPO_NAME}`;
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    validateProviderEnv();

    return {
      'User-Agent': 'Tauri-Updater-Proxy',
      Authorization: `Bearer ${GIT_TOKEN}`,
      'X-GitHub-Api-Version': '2026-03-10',
      ...extraHeaders,
    };
  }

  public async getReleases(): Promise<UnifiedRelease[]> {
    const res = await fetch(`${this.repoUrl}/releases`, {
      headers: this.getHeaders({ Accept: 'application/vnd.github+json' }),
    });

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as RawGitHubRelease[];
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map(r => ({
      tagName: r.tag_name,
      name: r.name ?? r.tag_name,
      body: r.body ?? '',
      publishedAt: r.published_at ?? null,
      draft: r.draft ?? false,
      prerelease: r.prerelease ?? false,
      assets: (r.assets ?? []).map(a => ({
        id: String(a.id),
        name: a.name,
        url: a.url,
      })),
    }));
  }

  public async getReleaseByTag(tag: string): Promise<UnifiedRelease | null> {
    const cleanTag = tag.trim().replace(/^v+/, '');
    const headers = this.getHeaders({ Accept: 'application/vnd.github+json' });

    let res = await fetch(`${this.repoUrl}/releases/tags/${cleanTag}`, { headers });
    if (!res.ok && res.status === 404) {
      res = await fetch(`${this.repoUrl}/releases/tags/v${cleanTag}`, { headers });
    }

    if (!res.ok) {
      return null;
    }

    const r = (await res.json()) as RawGitHubRelease;
    return {
      tagName: r.tag_name,
      name: r.name ?? r.tag_name,
      body: r.body ?? '',
      publishedAt: r.published_at ?? null,
      draft: r.draft ?? false,
      prerelease: r.prerelease ?? false,
      assets: (r.assets ?? []).map(a => ({
        id: String(a.id),
        name: a.name,
        url: a.url,
      })),
    };
  }

  public async getRawFile(filePath: string, ref: string): Promise<string | null> {
    const headers = this.getHeaders({ Accept: 'application/vnd.github.raw+json' });
    const refParam = `?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(`${this.repoUrl}/contents/${filePath}${refParam}`, { headers });

    if (!res.ok) {
      return null;
    }

    return res.text();
  }

  public async listDirectoryFiles(dirPath: string, ref: string): Promise<string[] | null> {
    const headers = this.getHeaders({ Accept: 'application/vnd.github+json' });
    const refParam = `?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(`${this.repoUrl}/contents/${dirPath}${refParam}`, { headers });

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      return null;
    }

    const items = (await res.json()) as RawGitHubContentItem[];
    if (!Array.isArray(items)) {
      return [];
    }

    return items.filter(item => item.type === 'file').map(item => item.name);
  }

  public async getAssetSignature(asset: UnifiedAsset): Promise<string> {
    if (!asset.url) {
      return '';
    }

    const res = await fetch(asset.url, {
      headers: this.getHeaders({ Accept: 'application/octet-stream' }),
    });

    if (!res.ok) {
      return '';
    }

    return (await res.text()).trim();
  }

  public async streamAsset(assetId: string): Promise<StreamAssetResult> {
    const headers = this.getHeaders({ Accept: 'application/octet-stream' });
    const res = await fetch(`${this.repoUrl}/releases/assets/${assetId}`, {
      headers,
      redirect: 'manual',
    });

    const redirectUrl = res.headers.get('location');
    if ((res.status === 302 || res.status === 301) && redirectUrl) {
      return { redirectUrl };
    }

    if (res.ok && res.body) {
      return {
        stream: res.body,
        contentType: res.headers.get('content-type') ?? DEFAULT_CONTENT_TYPE,
        contentLength: res.headers.get('content-length'),
        contentDisposition: res.headers.get('content-disposition'),
      };
    }

    throw new Error(`Failed to download asset from GitHub: ${res.status} ${res.statusText}`);
  }
}
