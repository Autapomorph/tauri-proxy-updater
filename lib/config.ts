export type SupportedGitProvider =
  'azure_devops' | 'bitbucket' | 'gitea' | 'gitflic' | 'github' | 'gitlab' | 'gitverse' | 'onedev';

export type ManifestSource = 'auto' | 'releases' | 'repo';

export const DEFAULT_GIT_PROVIDER: SupportedGitProvider = 'github';
export const DEFAULT_REPO_BRANCH = 'main';
export const DEFAULT_MANIFEST_SOURCE: ManifestSource = 'auto';
export const DEFAULT_MANIFESTS_DIR = '';
export const DEFAULT_RELEASE_NOTES_DIR = 'release-notes';

const rawProvider = (process.env.GIT_PROVIDER ?? DEFAULT_GIT_PROVIDER).toLowerCase().trim();

export const GIT_PROVIDER: SupportedGitProvider = (
  [
    'github',
    'gitlab',
    'gitea',
    'gitverse',
    'gitflic',
    'bitbucket',
    'azure_devops',
    'onedev',
  ].includes(rawProvider)
    ? rawProvider
    : DEFAULT_GIT_PROVIDER
) as SupportedGitProvider;

export const GIT_TOKEN = (process.env.GIT_TOKEN ?? '').trim();

export const REPO_OWNER = (process.env.REPO_OWNER ?? '').trim();

export const REPO_NAME = (process.env.REPO_NAME ?? '').trim();

export const GIT_API_URL = process.env.GIT_API_URL?.trim().replace(/\/+$/, '') ?? '';

export const REPO_BRANCH = (process.env.REPO_BRANCH ?? DEFAULT_REPO_BRANCH).trim();

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

export const RELEASE_NOTES_DIR = (process.env.RELEASE_NOTES_DIR ?? DEFAULT_RELEASE_NOTES_DIR)
  .trim()
  .replace(/^\/+|\/+$/g, '');

export function getManifestPath(fileName: string): string {
  return MANIFESTS_DIR ? `${MANIFESTS_DIR}/${fileName}` : fileName;
}

export function validateProviderEnv(): void {
  if (!GIT_TOKEN || !REPO_OWNER || !REPO_NAME) {
    throw new Error(
      `Server configuration error: Missing required credentials for '${GIT_PROVIDER}'. Ensure GIT_TOKEN, REPO_OWNER, and REPO_NAME are set.`,
    );
  }
}
