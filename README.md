# Tauri Updater Proxy

A high-performance auto-updater and release notes proxy server for Tauri v2 applications, designed to securely distribute updates and release notes from private or public GitHub repositories.

It shields your `GITHUB_TOKEN` from end-users, streams installer downloads, handles multi-channel releases (`stable` and `prerelease`), and serves markdown/MDX release notes.

---

## Features

- **Token Security:** Hides GitHub credentials from client apps; end-users never see or need API tokens.
- **Dynamic Updates:** Natively compatible with `@tauri-apps/plugin-updater` v2 format.
- **Multi-Channel Releases:** Segregates `stable` and `prerelease` (beta/alpha) channels.
- **Flexible Channel Selection:** Supports channel selection via HTTP header or query parameter, with well-defined priority.
- **Binary Streaming:** Efficiently proxies binary downloads (`.exe`, `.zip`, `.sig`, `.dmg`, etc.) directly from GitHub release assets without memory bloat.
- **Static Manifest Support:** Serves `latest.json`, `latest.stable.json`, and `latest.prerelease.json` manifests directly from the repository with automated fallbacks.
- **Rich Release Notes System:** Serves dedicated version release notes written in Markdown or MDX (`release-notes/<version>.mdx`), with full YAML frontmatter parsing (`title`, `date`, `tags`), falling back to GitHub release notes when needed.
- **Branch & Directory Customization:** Configurable target repository branch (`REPO_BRANCH`) and release notes folder (`RELEASE_NOTES_DIR`).

---

## API Endpoints Reference

### 1. Check for Updates

```http
GET /update/:target/:version
```

Primary endpoint for the Tauri updater client.

- **Route Parameters:**
  - `:target` — Target platform identifier (e.g. `windows-x86_64`, `windows-aarch64`, `darwin-aarch64`, `linux-x86_64`).
  - `:version` — Currently installed client version (e.g. `1.3.1`, `1.4.0-beta.1`).
- **Channel Selection:** via `?channel=` query parameter or `X-Update-Channel` header.
- **Responses:**
  - `204 No Content`: The client is already running the latest version.
  - `200 OK`: A new version is available. Returns Tauri-compliant update metadata with direct download links pointing to `/download?asset_id=...`.

---

### 2. Download Release Asset

```http
GET /download?asset_id=:id
```

Securely proxies the release binary asset download from GitHub.

- **Query Parameters:**
  - `asset_id` — GitHub release asset ID.
- **Response:**
  - Streams the file with `Content-Type: application/octet-stream` and proper `Content-Disposition`.

---

### 3. Static Manifests

```http
GET /latest.json
GET /latest.:channel.json
```

Serves static release manifests directly from the repository (`latest.json`, `latest.stable.json`, `latest.prerelease.json`).

- **Channel Selection:** via filename (e.g. `/latest.prerelease.json`), `?channel=` query parameter, or `X-Update-Channel` header.
- **Fallback:** If a channel-specific file is not present in the repository, automatically falls back to `latest.json`.

---

### 4. Version Release Notes (Rich Markdown / MDX)

```http
GET /release-notes/:version
GET /changelogs/:version    (alias for backward compatibility)
```

Fetches the release notes for a specific version.

- **Route Parameters:**
  - `:version` — Version string (e.g. `1.3.1`, `v1.3.1`, `1.4.0-beta.1`).
- **Resolution Strategy:**
  1. Searches for `<RELEASE_NOTES_DIR>/<version>.mdx` (or `.md`) on `REPO_BRANCH` (defaults to `release-notes/<version>.mdx`).
  2. If not found, falls back to the body of the corresponding GitHub release tag.
- **Response Example:**
  ```json
  {
    "version": "1.3.1",
    "released_at": "2026-09-21T18:23:25Z",
    "tags": ["feature", "fix"],
    "notes": "Full markdown content with frontmatter stripped"
  }
  ```

---

### 5. Release Notes Index (List Versions)

```http
GET /release-notes
GET /changelogs    (alias for backward compatibility)
```

Returns an array of all available versions that have release notes files in `<RELEASE_NOTES_DIR>`.

- **Channel Selection:** Pass `?channel=stable` or header `X-Update-Channel: stable` to filter out pre-release versions.
- **Response Example:**
  ```json
  {
    "versions": ["1.4.0-beta.2", "1.4.0-beta.1", "1.3.1", "1.3.0"]
  }
  ```
  _(Sorted descending according to SemVer 2.0)_.

