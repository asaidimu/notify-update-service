import * as core from '@actions/core';
import * as github from '@actions/github';

interface Asset {
  name: string;
  platform: string;
  architecture: string;
}

interface ReleaseRequest {
  name: string;
  version: string;
  repository: string;
  assets: Asset[];
  changelog: string;
}

interface TokenResponse {
  token: string;
}

interface ReleaseResponse {
  status: string;
  message: string;
}

// Map filename patterns to platform and architecture
const defaultAssetPatterns: { [key: string]: Omit<Asset, "name"> } = {
  'linux-amd64': { platform: 'linux', architecture: 'amd64' },
  'linux-x86_64': { platform: 'linux', architecture: 'amd64' },
  'linux-arm64': { platform: 'linux', architecture: 'arm64' },
  'windows-amd64': { platform: 'windows', architecture: 'amd64' },
  'windows-x86': { platform: 'windows', architecture: 'x86' },
  'darwin-amd64': { platform: 'darwin', architecture: 'amd64' },
  'darwin-arm64': { platform: 'darwin', architecture: 'arm64' },
};

async function run(): Promise<void> {
  try {
    // Get inputs
    const serverUrl = core.getInput('server');
    const apiKey = core.getInput('key');
    const appName = core.getInput('app') || github.context.repo.repo;
    let assetMappings: { [key: string]: { platform: string; architecture: string } } = {};
    try {
      assetMappings = JSON.parse(core.getInput('assets') || '{}');
    } catch (error) {
      core.setFailed(`Invalid assets JSON: ${(error as Error).message}`);
      return;
    }

    // Get release data
    const release = github.context.payload.release;
    if (!release) {
      core.setFailed('No release data found in event payload');
      return;
    }

    const version = release.tag_name.replace(/^v/, ''); // Strip 'v' prefix
    const repository = github.context.payload.repository?.html_url;
    const changelog = release.body || '';

    if (!repository) {
      core.setFailed('Repository URL not found in event payload');
      return;
    }

    // Process assets
    const assets: Asset[] = [];
    for (const asset of release.assets) {
      let platform: string | undefined;
      let architecture: string | undefined;

      // Check asset-mappings first
      if (assetMappings[asset.name]) {
        platform = assetMappings[asset.name].platform;
        architecture = assetMappings[asset.name].architecture;
      } else {
        // Infer from filename
        for (const [pattern, meta] of Object.entries(defaultAssetPatterns)) {
          if (asset.name.toLowerCase().includes(pattern)) {
            platform = meta.platform;
            architecture = meta.architecture;
            break;
          }
        }
      }

      if (!platform || !architecture) {
        core.warning(`Skipping asset ${asset.name}: unknown platform or architecture`);
        continue;
      }

      assets.push({
        name: asset.name,
        platform,
        architecture,
      });
    }

    if (assets.length === 0) {
      core.setFailed('No valid assets found in release');
      return;
    }

    // Build ReleaseRequest
    const request: ReleaseRequest = {
      name: appName,
      version,
      repository,
      assets,
      changelog,
    };

    // Get JWT
    core.debug('Requesting JWT from update service');
    const tokenResponse = await fetch(`${serverUrl}/api/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      core.setFailed(`Failed to obtain JWT: HTTP ${tokenResponse.status} - ${errorText}`);
      return;
    }

    const tokenData: TokenResponse = await tokenResponse.json();
    const token = tokenData.token;
    if (!token) {
      core.setFailed('No token returned from auth endpoint');
      return;
    }

    // Notify update service
    core.debug(`Notifying update service at ${serverUrl}/api/release`);
    const releaseResponse = await fetch(`${serverUrl}/api/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });

    if (!releaseResponse.ok) {
      const errorText = await releaseResponse.text();
      core.setFailed(`Update service failed: HTTP ${releaseResponse.status} - ${errorText}`);
      return;
    }

    const releaseData: ReleaseResponse = await releaseResponse.json();
    if (releaseData.status !== 'success') {
      core.setFailed(`Update service failed: ${releaseData.message}`);
      return;
    }

    core.info('Successfully notified update service');
    core.info(`Message: ${releaseData.message}`);

  } catch (error) {
    core.setFailed(`Unexpected error: ${(error as Error).message}`);
  }
}

run();
