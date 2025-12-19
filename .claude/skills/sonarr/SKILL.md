---
name: sonarr
description: Search and add TV series to a Sonarr instance. Use when user wants to search for TV shows, add series to their library, or manage their Sonarr media server. Triggers on phrases like "search for show", "add series to sonarr", "find TV show", or any Sonarr-related series management request.
---

# Sonarr Series Management

Manage TV series on a Sonarr instance via its API.

## Configuration

Requires from user:
- `SONARR_URL` - Base URL (e.g., `https://sonarr.example.com`)
- `SONARR_API_KEY` - API key from Sonarr Settings > General

Check env to see if they're already defined.

## Workflow

### 1. Search for a Series

```bash
curl -s "${SONARR_URL}/api/v3/series/lookup?term=${QUERY}" \
  -H "X-Api-Key: ${SONARR_API_KEY}" | jq '[.[] | {title, year, tvdbId, overview: .overview[0:100]}]'
```

### 2. Get Available Options (before adding)

```bash
# Quality profiles
curl -s "${SONARR_URL}/api/v3/qualityprofile" -H "X-Api-Key: ${SONARR_API_KEY}" | jq '[.[] | {id, name}]'

# Root folders
curl -s "${SONARR_URL}/api/v3/rootfolder" -H "X-Api-Key: ${SONARR_API_KEY}" | jq '[.[] | {id, path}]'
```

### 3. Add a Series

```bash
curl -s -X POST "${SONARR_URL}/api/v3/series" \
  -H "X-Api-Key: ${SONARR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"tvdbId":TVDB_ID,"title":"SERIES_TITLE","qualityProfileId":QUALITY_ID,"rootFolderPath":"ROOT_PATH","monitored":true,"seasonFolder":true,"addOptions":{"searchForMissingEpisodes":true}}'
```

**Required fields:**
- `tvdbId` - from search results
- `title` - series title
- `qualityProfileId` - from quality profiles endpoint
- `rootFolderPath` - from root folders endpoint

**Optional fields:**
- `monitored` - defaults to false
- `seasonFolder` - organize by season folders (recommended: true)
- `addOptions.searchForMissingEpisodes` - trigger immediate search

## API Reference

See [references/api_reference.md](references/api_reference.md) for full endpoint details.
