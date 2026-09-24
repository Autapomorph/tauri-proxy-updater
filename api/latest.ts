import type { VercelRequest, VercelResponse } from '@vercel/node';

import { REPO_BRANCH } from '../lib/config.js';
import { getProvider } from '../lib/providers/index.js';

const VALID_LATEST_FILE_PATTERN = /^latest(\.[a-zA-Z0-9_.-]+)*\.json$/i;
const DEFAULT_MANIFEST_FILE = 'latest.json';

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
    requestedFile.toLowerCase() !== DEFAULT_MANIFEST_FILE,
  );

  let fileName = DEFAULT_MANIFEST_FILE;

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
    const provider = getProvider();
    let content = await provider.getRawFile(fileName, REPO_BRANCH);

    // Fallback to default latest.json if channel-specific manifest is not found in repo
    if (!content && fileName !== DEFAULT_MANIFEST_FILE) {
      content = await provider.getRawFile(DEFAULT_MANIFEST_FILE, REPO_BRANCH);
    }

    if (!content) {
      return res.status(502).send(`Error fetching ${fileName} from provider`);
    }

    const data: unknown = JSON.parse(content);
    res.setHeader('Vary', 'Origin, X-Update-Channel');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}
