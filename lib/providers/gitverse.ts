import { GiteaProvider } from './gitea.js';

export const DEFAULT_GITVERSE_API_URL = 'https://gitverse.ru/api/v1';

export class GitVerseProvider extends GiteaProvider {
  protected override readonly defaultBaseUrl: string = DEFAULT_GITVERSE_API_URL;
}
