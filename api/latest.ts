import type { VercelRequest, VercelResponse } from '@vercel/node';

import { getManifestPath, MANIFEST_SOURCE, REPO_BRANCH } from '../lib/config/index.js';
import { getProvider } from '../lib/providers/index.js';
import { getEligibleReleases } from '../lib/semver.js';

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

  const isStable = fileName === DEFAULT_MANIFEST_FILE || fileName === 'latest.stable.json';
  const wantPrerelease = !isStable;

  try {
    const provider = getProvider();
    let content: string | null = null;

    // 1. Try resolving manifest from release assets (if MANIFEST_SOURCE is 'auto' or 'releases')
    if (MANIFEST_SOURCE !== 'repo') {
      try {
        const releases = await provider.getReleases();
        if (Array.isArray(releases) && releases.length > 0) {
          const eligibleReleases = getEligibleReleases(releases, { wantPrerelease });

          let targetAsset;

          // Find the highest SemVer release that contains the requested manifest asset
          for (const release of eligibleReleases) {
            const asset = release.assets.find(a => a.name.toLowerCase() === fileName.toLowerCase());

            if (asset) {
              targetAsset = asset;
              break;
            }
          }

          // Fallback to default latest.json in releases if channel-specific manifest was not found
          if (!targetAsset && fileName !== DEFAULT_MANIFEST_FILE) {
            for (const release of eligibleReleases) {
              const defaultAsset = release.assets.find(
                a => a.name.toLowerCase() === DEFAULT_MANIFEST_FILE,
              );

              if (defaultAsset) {
                targetAsset = defaultAsset;
                break;
              }
            }
          }

          if (targetAsset) {
            content = await provider.getAssetSignature(targetAsset);
          }
        }
      } catch (err: unknown) {
        if (MANIFEST_SOURCE === 'releases') {
          throw err;
        }
      }
    }

    // 2. Fallback to repository files (if MANIFEST_SOURCE is 'auto' or 'repo')
    if (!content && MANIFEST_SOURCE !== 'releases') {
      const manifestPath = getManifestPath(fileName);
      content = await provider.getRawFile(manifestPath, REPO_BRANCH);

      // Fallback to default latest.json if channel-specific manifest is not found in repo
      if (!content && fileName !== DEFAULT_MANIFEST_FILE) {
        content = await provider.getRawFile(getManifestPath(DEFAULT_MANIFEST_FILE), REPO_BRANCH);
      }
    }

    if (!content) {
      return res.status(502).send(`Error fetching manifest '${fileName}' from provider`);
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
