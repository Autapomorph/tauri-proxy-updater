import type { VercelRequest, VercelResponse } from '@vercel/node';
import { REPO_API_URL, getGitHubHeaders } from '../lib/github.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const asset_id = Array.isArray(req.query.asset_id) ? req.query.asset_id[0] : req.query.asset_id;

  if (!asset_id || !/^\d+$/.test(asset_id)) {
    return res.status(400).send('Invalid or missing asset_id parameter');
  }

  try {
    const headers = getGitHubHeaders({ Accept: 'application/octet-stream' });

    const assetResponse = await fetch(`${REPO_API_URL}/releases/assets/${asset_id}`, {
      headers,
      redirect: 'manual',
    });

    const redirectUrl = assetResponse.headers.get('location');

    if (assetResponse.status === 302 && redirectUrl) {
      res.setHeader('Location', redirectUrl);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(302).end();
    }

    return res.status(500).send('Failed to get download link from GitHub');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}
