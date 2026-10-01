import { DEFAULT_FALLBACK_LANGUAGE } from './config/i18n.js';

export interface SanitizedLocale {
  language: string;
  region?: string;
  tag: string;
}

export interface ReleaseNotesMatch {
  locale: string | null;
  matchedFile: string;
}

const BCP47_REGEX = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

export function sanitizeLocale(input: unknown): SanitizedLocale | null {
  const raw = Array.isArray(input) ? input[0] : input;

  if (typeof raw !== 'string') {
    return null;
  }

  const cleaned = raw.trim().replace(/_/g, '-');

  if (!BCP47_REGEX.test(cleaned)) {
    return null;
  }

  try {
    const locale = new Intl.Locale(cleaned);
    const language = locale.language.toLowerCase();
    const region = locale.region ? locale.region.toUpperCase() : undefined;
    const tag = region ? `${language}-${region}` : language;

    return {
      language,
      region,
      tag,
    };
  } catch {
    return null;
  }
}

export function getLocalePriorityChain(
  requestedLocale?: string | null,
  fallbackLanguage?: string,
): string[] {
  const chain: string[] = [];

  const addLocale = (localeStr?: string | null) => {
    if (!localeStr) {
      return;
    }

    const parsed = sanitizeLocale(localeStr);
    if (!parsed) {
      return;
    }

    if (parsed.region) {
      chain.push(`${parsed.language}-${parsed.region}`);
    }

    chain.push(parsed.language);
  };

  addLocale(requestedLocale);
  addLocale(fallbackLanguage ?? DEFAULT_FALLBACK_LANGUAGE);
  addLocale(DEFAULT_FALLBACK_LANGUAGE);

  return Array.from(new Set(chain));
}

export function findBestReleaseNotesMatch(
  files: string[],
  version: string,
  requestedLocale?: string | null,
  fallbackLanguage?: string,
): ReleaseNotesMatch | null {
  const cleanVersion = version.trim().replace(/^v+/, '');

  const fileMap = new Map<string, string>();
  for (const file of files) {
    fileMap.set(file.toLowerCase(), file);
  }

  const priorityChain = getLocalePriorityChain(requestedLocale, fallbackLanguage);

  for (const tag of priorityChain) {
    const mdxCandidate = `${cleanVersion}.${tag}.mdx`.toLowerCase();
    const matchedMdx = fileMap.get(mdxCandidate);
    if (matchedMdx) {
      return { locale: tag, matchedFile: matchedMdx };
    }

    const mdCandidate = `${cleanVersion}.${tag}.md`.toLowerCase();
    const matchedMd = fileMap.get(mdCandidate);
    if (matchedMd) {
      return { locale: tag, matchedFile: matchedMd };
    }
  }

  const baseMdxCandidate = `${cleanVersion}.mdx`.toLowerCase();
  const matchedBaseMdx = fileMap.get(baseMdxCandidate);
  if (matchedBaseMdx) {
    return { locale: null, matchedFile: matchedBaseMdx };
  }

  const baseMdCandidate = `${cleanVersion}.md`.toLowerCase();
  const matchedBaseMd = fileMap.get(baseMdCandidate);
  if (matchedBaseMd) {
    return { locale: null, matchedFile: matchedBaseMd };
  }

  return null;
}

export function extractVersionFromFileName(fileName: string): string | null {
  if (!fileName.endsWith('.mdx') && !fileName.endsWith('.md')) {
    return null;
  }

  const base = fileName.replace(/\.mdx?$/i, '');
  const lastDotIndex = base.lastIndexOf('.');

  if (lastDotIndex > 0) {
    const possibleLocale = base.slice(lastDotIndex + 1);
    const possibleVersion = base.slice(0, lastDotIndex);

    if (sanitizeLocale(possibleLocale) !== null) {
      return possibleVersion.replace(/^v+/, '');
    }
  }

  return base.replace(/^v+/, '');
}
