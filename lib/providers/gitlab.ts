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

interface GitLabReleaseLink {
  direct_asset_url?: string;
  id: number;
  name: string;
  url: string;
}

interface GitLabRelease {
  assets?: {
    links?: GitLabReleaseLink[];
  };
  description?: string;
  name?: string;
  released_at?: string;
  tag_name: string;
  upcoming_release?: boolean;
}

interface GitLabTreeItem {
  name: string;
  type: string;
}

const DEFAULT_GITLAB_API_URL = 'https://gitlab.com/api/v4';

export class GitLabProvider implements GitProvider {
  private get baseUrl(): string {
    return GIT_API_URL || DEFAULT_GITLAB_API_URL;
  }

  private get projectId(): string {
    return encodeURIComponent(`${REPO_OWNER}/${REPO_NAME}`);
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    validateProviderEnv();

    return {
      'User-Agent': 'Tauri-Updater-Proxy',
      'PRIVATE-TOKEN': GIT_TOKEN,
      ...extraHeaders,
    };
  }

  public async getReleases(): Promise<UnifiedRelease[]> {
    const res = await fetch(`${this.baseUrl}/projects/${this.projectId}/releases`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      throw new Error(`GitLab API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as GitLabRelease[];
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map(r => ({
      tag_name: r.tag_name,
      name: r.name ?? r.tag_name,
      body: r.description ?? '',
      published_at: r.released_at ?? null,
      draft: false,
      prerelease: Boolean(r.upcoming_release),
      assets: (r.assets?.links ?? []).map(link => ({
        id: Buffer.from(link.url).toString('base64url'),
        name: link.name,
        url: link.url,
        downloadUrl: link.direct_asset_url ?? link.url,
      })),
    }));
  }

  public async getReleaseByTag(tag: string): Promise<UnifiedRelease | null> {
    const cleanTag = tag.trim().replace(/^v+/, '');
    const headers = this.getHeaders();

    let res = await fetch(
      `${this.baseUrl}/projects/${this.projectId}/releases/${encodeURIComponent(cleanTag)}`,
      { headers },
    );

    if (!res.ok && res.status === 404) {
      res = await fetch(
        `${this.baseUrl}/projects/${this.projectId}/releases/${encodeURIComponent(`v${cleanTag}`)}`,
        { headers },
      );
    }

    if (!res.ok) {
      return null;
    }

    const r = (await res.json()) as GitLabRelease;
    return {
      tag_name: r.tag_name,
      name: r.name ?? r.tag_name,
      body: r.description ?? '',
      published_at: r.released_at ?? null,
      draft: false,
      prerelease: Boolean(r.upcoming_release),
      assets: (r.assets?.links ?? []).map(link => ({
        id: Buffer.from(link.url).toString('base64url'),
        name: link.name,
        url: link.url,
        downloadUrl: link.direct_asset_url ?? link.url,
      })),
    };
  }

  public async getRawFile(filePath: string, ref: string): Promise<string | null> {
    const headers = this.getHeaders();
    const encodedPath = encodeURIComponent(filePath);
    const refParam = `?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(
      `${this.baseUrl}/projects/${this.projectId}/repository/files/${encodedPath}/raw${refParam}`,
      { headers },
    );

    if (!res.ok) {
      return null;
    }

    return res.text();
  }

  public async listDirectoryFiles(dirPath: string, ref: string): Promise<string[] | null> {
    const headers = this.getHeaders();
    const pathParam = encodeURIComponent(dirPath);
    const refParam = encodeURIComponent(ref);
    const res = await fetch(
      `${this.baseUrl}/projects/${this.projectId}/repository/tree?path=${pathParam}&ref=${refParam}&per_page=100`,
      { headers },
    );

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      return null;
    }

    const items = (await res.json()) as GitLabTreeItem[];
    if (!Array.isArray(items)) {
      return [];
    }

    return items.filter(item => item.type === 'blob').map(item => item.name);
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
    let targetUrl: string;
    try {
      targetUrl = Buffer.from(assetId, 'base64url').toString('utf8');
      if (!targetUrl.startsWith('http')) {
        throw new Error('Invalid decoded URL');
      }
    } catch {
      throw new Error(`Invalid assetId provided for GitLab provider: ${assetId}`);
    }

    const res = await fetch(targetUrl, {
      headers: this.getHeaders(),
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

    throw new Error(`Failed to download asset from GitLab: ${res.status} ${res.statusText}`);
  }
}
