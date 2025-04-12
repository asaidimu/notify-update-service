# Notify Update Service

A GitHub Action to notify the Secure Update Service of new GitHub releases, mapping each asset to its platform and architecture.

## Inputs

- `server`: URL of the update service (default: `http://localhost:8080`).
- `key`: API key for authentication (required, use secrets).
- `app`: Application identifier (defaults to repository name).
- `assets`: JSON mapping asset names to platform and architecture (e.g., `{"file":"platform":"linux","architecture":"amd64"}}`).

## Example

```yaml
name: Notify Update Service

on:
  release:
    types: [published]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: asaidimu/notify-update-service@v1
        with:
          server: https://update.example.com
          key: ${{ secrets.UPDATE_SERVICE_API_KEY }}
          app: cybersuite
          assets: |
            {
              "cybersuite-linux": {"platform": "linux", "architecture": "amd64"},
              "cybersuite-win.exe": {"platform": "windows", "architecture": "x86"}
            }
