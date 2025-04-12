"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
// Map filename patterns to platform and architecture
const defaultAssetPatterns = {
    'linux-amd64': { platform: 'linux', architecture: 'amd64' },
    'linux-x86_64': { platform: 'linux', architecture: 'amd64' },
    'linux-arm64': { platform: 'linux', architecture: 'arm64' },
    'windows-amd64': { platform: 'windows', architecture: 'amd64' },
    'windows-x86': { platform: 'windows', architecture: 'x86' },
    'darwin-amd64': { platform: 'darwin', architecture: 'amd64' },
    'darwin-arm64': { platform: 'darwin', architecture: 'arm64' },
};
async function run() {
    var _a;
    try {
        // Get inputs
        const serverUrl = core.getInput('server');
        const apiKey = core.getInput('key');
        const appName = core.getInput('app') || github.context.repo.repo;
        let assetMappings = {};
        try {
            assetMappings = JSON.parse(core.getInput('assets') || '{}');
        }
        catch (error) {
            core.setFailed(`Invalid assets JSON: ${error.message}`);
            return;
        }
        // Get release data
        const release = github.context.payload.release;
        if (!release) {
            core.setFailed('No release data found in event payload');
            return;
        }
        const version = release.tag_name.replace(/^v/, ''); // Strip 'v' prefix
        const repository = (_a = github.context.payload.repository) === null || _a === void 0 ? void 0 : _a.html_url;
        const changelog = release.body || '';
        if (!repository) {
            core.setFailed('Repository URL not found in event payload');
            return;
        }
        // Process assets
        const assets = [];
        for (const asset of release.assets) {
            let platform;
            let architecture;
            // Check asset-mappings first
            if (assetMappings[asset.name]) {
                platform = assetMappings[asset.name].platform;
                architecture = assetMappings[asset.name].architecture;
            }
            else {
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
        const request = {
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
        const tokenData = await tokenResponse.json();
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
        const releaseData = await releaseResponse.json();
        if (releaseData.status !== 'success') {
            core.setFailed(`Update service failed: ${releaseData.message}`);
            return;
        }
        core.info('Successfully notified update service');
        core.info(`Message: ${releaseData.message}`);
    }
    catch (error) {
        core.setFailed(`Unexpected error: ${error.message}`);
    }
}
run();
