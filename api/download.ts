import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import { getProvider } from '../lib/providers/index.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const assetId = Array.isArray(req.query.asset_id) ? req.query.asset_id[0] : req.query.asset_id;

  if (!assetId || typeof assetId !== 'string') {
    return res.status(400).send('Invalid or missing asset_id parameter');
  }

  try {
    const provider = getProvider();
    const result = await provider.streamAsset(assetId);

    if (result.redirectUrl) {
      res.setHeader('Location', result.redirectUrl);
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.status(302).end();
    }

    if (result.stream) {
      if (result.contentType) {
        res.setHeader('Content-Type', result.contentType);
      }

      if (result.contentLength) {
        res.setHeader('Content-Length', result.contentLength);
      }

      if (result.contentDisposition) {
        res.setHeader('Content-Disposition', result.contentDisposition);
      }

      res.setHeader('Cache-Control', 'public, max-age=300');

      if (result.stream instanceof Readable) {
        return result.stream.pipe(res);
      }

      const nodeStream = Readable.fromWeb(result.stream as WebReadableStream);
      return nodeStream.pipe(res);
    }

    return res.status(500).send('Failed to stream asset from provider');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}
