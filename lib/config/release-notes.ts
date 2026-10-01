export type ReleaseNotesDirStructure = 'auto' | 'flat' | 'nested';

export const DEFAULT_RELEASE_NOTES_DIR = 'release-notes';
export const DEFAULT_RELEASE_NOTES_DIR_STRUCTURE: ReleaseNotesDirStructure = 'auto';

export const RELEASE_NOTES_DIR = (process.env.RELEASE_NOTES_DIR ?? DEFAULT_RELEASE_NOTES_DIR)
  .trim()
  .replace(/^\/+|\/+$/g, '');

const rawStructure = (
  process.env.RELEASE_NOTES_DIR_STRUCTURE ?? DEFAULT_RELEASE_NOTES_DIR_STRUCTURE
)
  .toLowerCase()
  .trim();

export const RELEASE_NOTES_DIR_STRUCTURE: ReleaseNotesDirStructure = (
  ['auto', 'flat', 'nested'].includes(rawStructure)
    ? rawStructure
    : DEFAULT_RELEASE_NOTES_DIR_STRUCTURE
) as ReleaseNotesDirStructure;
