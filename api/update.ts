import type { VercelRequest, VercelResponse } from '@vercel/node';
import semver from 'semver';

import { getProvider } from '../lib/providers/index.js';
import type { UnifiedAsset } from '../lib/providers/types.js';
import { getEligibleReleases } from '../lib/semver.js';
import { type TauriUpdateResponse, findReleaseAssets } from '../lib/updater.js';

const DEFAULT_CHANNEL = 'stable';
const DEFAULT_PROTOCOL = 'https';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const target = Array.isArray(req.query.target) ? req.query.target[0] : req.query.target;
  const version = Array.isArray(req.query.version) ? req.query.version[0] : req.query.version;

  if (!target || !version) {
    return res.status(400).send('Missing target or version parameters');
  }

  const cleanCurrentVersion = version.replace(/^v/, '').trim();

  try {
    const queryChannel = Array.isArray(req.query.channel)
      ? req.query.channel[0]
      : req.query.channel;
    const headerChannel = Array.isArray(req.headers['x-update-channel'])
      ? req.headers['x-update-channel'][0]
      : req.headers['x-update-channel'];

    // Query parameter takes precedence over HTTP header
    const channel = (queryChannel ?? headerChannel)?.toLowerCase() ?? DEFAULT_CHANNEL;
    const wantPrerelease = channel !== DEFAULT_CHANNEL;

    const provider = getProvider();
    const releases = await provider.getReleases();

    if (!Array.isArray(releases) || releases.length === 0) {
      return res.status(404).send('No releases found on provider');
    }

    const eligibleReleases = getEligibleReleases(releases, { wantPrerelease });

    if (eligibleReleases.length === 0) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(204).end();
    }

    const candidate = eligibleReleases[0];
    const candidateVersion = candidate.tagName.replace(/^v/, '').trim();

    // Check if update is required
    const parsedCurrent = semver.valid(cleanCurrentVersion);
    const parsedCandidate = semver.valid(candidateVersion);

    const shouldUpdate =
      parsedCurrent && parsedCandidate
        ? semver.gt(parsedCandidate, parsedCurrent)
        : candidateVersion !== cleanCurrentVersion;

    if (!shouldUpdate) {
      res.setHeader('Vary', 'Origin, X-Update-Channel');
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(204).end();
    }

    let binaryAsset: UnifiedAsset | null = null;
    let signature = '';

    // 1. Try resolving binary asset and signature from release manifest (e.g. latest.json)
    const manifestFileName = channel !== DEFAULT_CHANNEL ? `latest.${channel}.json` : 'latest.json';
    const manifestAsset =
      candidate.assets?.find(a => a.name.toLowerCase() === manifestFileName.toLowerCase()) ??
      candidate.assets?.find(a => a.name.toLowerCase() === 'latest.json');

    if (manifestAsset) {
      try {
        const manifestRaw = await provider.getAssetSignature(manifestAsset);
        if (manifestRaw) {
          const manifest = JSON.parse(manifestRaw) as {
            platforms?: Record<string, { signature?: string; url?: string }>;
          };
          const platformInfo = manifest?.platforms?.[target];
          if (platformInfo?.url) {
            const cleanUrl = platformInfo.url.split('?')[0].split('#')[0];
            const filename = cleanUrl.split('/').filter(Boolean).pop();
            if (filename) {
              const matched = candidate.assets?.find(
                a => a.name.toLowerCase() === filename.toLowerCase(),
              );
              if (matched) {
                binaryAsset = matched;
                signature = platformInfo.signature ?? '';
              }
            }
          }
        }
      } catch {
        // Fall back to heuristic discovery
      }
    }

    // 2. Fall back to heuristic discovery of release assets
    if (!binaryAsset) {
      const matched = findReleaseAssets(candidate.assets ?? [], target);
      binaryAsset = matched.binaryAsset;
      if (matched.sigAsset) {
        signature = await provider.getAssetSignature(matched.sigAsset);
      }
    }

    if (!binaryAsset) {
      return res.status(404).send(`Release asset not found for target platform '${target}'`);
    }

    if (!signature) {
      const sigAsset = candidate.assets?.find(
        a => a.name.toLowerCase() === `${binaryAsset.name.toLowerCase()}.sig`,
      );
      if (sigAsset) {
        signature = await provider.getAssetSignature(sigAsset);
      }
    }

    const protocolHeader = req.headers['x-forwarded-proto'];
    const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host;

    const protocol = Array.isArray(protocolHeader)
      ? protocolHeader[0]
      : (protocolHeader ?? DEFAULT_PROTOCOL);
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

    const tauriUpdateResponse: TauriUpdateResponse = {
      version: candidateVersion,
      pub_date: candidate.publishedAt ?? '',
      notes: candidate.body,
      platforms: {
        [target]: {
          url: `${protocol}://${host}/download?asset_id=${encodeURIComponent(binaryAsset.id)}`,
          signature,
        },
      },
    };

    res.setHeader('Vary', 'Origin, X-Update-Channel');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(tauriUpdateResponse);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}
