import type { VercelRequest, VercelResponse } from '@vercel/node';

import { REPO_API_URL, getGitHubHeaders } from '../lib/github.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const headers = getGitHubHeaders({ Accept: 'application/vnd.github.v3.raw' });

    const ghResponse = await fetch(`${REPO_API_URL}/contents/latest.json`, { headers });

    if (!ghResponse.ok) {
      return res.status(502).send('Error fetching latest.json from GitHub');
    }

    const data: unknown = await ghResponse.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}
