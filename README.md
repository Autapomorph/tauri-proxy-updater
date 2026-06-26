# Tauri Updater Proxy

This is an auto-updater proxy server for Tauri applications.

It allows the application to securely check and download updates by hiding your `GITHUB_TOKEN` from end-users.

## How to Deploy to Vercel

### Step 1. Create a GitHub Repository

1. Go to GitHub and create a new repository (it can be private or public, as this proxy code contains no secrets), for example, `tauri-proxy-updater`.
2. Link this local project to your new repository and push it:
   ```bash
   git remote add origin <your-new-repository-url>
   git branch -M main
   git push -u origin main
   ```

### Step 2. Import the Project into Vercel

1. Log in to [Vercel](https://vercel.com/).
2. Click **Add New -> Project**.
3. Select the `tauri-proxy-updater` repository from the list.
4. Leave **Framework Preset** as **Other**.
5. Click **Deploy**.

### Step 3. Add Environment Variables

The proxy server needs environment variables to connect to your private repository.

1. Generate a token on GitHub: [GitHub Developer Settings](https://github.com/settings/tokens) (type: Classic token, with `repo` or `contents: read` scopes).
2. In the Vercel project dashboard, navigate to **Settings -> Environment Variables**.
3. Add the following three variables:
   - **Key**: `GITHUB_TOKEN` | **Value**: `<your_personal_access_token>`
   - **Key**: `GITHUB_OWNER` | **Value**: `<your_github_username_or_org>`
   - **Key**: `GITHUB_REPO` | **Value**: `<your_repository_name>`
4. Go to the **Deployments** tab, click the three dots next to your latest deployment, and select **Redeploy** to apply the environment variables.

### Step 4. Configure your Tauri Application

Once deployed, Vercel will provide you with a unique domain (e.g., `https://your-proxy-domain.vercel.app`).
Specify this URL in your Tauri app's `tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "...",
    "endpoints": [
      "https://your-proxy-domain.vercel.app/update/{{target}}-{{arch}}/{{current_version}}"
    ]
  }
}
```
