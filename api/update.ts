import type { VercelRequest, VercelResponse } from '@vercel/node';
import semver from 'semver';

import { getProvider } from '../lib/providers/index.js';
import { compareSemver, isStableVersion } from '../lib/semver.js';
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

    // Filter out drafts and invalid tags
    const eligibleReleases = releases.filter(r => {
      if (r.draft) {
        return false;
      }

      const releaseVer = r.tag_name.replace(/^v/, '').trim();
      const parsed = semver.valid(releaseVer);
      if (!parsed) {
        return false;
      }

      // If client does not want pre-releases, exclude both provider prerelease flag and pre-release tag identifiers
      if (!wantPrerelease) {
        const isPre = Boolean(r.prerelease) || !isStableVersion(releaseVer);
        if (isPre) {
          return false;
        }
      }

      return true;
    });

    if (eligibleReleases.length === 0) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(204).end();
    }

    // Sort strictly by SemVer 2.0 descending
    eligibleReleases.sort((a, b) => compareSemver(a.tag_name, b.tag_name));

    const candidate = eligibleReleases[0];
    const candidateVersion = candidate.tag_name.replace(/^v/, '').trim();

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

    const { binaryAsset, sigAsset } = findReleaseAssets(candidate.assets ?? [], target);

    if (!binaryAsset) {
      return res.status(404).send(`Release asset not found for target platform '${target}'`);
    }

    let signature = '';
    if (sigAsset) {
      signature = await provider.getAssetSignature(sigAsset);
    }

    const protocolHeader = req.headers['x-forwarded-proto'];
    const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host;

    const protocol = Array.isArray(protocolHeader)
      ? protocolHeader[0]
      : (protocolHeader ?? DEFAULT_PROTOCOL);
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

    const tauriUpdateResponse: TauriUpdateResponse = {
      version: candidateVersion,
      pub_date: candidate.published_at ?? '',
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
