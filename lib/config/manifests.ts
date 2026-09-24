export type ManifestSource = 'auto' | 'releases' | 'repo';

export const DEFAULT_MANIFEST_SOURCE: ManifestSource = 'auto';
export const DEFAULT_MANIFESTS_DIR = '';

export const MANIFESTS_DIR = (process.env.MANIFESTS_DIR ?? DEFAULT_MANIFESTS_DIR)
  .trim()
  .replace(/^\/+|\/+$/g, '');

const rawManifestSource = (process.env.MANIFEST_SOURCE ?? DEFAULT_MANIFEST_SOURCE)
  .toLowerCase()
  .trim();

export const MANIFEST_SOURCE: ManifestSource = (
  ['auto', 'releases', 'repo'].includes(rawManifestSource)
    ? rawManifestSource
    : DEFAULT_MANIFEST_SOURCE
) as ManifestSource;

export function getManifestPath(fileName: string): string {
  return MANIFESTS_DIR ? `${MANIFESTS_DIR}/${fileName}` : fileName;
}
