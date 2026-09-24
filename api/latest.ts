import type { VercelRequest, VercelResponse } from '@vercel/node';

import { getGitHubHeaders, REPO_API_URL, REPO_BRANCH } from '../lib/github.js';

const VALID_LATEST_FILE_PATTERN = /^latest(\.[a-zA-Z0-9_.-]+)*\.json$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const requestedFile = Array.isArray(req.query.file) ? req.query.file[0] : req.query.file;
  const queryChannel = Array.isArray(req.query.channel) ? req.query.channel[0] : req.query.channel;
  const headerChannel = Array.isArray(req.headers['x-update-channel'])
    ? req.headers['x-update-channel'][0]
    : req.headers['x-update-channel'];

  // Check if requested file specifies a dedicated channel (e.g. latest.beta.json)
  const isChannelSpecificFile = Boolean(
    requestedFile &&
    VALID_LATEST_FILE_PATTERN.test(requestedFile) &&
    requestedFile.toLowerCase() !== 'latest.json',
  );

  let fileName = 'latest.json';

  // Priority:
  // 1. Explicit query ?channel= takes precedence over file / header
  // 2. Channel specified in requested filename (e.g. latest.beta.json)
  // 3. Header X-Update-Channel
  // 4. Base file (e.g. latest.json)
  if (queryChannel && /^[a-zA-Z0-9_.-]+$/.test(queryChannel)) {
    fileName =
      queryChannel.toLowerCase() === 'stable'
        ? 'latest.stable.json'
        : `latest.${queryChannel.toLowerCase()}.json`;
  } else if (isChannelSpecificFile && requestedFile) {
    fileName = requestedFile.toLowerCase();
  } else if (headerChannel && /^[a-zA-Z0-9_.-]+$/.test(headerChannel)) {
    fileName =
      headerChannel.toLowerCase() === 'stable'
        ? 'latest.stable.json'
        : `latest.${headerChannel.toLowerCase()}.json`;
  } else if (requestedFile && VALID_LATEST_FILE_PATTERN.test(requestedFile)) {
    fileName = requestedFile.toLowerCase();
  }

  try {
    const headers = getGitHubHeaders({ Accept: 'application/vnd.github.v3.raw' });
    const refParam = `?ref=${encodeURIComponent(REPO_BRANCH)}`;
    let ghResponse = await fetch(`${REPO_API_URL}/contents/${fileName}${refParam}`, { headers });

    // Fallback to default latest.json if channel-specific manifest is not found in GitHub repo
    if (!ghResponse.ok && fileName !== 'latest.json') {
      ghResponse = await fetch(`${REPO_API_URL}/contents/latest.json${refParam}`, { headers });
    }

    if (!ghResponse.ok) {
      return res.status(502).send(`Error fetching ${fileName} from GitHub`);
    }

    const data: unknown = await ghResponse.json();
    res.setHeader('Vary', 'Origin, X-Update-Channel');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}
