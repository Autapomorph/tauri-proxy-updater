import type { VercelRequest, VercelResponse } from '@vercel/node';

import { parseFrontmatter } from '../lib/frontmatter.js';
import {
  type GitHubContentItem,
  type GitHubRelease,
  getGitHubHeaders,
  REPO_API_URL,
} from '../lib/github.js';
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
  const requestedVersion = versionParam || tagParam;

  try {
    // -------------------------------------------------------------
    // Route 1: Specific version requested (GET /changelogs/:version)
    // -------------------------------------------------------------
    if (requestedVersion) {
      const cleanVersion = requestedVersion.trim().replace(/^v+/, '');
      const rawHeaders = getGitHubHeaders({ Accept: 'application/vnd.github.raw+json' });

      let mdxResponse = await fetch(`${REPO_API_URL}/contents/changelogs/${cleanVersion}.mdx`, {
        headers: rawHeaders,
      });

      if (!mdxResponse.ok && mdxResponse.status === 404) {
        mdxResponse = await fetch(`${REPO_API_URL}/contents/changelogs/${cleanVersion}.md`, {
          headers: rawHeaders,
        });
      }

      if (mdxResponse.ok) {
        const rawText = await mdxResponse.text();
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

      // Fallback: Check GitHub Releases API for legacy releases
      const jsonHeaders = getGitHubHeaders({ Accept: 'application/vnd.github+json' });
      let ghResponse = await fetch(`${REPO_API_URL}/releases/tags/${cleanVersion}`, {
        headers: jsonHeaders,
      });

      if (!ghResponse.ok && ghResponse.status === 404) {
        ghResponse = await fetch(`${REPO_API_URL}/releases/tags/v${cleanVersion}`, {
          headers: jsonHeaders,
        });
      }

      if (ghResponse.ok) {
        const release: GitHubRelease = await ghResponse.json();
        const version = release.tag_name.replace(/^v/, '');

        res.setHeader('Vary', 'Origin');
        res.setHeader(
          'Cache-Control',
          'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
        );

        return res.status(200).json({
          tag_name: release.tag_name,
          version,
          released_at: release.published_at || null,
          tags: [],
          notes: release.body || '',
        });
      }

      return res.status(404).json({ error: 'Changelog or release not found' });
    }

    // -------------------------------------------------------------
    // Route 2: List of all versions requested (GET /changelogs)
    // -------------------------------------------------------------
    const headers = getGitHubHeaders({ Accept: 'application/vnd.github+json' });
    const apiUrl = `${REPO_API_URL}/contents/changelogs`;

    const ghResponse = await fetch(apiUrl, { headers });

    if (ghResponse.status === 404) {
      return res.status(200).json({ versions: [] });
    }

    if (!ghResponse.ok) {
      return res.status(ghResponse.status).send('Error fetching changelogs list from GitHub');
    }

    const items: GitHubContentItem[] = await ghResponse.json();

    let versions = items
      .filter(
        item => item.type === 'file' && (item.name.endsWith('.mdx') || item.name.endsWith('.md')),
      )
      .map(item => item.name.replace(/\.mdx?$/, ''))
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
