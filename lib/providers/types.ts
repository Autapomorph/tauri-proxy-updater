export const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export interface UnifiedAsset {
  downloadUrl?: string;
  id: string;
  name: string;
  url?: string;
}

export interface UnifiedRelease {
  assets: UnifiedAsset[];
  body: string;
  draft?: boolean;
  name?: string;
  prerelease?: boolean;
  publishedAt: string | null;
  tagName: string;
}

export interface StreamAssetResult {
  contentDisposition?: string | null;
  contentLength?: string | null;
  contentType?: string;
  redirectUrl?: string;
  stream?: NodeJS.ReadableStream | ReadableStream | null;
}

export interface GitProvider {
  getAssetSignature(asset: UnifiedAsset): Promise<string>;
  getRawFile(path: string, ref: string): Promise<string | null>;
  getReleaseByTag(tag: string): Promise<UnifiedRelease | null>;
  getReleases(): Promise<UnifiedRelease[]>;
  listDirectoryFiles(path: string, ref: string): Promise<string[] | null>;
  streamAsset(assetId: string): Promise<StreamAssetResult>;
}
