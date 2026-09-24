# Tauri Updater Proxy

A high-performance, multi-provider auto-updater and release notes proxy server for Tauri v2 applications. It allows you to securely distribute updates and release notes from private or public repositories across all major Git hosting platforms.

Supported platforms include **GitHub** (Cloud & Enterprise Server), **GitLab** (Cloud & Self-Managed), **Gitea / Forgejo / Codeberg**, **GitVerse**, **GitFlic**, **Bitbucket Cloud**, **Azure DevOps**, and **OneDev**.

It shields your access tokens from end-users, streams installer downloads, handles multi-channel releases (`stable` and `prerelease`), and serves markdown/MDX release notes.

---

## Features

- **Multi-Provider Support:** First-class support for GitHub, GitLab, Gitea, Forgejo, Codeberg, GitVerse, GitFlic, Bitbucket, Azure DevOps, and OneDev (including self-hosted/enterprise instances).
- **Token Security:** Hides credentials from client apps; end-users never see or need API tokens.
- **Dynamic Updates:** Natively compatible with `@tauri-apps/plugin-updater` v2 format.
- **Multi-Channel Releases:** Segregates `stable` and `prerelease` (beta/alpha) channels.
- **Flexible Channel Selection:** Supports channel selection via HTTP header or query parameter, with well-defined priority.
- **Binary Streaming:** Efficiently proxies binary downloads (`.exe`, `.zip`, `.sig`, `.dmg`, etc.) directly from release assets without memory bloat.
- **Static Manifest Support:** Serves `latest.json`, `latest.stable.json`, and `latest.prerelease.json` manifests directly from the repository with automated fallbacks.
- **Rich Release Notes System:** Serves dedicated version release notes written in Markdown or MDX (`release-notes/<version>.mdx`), with full YAML frontmatter parsing (`title`, `date`, `tags`), falling back to provider release notes when needed.
- **Full Customization:** Configurable target repository branch (`REPO_BRANCH`) and release notes folder (`RELEASE_NOTES_DIR`).

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

Securely proxies the release binary asset download from the Git provider.

- **Query Parameters:**
  - `asset_id` — Provider release asset identifier.
- **Response:**
  - Streams or redirects to the file with `Content-Type: application/octet-stream` and proper `Content-Disposition`.

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
  2. If not found, falls back to the body of the corresponding provider release/tag.
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

---

## Environment Variables

Configure these variables in your deployment environment (e.g. Vercel Project Settings):

| Variable            | Required |     Default     | Description                                                                                                                                                                          |
| :------------------ | :------: | :-------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GIT_PROVIDER`      |    No    |    `github`     | Git provider: `github`, `gitlab`, `gitea`, `gitverse`, `gitflic`, `bitbucket`, `azure_devops`, or `onedev`.                                                                          |
| `GIT_TOKEN`         | **Yes**  |        —        | Personal Access Token with repository read access.                                                                                                                                   |
| `REPO_OWNER`        | **Yes**  |        —        | Repository owner / group / organization. For Azure DevOps: `org` or `org/project`.                                                                                                   |
| `REPO_NAME`         | **Yes**  |        —        | Repository / project name.                                                                                                                                                           |
| `GIT_API_URL`       |    No    |        —        | Custom API Base URL for self-hosted instances (e.g. `https://gitlab.mycompany.com/api/v4`, `https://github.corp.com/api/v3`, `https://codeberg.org/api/v1`). Auto-detected if empty. |
| `REPO_BRANCH`       |    No    |     `main`      | Target repository branch for fetching manifests (`latest*.json`) and release notes.                                                                                                  |
| `RELEASE_NOTES_DIR` |    No    | `release-notes` | Target directory in repository where release notes (`.md` / `.mdx`) are located.                                                                                                     |

---

## Provider Setup Examples

### 1. GitHub (Default)

```bash
GIT_PROVIDER=github
GIT_TOKEN=ghp_yourPersonalAccessTokenHere
REPO_OWNER=my-org
REPO_NAME=my-app
```

_For GitHub Enterprise Server:_ set `GIT_API_URL=https://github.mycompany.com/api/v3`.

### 2. GitLab (Cloud or Self-Managed)

```bash
GIT_PROVIDER=gitlab
GIT_TOKEN=glpat-yourPersonalAccessTokenHere
REPO_OWNER=my-group
REPO_NAME=my-app
```

_For GitLab Self-Managed:_ set `GIT_API_URL=https://gitlab.mycompany.com/api/v4`.

### 3. Gitea / Forgejo / Codeberg

```bash
GIT_PROVIDER=gitea
GIT_TOKEN=your_gitea_token
REPO_OWNER=my-org
REPO_NAME=my-app
GIT_API_URL=https://codeberg.org/api/v1  # or https://gitea.mycompany.com/api/v1
```

### 4. GitVerse (Сбер / СберТех)

```bash
GIT_PROVIDER=gitverse
GIT_TOKEN=your_gitverse_token
REPO_OWNER=my-org
REPO_NAME=my-app
```

_Pre-configured with `https://gitverse.ru/api/v1`._

### 5. GitFlic (ГК «Астра» / Ресолют)

```bash
GIT_PROVIDER=gitflic
GIT_TOKEN=your_gitflic_token
REPO_OWNER=my-alias
REPO_NAME=my-project
```

_Pre-configured with `https://api.gitflic.ru` (set `GIT_API_URL` for self-hosted GitFlic Enterprise)._

### 6. Bitbucket Cloud

```bash
GIT_PROVIDER=bitbucket
GIT_TOKEN=your_app_password_or_token  # For Basic auth: username:app_password
REPO_OWNER=my-workspace
REPO_NAME=my-repo
```

### 7. Azure DevOps

```bash
GIT_PROVIDER=azure_devops
GIT_TOKEN=your_azure_personal_access_token
REPO_OWNER=my-organization/my-project
REPO_NAME=my-repo
```

### 8. OneDev

```bash
GIT_PROVIDER=onedev
GIT_TOKEN=your_onedev_access_token
REPO_OWNER=my-group
REPO_NAME=my-project
GIT_API_URL=https://code.onedev.io/~api  # or https://onedev.mycompany.com/~api
```

---

## Deployment to Vercel

1. Create a Git repository (e.g. `tauri-proxy-updater`) and push this project.
2. Log in to [Vercel](https://vercel.com/) and click **Add New -> Project**.
3. Select your repository, leave **Framework Preset** as **Other**, and click **Deploy**.
4. In the Vercel Dashboard, go to **Settings -> Environment Variables** and add your provider configuration (e.g. `GIT_PROVIDER`, `GIT_TOKEN`, `REPO_OWNER`, `REPO_NAME`).
5. Redeploy the latest deployment to apply the environment variables.

---

## Configuring Tauri Application

In your Tauri project's `tauri.conf.json`, specify your proxy endpoint:

```json
"plugins": {
  "updater": {
    "pubkey": "<your-tauri-pubkey>",
    "endpoints": [
      "https://your-proxy.vercel.app/update/{{target}}-{{arch}}/{{current_version}}"
    ]
  }
}
```
