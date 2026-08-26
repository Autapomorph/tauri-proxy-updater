import type { VercelRequest, VercelResponse } from '@vercel/node';
import { REPO_API_URL, getGitHubHeaders } from '../lib/github.js';

interface GitHubRelease {
  tag_name: string;
  body: string;
  published_at: string;
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

  const tagQuery = Array.isArray(req.query.tag) ? req.query.tag[0] : req.query.tag;
  const versionQuery = Array.isArray(req.query.version) ? req.query.version[0] : req.query.version;
  const targetTag = tagQuery || versionQuery;

  try {
    const headers = getGitHubHeaders({ Accept: 'application/vnd.github+json' });

    let apiUrl: string;
    if (targetTag) {
      const cleanTag = targetTag.trim();
      apiUrl = `${REPO_API_URL}/releases/tags/${cleanTag}`;
    } else {
      apiUrl = `${REPO_API_URL}/releases/latest`;
    }

    let ghResponse = await fetch(apiUrl, { headers });

    // Fallback 1: if tag not found and starts with 'v', try without 'v' prefix
    if (!ghResponse.ok && targetTag && targetTag.startsWith('v')) {
      const cleanWithoutV = targetTag.trim().replace(/^v+/, '');
      const noVApiUrl = `${REPO_API_URL}/releases/tags/${cleanWithoutV}`;
      const noVGhResponse = await fetch(noVApiUrl, { headers });

      if (noVGhResponse.ok) {
        ghResponse = noVGhResponse;
      }
    }
    // Fallback 2: if tag not found and does not start with 'v', try with 'v' prefix
    else if (!ghResponse.ok && targetTag && !targetTag.startsWith('v')) {
      const vApiUrl = `${REPO_API_URL}/releases/tags/v${targetTag.trim()}`;
      const vGhResponse = await fetch(vApiUrl, { headers });

      if (vGhResponse.ok) {
        ghResponse = vGhResponse;
      }
    }

    if (!ghResponse.ok) {
      if (ghResponse.status === 404) {
        return res.status(404).json({ error: 'Release not found' });
      }

      return res.status(ghResponse.status).send('Error fetching release from GitHub');
    }

    const release: GitHubRelease = await ghResponse.json();
    const version = release.tag_name.replace(/^v/, '');

    res.setHeader('Vary', 'Origin');
    res.setHeader(
      'Cache-Control',
      'public, max-age=0, s-maxage=600, stale-while-revalidate=1200, must-revalidate',
    );

    return res.status(200).json({
      tag_name: release.tag_name,
      version: version,
      published_at: release.published_at,
      notes: release.body || '',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}
