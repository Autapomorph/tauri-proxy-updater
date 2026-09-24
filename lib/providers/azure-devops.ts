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

interface AzureTagRef {
  name: string;
}

interface AzureItem {
  isFolder?: boolean;
  path: string;
}

const DEFAULT_AZURE_DEVOPS_API_URL = 'https://dev.azure.com';

export class AzureDevOpsProvider implements GitProvider {
  private get baseUrl(): string {
    return GIT_API_URL || DEFAULT_AZURE_DEVOPS_API_URL;
  }

  private get orgAndProject(): { org: string; project: string } {
    if (REPO_OWNER.includes('/')) {
      const parts = REPO_OWNER.split('/');
      return { org: parts[0], project: parts[1] };
    }
    const project = REPO_NAME;
    return { org: REPO_OWNER, project };
  }

  private get repoUrl(): string {
    const { org, project } = this.orgAndProject;
    return `${this.baseUrl}/${org}/${project}/_apis/git/repositories/${REPO_NAME}`;
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    validateProviderEnv();

    const basicAuth = Buffer.from(`:${GIT_TOKEN}`).toString('base64');
    return {
      'User-Agent': 'Tauri-Updater-Proxy',
      Authorization: `Basic ${basicAuth}`,
      ...extraHeaders,
    };
  }

  public async getReleases(): Promise<UnifiedRelease[]> {
    const headers = this.getHeaders({ Accept: 'application/json' });
    const res = await fetch(`${this.repoUrl}/refs?filter=tags&api-version=7.1`, { headers });

    if (!res.ok) {
      throw new Error(`Azure DevOps API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { value?: AzureTagRef[] };
    const tags = data.value ?? [];

    return tags.map(t => {
      const tagName = t.name.replace(/^refs\/tags\//, '');
      return {
        tagName,
        name: tagName,
        body: '',
        publishedAt: null,
        draft: false,
        prerelease: tagName.includes('-'),
        assets: [],
      };
    });
  }

  public async getReleaseByTag(tag: string): Promise<UnifiedRelease | null> {
    const cleanTag = tag.trim().replace(/^v+/, '');
    const headers = this.getHeaders({ Accept: 'application/json' });

    const res = await fetch(`${this.repoUrl}/refs?filter=tags/${cleanTag}&api-version=7.1`, {
      headers,
    });
    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { value?: AzureTagRef[] };
    const match = data.value?.[0];
    if (!match) {
      return null;
    }

    const tagName = match.name.replace(/^refs\/tags\//, '');
    return {
      tagName,
      name: tagName,
      body: '',
      publishedAt: null,
      draft: false,
      prerelease: tagName.includes('-'),
      assets: [],
    };
  }

  public async getRawFile(filePath: string, ref: string): Promise<string | null> {
    const headers = this.getHeaders();
    const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    const url = `${this.repoUrl}/items?path=${encodeURIComponent(cleanPath)}&versionDescriptor.version=${encodeURIComponent(ref)}&$format=text&api-version=7.1`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
      return null;
    }

    return res.text();
  }

  public async listDirectoryFiles(dirPath: string, ref: string): Promise<string[] | null> {
    const headers = this.getHeaders({ Accept: 'application/json' });
    const cleanDir = dirPath.startsWith('/') ? dirPath : `/${dirPath}`;
    const url = `${this.repoUrl}/items?scopePath=${encodeURIComponent(cleanDir)}&recursionLevel=oneLevel&versionDescriptor.version=${encodeURIComponent(ref)}&api-version=7.1`;

    const res = await fetch(url, { headers });
    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { value?: AzureItem[] };
    const items = data.value ?? [];

    return items
      .filter(item => !item.isFolder && item.path !== cleanDir)
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
    const targetUrl = assetId.startsWith('http')
      ? assetId
      : `${this.repoUrl}/items?path=${encodeURIComponent(assetId)}&$format=octetStream&api-version=7.1`;

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

    throw new Error(`Failed to download asset from Azure DevOps: ${res.status} ${res.statusText}`);
  }
}