---

## Update Channels & Precedence

Channel names are **fully arbitrary strings** (e.g. `stable`, `prerelease`, `alpha`, `beta`, `nightly`, `canary`, `preview`, `dev`) and are not restricted to a fixed set:

- **`stable`** _(reserved keyword, default)_: Exclusively serves official, non-prerelease releases. Any release marked as draft or pre-release is filtered out.
- **Any other channel name** (e.g. `prerelease`, `alpha`, `beta`, `nightly`, `canary`, etc.):
  - In **`/update/:target/:version`**: Activates pre-release eligibility, serving pre-release builds if newer than the client version. If a newer final stable release is published, pre-release clients also receive it.
  - In **`/latest.json`**: Dynamically looks for `latest.<channel>.json` in the repository (e.g. `channel=nightly` looks for `latest.nightly.json`, `channel=alpha` looks for `latest.alpha.json`), automatically falling back to `latest.json` if the channel file does not exist.

### Priority / Precedence Rules

When determining the release channel, the server applies the following priority order:

$$\text{Query Parameter}\; (\texttt{?channel=}) \quad \mathbf{>} \quad \text{HTTP Header}\; (\texttt{X-Update-Channel}) \quad \mathbf{>} \quad \text{Default}\; (\texttt{stable})$$

1. **Query Parameter (`?channel=...`)**: Takes highest precedence. Useful for manual testing, browser links, and direct overrides.
2. **HTTP Header (`X-Update-Channel: ...`)**: Used by automated client libraries (like Tauri v2 `check({ headers })`).
3. **Default (`stable`)**: Used when neither the query parameter nor the header is provided.

### Usage in Tauri v2

Pass the `headers` option to `check()` in `@tauri-apps/plugin-updater`:

```typescript
import { check } from '@tauri-apps/plugin-updater';

// Check for stable updates (default)
const update = await check({
  headers: {
    'X-Update-Channel': 'stable',
  },
});

// Check for pre-release / beta updates
const betaUpdate = await check({
  headers: {
    'X-Update-Channel': 'prerelease',
  },
});
```

### Manual Testing with curl

```bash
# Using HTTP header:
curl -H "X-Update-Channel: prerelease" "https://your-proxy.vercel.app/update/windows-x86_64/1.3.1"

# Using query parameter (overrides header):
curl "https://your-proxy.vercel.app/update/windows-x86_64/1.3.1?channel=prerelease"
```

---

## Environment Variables

Configure these variables in your deployment environment (e.g. Vercel Project Settings):

| Variable            | Required |     Default     | Description                                                                              |
| :------------------ | :------: | :-------------: | :--------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`      | **Yes**  |        —        | GitHub Personal Access Token (Classic with `repo` or fine-grained with `contents:read`). |
| `GITHUB_OWNER`      | **Yes**  |        —        | GitHub repository owner (username or organization).                                      |
| `GITHUB_REPO`       | **Yes**  |        —        | GitHub repository name.                                                                  |
| `REPO_BRANCH`       |    No    |     `main`      | Target repository branch for fetching manifests (`latest*.json`) and release notes.      |
| `RELEASE_NOTES_DIR` |    No    | `release-notes` | Target directory in repository where release notes (`.md` / `.mdx`) are located.         |

---

## Deployment to Vercel

1. Create a GitHub repository (e.g. `tauri-proxy-updater`) and push this project.
2. Log in to [Vercel](https://vercel.com/) and click **Add New -> Project**.
3. Select your repository, leave **Framework Preset** as **Other**, and click **Deploy**.
4. In the Vercel Dashboard, go to **Settings -> Environment Variables** and add `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, and optionally `REPO_BRANCH`, `RELEASE_NOTES_DIR`.
5. Redeploy the latest deployment to apply the environment variables.

---

## Configuring Tauri Application

In your Tauri project's `tauri.conf.json`, specify your proxy endpoint:

```json
"plugins": {
  "updater": {
    "pubkey": "<your-tauri-pubkey>",
    "endpoints": [
      "https://your-proxy.vercel.app/update/{{target}}-{{arch}}/{{current_version}}",
      "https://raw.githubusercontent.com/<owner>/<repo>/main/latest.json"
    ]
  }
}
```
