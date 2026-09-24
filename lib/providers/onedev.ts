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

interface OneDevTag {
  message?: string;
  name: string;
}

interface OneDevTreeItem {
  name: string;
  type: string;
}

const DEFAULT_ONEDEV_API_URL = 'https://code.onedev.io/~api';

export class OneDevProvider implements GitProvider {
  private get baseUrl(): string {
    return (GIT_API_URL || DEFAULT_ONEDEV_API_URL).replace(/\/+$/, '');
  }

  private get projectPath(): string {
    return encodeURIComponent(`${REPO_OWNER}/${REPO_NAME}`);
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    validateProviderEnv();

    return {
      'User-Agent': 'Tauri-Updater-Proxy',
      Authorization: `Bearer ${GIT_TOKEN}`,
      ...extraHeaders,
    };
  }

  public async getReleases(): Promise<UnifiedRelease[]> {
    const headers = this.getHeaders({ Accept: 'application/json' });
    const res = await fetch(`${this.baseUrl}/projects/${this.projectPath}/tags`, { headers });

    if (!res.ok) {
      throw new Error(`OneDev API error: ${res.status} ${res.statusText}`);
    }

    const tags = (await res.json()) as OneDevTag[];
    if (!Array.isArray(tags)) {
      return [];
    }

    return tags.map(t => ({
      tag_name: t.name,
      name: t.name,
      body: t.message ?? '',
      published_at: null,
      draft: false,
      prerelease: t.name.includes('-'),
      assets: [],
    }));
  }

  public async getReleaseByTag(tag: string): Promise<UnifiedRelease | null> {
    const cleanTag = tag.trim().replace(/^v+/, '');
    const headers = this.getHeaders({ Accept: 'application/json' });

    let res = await fetch(
      `${this.baseUrl}/projects/${this.projectPath}/tags/${encodeURIComponent(cleanTag)}`,
      { headers },
    );
    if (!res.ok && res.status === 404) {
      res = await fetch(
        `${this.baseUrl}/projects/${this.projectPath}/tags/${encodeURIComponent(`v${cleanTag}`)}`,
        { headers },
      );
    }

    if (!res.ok) {
      return null;
    }

    const t = (await res.json()) as OneDevTag;
    return {
      tag_name: t.name,
      name: t.name,
      body: t.message ?? '',
      published_at: null,
      draft: false,
      prerelease: t.name.includes('-'),
      assets: [],
    };
  }

  public async getRawFile(filePath: string, ref: string): Promise<string | null> {
    const headers = this.getHeaders();
    const cleanPath = filePath.replace(/^\/+/, '');
    const url = `${this.baseUrl}/projects/${this.projectPath}/blob?revision=${encodeURIComponent(ref)}&path=${encodeURIComponent(cleanPath)}`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      return null;
    }

    return res.text();
  }

  public async listDirectoryFiles(dirPath: string, ref: string): Promise<string[] | null> {
    const headers = this.getHeaders({ Accept: 'application/json' });
    const cleanDir = dirPath.replace(/^\/+|\/+$/g, '');
    const url = `${this.baseUrl}/projects/${this.projectPath}/blob-tree?revision=${encodeURIComponent(ref)}&path=${encodeURIComponent(cleanDir)}`;

    const res = await fetch(url, { headers });
    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      return null;
    }

    const items = (await res.json()) as OneDevTreeItem[];
    if (!Array.isArray(items)) {
      return [];
    }

    return items.filter(item => item.type === 'FILE').map(item => item.name);
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
      : `${this.baseUrl}/projects/${this.projectPath}/blob?path=${encodeURIComponent(assetId)}`;

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

    throw new Error(`Failed to download asset from OneDev: ${res.status} ${res.statusText}`);
  }
}
