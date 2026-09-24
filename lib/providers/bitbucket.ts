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

interface BitbucketTag {
  name: string;
  target?: {
    date?: string;
    message?: string;
  };
}

interface BitbucketDownload {
  links?: {
    self?: {
      href?: string;
    };
  };
  name: string;
}

interface BitbucketSrcItem {
  path: string;
  type: string;
}

const DEFAULT_BITBUCKET_API_URL = 'https://api.bitbucket.org/2.0';

export class BitbucketProvider implements GitProvider {
  private get baseUrl(): string {
    return GIT_API_URL || DEFAULT_BITBUCKET_API_URL;
  }

  private get repoUrl(): string {
    return `${this.baseUrl}/repositories/${REPO_OWNER}/${REPO_NAME}`;
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    validateProviderEnv();

    const authHeader = GIT_TOKEN.includes(':')
      ? `Basic ${Buffer.from(GIT_TOKEN).toString('base64')}`
      : `Bearer ${GIT_TOKEN}`;

    return {
      'User-Agent': 'Tauri-Updater-Proxy',
      Authorization: authHeader,
      ...extraHeaders,
    };
  }

  public async getReleases(): Promise<UnifiedRelease[]> {
    const headers = this.getHeaders({ Accept: 'application/json' });

    // Fetch tags
    const tagsRes = await fetch(`${this.repoUrl}/refs/tags?sort=-target.date&pagelen=100`, {
      headers,
    });
    if (!tagsRes.ok) {
      throw new Error(`Bitbucket API error (tags): ${tagsRes.status} ${tagsRes.statusText}`);
    }

    const tagsData = (await tagsRes.json()) as { values?: BitbucketTag[] };
    const tags = tagsData.values ?? [];

    // Fetch downloads
    let downloads: BitbucketDownload[] = [];
    try {
      const dlRes = await fetch(`${this.repoUrl}/downloads?pagelen=100`, { headers });
      if (dlRes.ok) {
        const dlData = (await dlRes.json()) as { values?: BitbucketDownload[] };
        downloads = dlData.values ?? [];
      }
    } catch {
      downloads = [];
    }

    return tags.map(tag => {
      const cleanVer = tag.name.replace(/^v+/, '');
      // Match assets that contain this version or all downloads if version specific
      const matchingDownloads = downloads.filter(d => d.name.includes(cleanVer));
      const releaseAssets = (matchingDownloads.length > 0 ? matchingDownloads : downloads).map(
        d => ({
          id: d.name,
          name: d.name,
          url: d.links?.self?.href ?? `${this.repoUrl}/downloads/${encodeURIComponent(d.name)}`,
          downloadUrl:
            d.links?.self?.href ?? `${this.repoUrl}/downloads/${encodeURIComponent(d.name)}`,
        }),
      );

      return {
        tag_name: tag.name,
        name: tag.name,
        body: tag.target?.message ?? '',
        published_at: tag.target?.date ?? null,
        draft: false,
        prerelease: tag.name.includes('-'),
        assets: releaseAssets,
      };
    });
  }

  public async getReleaseByTag(tag: string): Promise<UnifiedRelease | null> {
    const cleanTag = tag.trim().replace(/^v+/, '');
    const headers = this.getHeaders({ Accept: 'application/json' });

    let res = await fetch(`${this.repoUrl}/refs/tags/${encodeURIComponent(cleanTag)}`, { headers });
    if (!res.ok && res.status === 404) {
      res = await fetch(`${this.repoUrl}/refs/tags/${encodeURIComponent(`v${cleanTag}`)}`, {
        headers,
      });
    }

    if (!res.ok) {
      return null;
    }

    const tagData = (await res.json()) as BitbucketTag;
    return {
      tag_name: tagData.name,
      name: tagData.name,
      body: tagData.target?.message ?? '',
      published_at: tagData.target?.date ?? null,
      draft: false,
      prerelease: tagData.name.includes('-'),
      assets: [],
    };
  }

  public async getRawFile(filePath: string, ref: string): Promise<string | null> {
    const headers = this.getHeaders();
    const cleanPath = filePath.replace(/^\/+/, '');
    const res = await fetch(
      `${this.repoUrl}/src/${encodeURIComponent(ref)}/${encodeURIComponent(cleanPath)}`,
      { headers },
    );

    if (!res.ok) {
      return null;
    }

    return res.text();
  }

  public async listDirectoryFiles(dirPath: string, ref: string): Promise<string[] | null> {
    const headers = this.getHeaders({ Accept: 'application/json' });
    const cleanDir = dirPath.replace(/^\/+|\/+$/g, '');
    const res = await fetch(
      `${this.repoUrl}/src/${encodeURIComponent(ref)}/${cleanDir}/?pagelen=100`,
      { headers },
    );

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { values?: BitbucketSrcItem[] };
    const items = data.values ?? [];

    return items
      .filter(item => item.type === 'commit_file')
      .map(item => item.path.split('/').pop() ?? item.path);
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
    const downloadUrl = assetId.startsWith('http')
      ? assetId
      : `${this.repoUrl}/downloads/${encodeURIComponent(assetId)}`;

    const res = await fetch(downloadUrl, {
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

    throw new Error(`Failed to download asset from Bitbucket: ${res.status} ${res.statusText}`);
  }
}
