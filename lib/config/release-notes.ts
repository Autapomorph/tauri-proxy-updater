export const DEFAULT_RELEASE_NOTES_DIR = 'release-notes';

export const RELEASE_NOTES_DIR = (process.env.RELEASE_NOTES_DIR ?? DEFAULT_RELEASE_NOTES_DIR)
  .trim()
  .replace(/^\/+|\/+$/g, '');
