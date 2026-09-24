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

interface GiteaAsset {
  browser_download_url: string;
  id: number;
  name: string;
}

interface GiteaRelease {
  assets?: GiteaAsset[];
  body?: string;
  draft?: boolean;
  name?: string;
  prerelease?: boolean;
  published_at?: string;
  tag_name: string;
}

interface GiteaContentItem {
  name: string;
  type: string;
}

export const DEFAULT_GITEA_API_URL = 'https://gitea.com/api/v1';

export class GiteaProvider implements GitProvider {
  protected readonly defaultBaseUrl: string = DEFAULT_GITEA_API_URL;

  protected get baseUrl(): string {
    return GIT_API_URL || this.defaultBaseUrl;
  }

  private get repoUrl(): string {
    return `${this.baseUrl}/repos/${REPO_OWNER}/${REPO_NAME}`;
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    validateProviderEnv();

    return {
      'User-Agent': 'Tauri-Updater-Proxy',
      Authorization: `token ${GIT_TOKEN}`,
      ...extraHeaders,
    };
  }

  public async getReleases(): Promise<UnifiedRelease[]> {
    const res = await fetch(`${this.repoUrl}/releases`, {
      headers: this.getHeaders({ Accept: 'application/json' }),
    });

    if (!res.ok) {
      throw new Error(`Gitea API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as GiteaRelease[];
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map(r => ({
      tag_name: r.tag_name,
      name: r.name ?? r.tag_name,
      body: r.body ?? '',
      published_at: r.published_at ?? null,
      draft: r.draft ?? false,
      prerelease: r.prerelease ?? false,
      assets: (r.assets ?? []).map(a => ({
        id: String(a.id),
        name: a.name,
        url: a.browser_download_url,
        downloadUrl: a.browser_download_url,
      })),
    }));
  }

  public async getReleaseByTag(tag: string): Promise<UnifiedRelease | null> {
    const cleanTag = tag.trim().replace(/^v+/, '');
    const headers = this.getHeaders({ Accept: 'application/json' });

    let res = await fetch(`${this.repoUrl}/releases/tags/${encodeURIComponent(cleanTag)}`, {
      headers,
    });
    if (!res.ok && res.status === 404) {
      res = await fetch(`${this.repoUrl}/releases/tags/${encodeURIComponent(`v${cleanTag}`)}`, {
        headers,
      });
    }

    if (!res.ok) {
      return null;
    }

    const r = (await res.json()) as GiteaRelease;
    return {
      tag_name: r.tag_name,
      name: r.name ?? r.tag_name,
      body: r.body ?? '',
      published_at: r.published_at ?? null,
      draft: r.draft ?? false,
      prerelease: r.prerelease ?? false,
      assets: (r.assets ?? []).map(a => ({
        id: String(a.id),
        name: a.name,
        url: a.browser_download_url,
        downloadUrl: a.browser_download_url,
      })),
    };
  }

  public async getRawFile(filePath: string, ref: string): Promise<string | null> {
    const headers = this.getHeaders();
    const res = await fetch(
      `${this.repoUrl}/raw/${encodeURIComponent(ref)}/${filePath.replace(/^\/+/, '')}`,
      { headers },
    );

    if (!res.ok) {
      return null;
    }

    return res.text();
  }

  public async listDirectoryFiles(dirPath: string, ref: string): Promise<string[] | null> {
    const headers = this.getHeaders({ Accept: 'application/json' });
    const cleanDir = dirPath.replace(/^\/+/, '');
    const refParam = `?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(`${this.repoUrl}/contents/${cleanDir}${refParam}`, { headers });

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      return null;
    }

    const items = (await res.json()) as GiteaContentItem[];
    if (!Array.isArray(items)) {
      return [];
    }

    return items.filter(item => item.type === 'file').map(item => item.name);
  }

  public async getAssetSignature(asset: UnifiedAsset): Promise<string> {
    const targetUrl = asset.downloadUrl ?? asset.url;
    if (!targetUrl) {
      return '';
    }

    const res = await fetch(targetUrl, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      return '';
    }

    return (await res.text()).trim();
  }

  public async streamAsset(assetId: string): Promise<StreamAssetResult> {
    const headers = this.getHeaders();
    const targetUrl = assetId.startsWith('http')
      ? assetId
      : `${this.repoUrl}/releases/assets/${assetId}`;

    const res = await fetch(targetUrl, {
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

    throw new Error(`Failed to download asset from Gitea/Forgejo: ${res.status} ${res.statusText}`);
  }
}
