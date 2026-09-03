import type { VercelRequest, VercelResponse } from '@vercel/node';

import { REPO_API_URL, getGitHubHeaders } from '../lib/github.js';

interface GitHubContentItem {
  name: string;
  type: string;
}

interface GitHubRelease {
  tag_name: string;
  body: string;
  published_at: string;
}

interface ParsedFrontmatter {
  meta: Record<string, any>;
  content: string;
}

function parseSemver(v: string) {
  const clean = v.replace(/^v/, '');
  const [main, pre] = clean.split('-');
  const parts = main.split('.').map(n => parseInt(n, 10) || 0);
  return { parts, pre };
}

function compareSemverDesc(a: string, b: string): number {
  const vA = parseSemver(a);
  const vB = parseSemver(b);

  const maxLen = Math.max(vA.parts.length, vB.parts.length);

  for (let i = 0; i < maxLen; i++) {
    const numA = vA.parts[i] ?? 0;
    const numB = vB.parts[i] ?? 0;

    if (numA !== numB) {
      return numB - numA;
    }
  }

  if (!vA.pre && vB.pre) {
    return -1;
  }

  if (vA.pre && !vB.pre) {
    return 1;
  }

  return 0;
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);

  if (!match) {
    return { meta: {}, content: raw.trim() };
  }

  const frontmatterBlock = match[1];
  const content = match[2].trim();
  const meta: Record<string, any> = {};

  for (const line of frontmatterBlock.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const colonIndex = trimmed.indexOf(':');

    if (colonIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value
        .slice(1, -1)
        .split(',')
        .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);

      meta[key] = items;
    } else {
      value = value.replace(/^['"]|['"]$/g, '');
      meta[key] = value;
    }
  }

  return { meta, content };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
        const { meta, content } = parseFrontmatter(rawText);

        res.setHeader('Vary', 'Origin');
        res.setHeader(
          'Cache-Control',
          'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
        );

        const releasedAt = meta.released_at || meta.releasedAt || meta.date || null;

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
          version: version,
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

    const versions = items
      .filter(
        item => item.type === 'file' && (item.name.endsWith('.mdx') || item.name.endsWith('.md')),
      )
      .map(item => item.name.replace(/\.mdx?$/, ''))
      .sort(compareSemverDesc);

    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=120, stale-while-revalidate=600');

    return res.status(200).json({ versions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}
