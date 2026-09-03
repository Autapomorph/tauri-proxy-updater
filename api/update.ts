import type { VercelRequest, VercelResponse } from '@vercel/node';

import { REPO_API_URL, getGitHubHeaders } from '../lib/github.js';

interface GitHubAsset {
  id: number;
  name: string;
  url: string;
}

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  body: string;
  assets?: GitHubAsset[];
}

interface TauriUpdateResponse {
  version: string;
  pub_date: string;
  notes: string;
  platforms: {
    [key: string]: {
      url: string;
      signature: string;
    };
  };
}

interface MatchedAssets {
  binaryAsset: GitHubAsset | null;
  sigAsset: GitHubAsset | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const target = Array.isArray(req.query.target) ? req.query.target[0] : req.query.target;
  const version = Array.isArray(req.query.version) ? req.query.version[0] : req.query.version;

  if (!target || !version) {
    return res.status(400).send('Missing target or version parameters');
  }

  try {
    const headers = getGitHubHeaders({ Accept: 'application/vnd.github+json' });

    const wantPrerelease =
      req.query.beta === 'true' ||
      req.headers['x-prerelease-updates'] === 'true' ||
      req.headers['x-prerelease-enabled'] === 'true';

    const apiUrl = wantPrerelease ? `${REPO_API_URL}/releases` : `${REPO_API_URL}/releases/latest`;

    const ghResponse = await fetch(apiUrl, { headers });

    if (!ghResponse.ok) {
      return res.status(502).send('Error fetching release from GitHub');
    }

    let release: GitHubRelease;

    if (wantPrerelease) {
      const releases = (await ghResponse.json()) as GitHubRelease[];

      if (!Array.isArray(releases) || releases.length === 0) {
        return res.status(404).send('No releases found on GitHub');
      }

      release = releases[0];
    } else {
      release = (await ghResponse.json()) as GitHubRelease;
    }

    const latestVersion = release.tag_name.replace(/^v/, '');

    // If update is not required
    if (latestVersion === version) {
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(204).end();
    }

    const { binaryAsset, sigAsset } = findReleaseAssets(release.assets || [], target);

    if (!binaryAsset) {
      return res.status(404).send(`Release asset not found for target platform '${target}'`);
    }

    let signature = '';
    if (sigAsset) {
      const sigResponse = await fetch(sigAsset.url, {
        headers: getGitHubHeaders({ Accept: 'application/octet-stream' }),
      });

      if (sigResponse.ok) {
        signature = (await sigResponse.text()).trim();
      }
    }

    const protocolHeader = req.headers['x-forwarded-proto'];
    const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;

    const protocol = Array.isArray(protocolHeader) ? protocolHeader[0] : protocolHeader || 'https';
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

    const tauriUpdateResponse: TauriUpdateResponse = {
      version: latestVersion,
      pub_date: release.published_at,
      notes: release.body,
      platforms: {
        [target]: {
          url: `${protocol}://${host}/download?asset_id=${binaryAsset.id}`,
          signature: signature,
        },
      },
    };

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(tauriUpdateResponse);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return res.status(500).send(message);
  }
}

function findReleaseAssets(assets: GitHubAsset[], target: string): MatchedAssets {
  const targetLower = target.toLowerCase();
  const isArm =
    targetLower.includes('aarch64') || targetLower.includes('arm64') || targetLower.includes('arm');
  const isX64 =
    targetLower.includes('x86_64') || targetLower.includes('x64') || targetLower.includes('amd64');
  const isX86 =
    targetLower.includes('i686') || targetLower.includes('x86') || targetLower.includes('32');

  const matchesArch = (name: string): boolean => {
    const nameLower = name.toLowerCase();

    if (isArm) {
      return (
        nameLower.includes('arm64') || nameLower.includes('aarch64') || nameLower.includes('arm')
      );
    }

    if (isX64) {
      return (
        (nameLower.includes('x64') ||
          nameLower.includes('x86_64') ||
          nameLower.includes('amd64')) &&
        !nameLower.includes('arm64') &&
        !nameLower.includes('aarch64')
      );
    }

    if (isX86) {
      return (
        (nameLower.includes('x86') || nameLower.includes('i686') || nameLower.includes('32')) &&
        !nameLower.includes('x86_64') &&
        !nameLower.includes('arm64')
      );
    }

    return true;
  };

  let binaryAsset: GitHubAsset | undefined;

  if (targetLower.includes('linux')) {
    const linuxAssets = assets.filter(
      a =>
        (a.name.endsWith('.AppImage.tar.gz') ||
          a.name.endsWith('.tar.gz') ||
          a.name.endsWith('.AppImage') ||
          a.name.endsWith('.deb')) &&
        !a.name.endsWith('.sig'),
    );

    binaryAsset = linuxAssets.find(a => matchesArch(a.name)) || linuxAssets[0];
  } else if (targetLower.includes('windows') || targetLower.includes('win')) {
    const winAssets = assets.filter(
      a =>
        (a.name.endsWith('.exe') || a.name.endsWith('.msi') || a.name.endsWith('.zip')) &&
        !a.name.endsWith('.sig'),
    );

    binaryAsset = winAssets.find(a => matchesArch(a.name)) || winAssets[0];
  } else if (targetLower.includes('darwin') || targetLower.includes('mac')) {
    const macAssets = assets.filter(
      a =>
        (a.name.endsWith('.app.tar.gz') ||
          a.name.endsWith('.dmg') ||
          a.name.endsWith('.tar.gz') ||
          a.name.endsWith('.gz')) &&
        !a.name.endsWith('.sig'),
    );

    binaryAsset = macAssets.find(a => matchesArch(a.name)) || macAssets[0];
  } else {
    const allCandidates = assets.filter(
      a =>
        (a.name.endsWith('.exe') ||
          a.name.endsWith('.AppImage.tar.gz') ||
          a.name.endsWith('.app.tar.gz')) &&
        !a.name.endsWith('.sig'),
    );

    binaryAsset = allCandidates.find(a => matchesArch(a.name)) || allCandidates[0];
  }

  if (!binaryAsset) {
    return { binaryAsset: null, sigAsset: null };
  }

  const sigAsset = assets.find(a => a.name === `${binaryAsset.name}.sig`) || null;

  return { binaryAsset, sigAsset };
}
