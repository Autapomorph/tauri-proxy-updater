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

interface GitFlicAttachment {
  downloadUrl?: string;
  id: number | string;
  name: string;
}

interface GitFlicRelease {
  attachments?: GitFlicAttachment[];
  description?: string;
  releaseDate?: string;
  tag?: string;
  tagName?: string;
  title?: string;
}

interface GitFlicTreeItem {
  name: string;
  type?: string;
}

interface GitFlicEmbeddedReleases {
  releaseList?: GitFlicRelease[];
}

interface GitFlicEmbeddedFiles {
  fileList?: GitFlicTreeItem[];
}

function extractReleaseList(json: unknown): GitFlicRelease[] {
  if (Array.isArray(json)) {
    return json as GitFlicRelease[];
  }
  if (json && typeof json === 'object') {
    const { content } = json as { content?: GitFlicRelease[] };
    if (Array.isArray(content)) {
      return content;
    }
    const embedded = Reflect.get(json, '_embedded') as GitFlicEmbeddedReleases | undefined;
    if (Array.isArray(embedded?.releaseList)) {
      return embedded.releaseList;
    }
  }
  return [];
}

function extractFileList(data: unknown): GitFlicTreeItem[] {
  if (Array.isArray(data)) {
    return data as GitFlicTreeItem[];
  }
  if (data && typeof data === 'object') {
    const { content } = data as { content?: GitFlicTreeItem[] };
    if (Array.isArray(content)) {
      return content;
    }
    const embedded = Reflect.get(data, '_embedded') as GitFlicEmbeddedFiles | undefined;
    if (Array.isArray(embedded?.fileList)) {
      return embedded.fileList;
    }
  }
  return [];
}

export const DEFAULT_GITFLIC_API_URL = 'https://api.gitflic.ru';

export class GitFlicProvider implements GitProvider {
  private get baseUrl(): string {
    return (GIT_API_URL || DEFAULT_GITFLIC_API_URL).replace(/\/+$/, '');
  }

  private get projectUrl(): string {
    return `${this.baseUrl}/project/${REPO_OWNER}/${REPO_NAME}`;
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
    const headers = this.getHeaders({ Accept: 'application/json' });
    const res = await fetch(`${this.projectUrl}/release`, { headers });

    if (!res.ok) {
      throw new Error(`GitFlic API error: ${res.status} ${res.statusText}`);
    }

    const items = extractReleaseList(await res.json());

    return items.map(r => {
      const tagName = r.tag ?? r.tagName ?? '';
      return {
        tagName,
        name: r.title ?? tagName,
        body: r.description ?? '',
        publishedAt: r.releaseDate ?? null,
        draft: false,
        prerelease: tagName.includes('-'),
        assets: (r.attachments ?? []).map(a => ({
          id: String(a.id),
          name: a.name,
          url: a.downloadUrl,
          downloadUrl: a.downloadUrl,
        })),
      };
    });
  }

  public async getReleaseByTag(tag: string): Promise<UnifiedRelease | null> {
    const cleanTag = tag.trim().replace(/^v+/, '');
    const headers = this.getHeaders({ Accept: 'application/json' });

    let res = await fetch(`${this.projectUrl}/release/${encodeURIComponent(cleanTag)}`, {
      headers,
    });
    if (!res.ok && res.status === 404) {
      res = await fetch(`${this.projectUrl}/release/${encodeURIComponent(`v${cleanTag}`)}`, {
        headers,
      });
    }

    if (!res.ok) {
      return null;
    }

    const r = (await res.json()) as GitFlicRelease;
    const tagName = r.tag ?? r.tagName ?? cleanTag;

    return {
      tagName,
      name: r.title ?? tagName,
      body: r.description ?? '',
      publishedAt: r.releaseDate ?? null,
      draft: false,
      prerelease: tagName.includes('-'),
      assets: (r.attachments ?? []).map(a => ({
        id: String(a.id),
        name: a.name,
        url: a.downloadUrl,
        downloadUrl: a.downloadUrl,
      })),
    };
  }

  public async getRawFile(filePath: string, ref: string): Promise<string | null> {
    const headers = this.getHeaders();
    const cleanPath = filePath.replace(/^\/+/, '');

    let res = await fetch(
      `${this.projectUrl}/raw?branch=${encodeURIComponent(ref)}&path=${encodeURIComponent(cleanPath)}`,
      { headers },
    );

    if (!res.ok && res.status === 404) {
      res = await fetch(
        `${this.projectUrl}/blob/raw?branch=${encodeURIComponent(ref)}&file=${encodeURIComponent(cleanPath)}`,
        { headers },
      );
    }

    if (!res.ok && res.status === 404) {
      res = await fetch(`${this.projectUrl}/raw/${encodeURIComponent(ref)}/${cleanPath}`, {
        headers,
      });
    }

    if (!res.ok) {
      return null;
    }

    return res.text();
  }

  public async listDirectoryFiles(dirPath: string, ref: string): Promise<string[] | null> {
    const headers = this.getHeaders({ Accept: 'application/json' });
    const cleanDir = dirPath.replace(/^\/+|\/+$/g, '');

    let res = await fetch(
      `${this.projectUrl}/tree?branch=${encodeURIComponent(ref)}&path=${encodeURIComponent(cleanDir)}`,
      { headers },
    );

    if (!res.ok && res.status === 404) {
      res = await fetch(
        `${this.projectUrl}/tree/${encodeURIComponent(ref)}/${encodeURIComponent(cleanDir)}`,
        { headers },
      );
    }

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      return null;
    }

    const items = extractFileList(await res.json());

    return items
      .filter(item => !item.type || item.type.toLowerCase() === 'file')
      .map(item => item.name);
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
      : `${this.projectUrl}/release/attachment/${assetId}`;

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

    throw new Error(`Failed to download asset from GitFlic: ${res.status} ${res.statusText}`);
  }
}
