import type { VercelRequest, VercelResponse } from '@vercel/node';

import { RELEASE_NOTES_DIR, REPO_BRANCH } from '../lib/config.js';
import { parseFrontmatter } from '../lib/frontmatter.js';
import { getProvider } from '../lib/providers/index.js';
import { compareSemver, isStableVersion } from '../lib/semver.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Update-Channel');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const versionParam = Array.isArray(req.query.version) ? req.query.version[0] : req.query.version;
  const tagParam = Array.isArray(req.query.tag) ? req.query.tag[0] : req.query.tag;
  const requestedVersion = versionParam ?? tagParam;

  try {
    const provider = getProvider();

    // -----------------------------------------------------------------
    // Route 1: Specific version requested (GET /release-notes/:version)
    // -----------------------------------------------------------------
    if (requestedVersion) {
      const cleanVersion = requestedVersion.trim().replace(/^v+/, '');

      let rawText = await provider.getRawFile(
        `${RELEASE_NOTES_DIR}/${cleanVersion}.mdx`,
        REPO_BRANCH,
      );

      rawText ??= await provider.getRawFile(`${RELEASE_NOTES_DIR}/${cleanVersion}.md`, REPO_BRANCH);

      if (rawText) {
        const { content, meta } = parseFrontmatter(rawText);

        res.setHeader('Vary', 'Origin');
        res.setHeader(
          'Cache-Control',
          'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
        );

        const releasedAt =
          (meta.released_at as string | undefined) ??
          (meta.releasedAt as string | undefined) ??
          (meta.date as string | undefined) ??
          null;

        return res.status(200).json({
          version: cleanVersion,
          released_at: releasedAt,
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          notes: content,
        });
      }

      // Fallback: Check Provider Releases for legacy/tagged release
      const release = await provider.getReleaseByTag(cleanVersion);

      if (release) {
        const version = release.tag_name.replace(/^v/, '');

        res.setHeader('Vary', 'Origin');
        res.setHeader(
          'Cache-Control',
          'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
        );

        return res.status(200).json({
          tag_name: release.tag_name,
          version,
          released_at: release.published_at ?? null,
          tags: [],
          notes: release.body ?? '',
        });
      }

      return res.status(404).json({ error: 'Release notes or release not found' });
    }

    // -------------------------------------------------------------
    // Route 2: List of all versions requested (GET /release-notes)
    // -------------------------------------------------------------
    const files = await provider.listDirectoryFiles(RELEASE_NOTES_DIR, REPO_BRANCH);

    if (files === null) {
      return res.status(502).send('Error fetching release notes list from provider');
    }

    let versions = files
      .filter(name => name.endsWith('.mdx') || name.endsWith('.md'))
      .map(name => name.replace(/\.mdx?$/, ''))
      .sort((a, b) => compareSemver(a, b));

    const queryChannel = Array.isArray(req.query.channel)
      ? req.query.channel[0]
      : req.query.channel;
    const headerChannel = Array.isArray(req.headers['x-update-channel'])
      ? req.headers['x-update-channel'][0]
      : req.headers['x-update-channel'];

    // Query parameter takes precedence over HTTP header
    const channel = queryChannel ?? headerChannel;
    if (channel?.toLowerCase() === 'stable') {
      versions = versions.filter(isStableVersion);
    }

    res.setHeader('Vary', 'Origin, X-Update-Channel');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=600');

    return res.status(200).json({ versions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}
