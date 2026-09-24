import { AzureDevOpsProvider } from './azure-devops.js';
import { BitbucketProvider } from './bitbucket.js';
import { GiteaProvider } from './gitea.js';
import { GitFlicProvider } from './gitflic.js';
import { GitHubProvider } from './github.js';
import { GitLabProvider } from './gitlab.js';
import { GitVerseProvider } from './gitverse.js';
import { OneDevProvider } from './onedev.js';
import type { GitProvider } from './types.js';
import { type SupportedGitProvider, GIT_PROVIDER } from '../config/index.js';

export * from './types.js';

let cachedProvider: GitProvider | null = null;

export function getProvider(providerType: SupportedGitProvider = GIT_PROVIDER): GitProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  switch (providerType) {
    case 'gitlab':
      cachedProvider = new GitLabProvider();
      break;
    case 'gitea':
      cachedProvider = new GiteaProvider();
      break;
    case 'gitverse':
      cachedProvider = new GitVerseProvider();
      break;
    case 'gitflic':
      cachedProvider = new GitFlicProvider();
      break;
    case 'bitbucket':
      cachedProvider = new BitbucketProvider();
      break;
    case 'azure_devops':
      cachedProvider = new AzureDevOpsProvider();
      break;
    case 'onedev':
      cachedProvider = new OneDevProvider();
      break;
    case 'github':
    default:
      cachedProvider = new GitHubProvider();
      break;
  }

  return cachedProvider;
}
