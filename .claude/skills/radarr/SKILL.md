---
name: radarr
description: Search and add movies to a Radarr instance. Use when user wants to search for movies, add movies to their library, or manage their Radarr media server. Triggers on phrases like "search for movie", "add movie to radarr", "find movie", or any Radarr-related movie management request.
---

# Radarr Movie Management

Manage movies on a Radarr instance via its API.

## Configuration

Requires from user:
- `RADARR_URL` - Base URL (e.g., `https://radarr.example.com`)
- `RADARR_API_KEY` - API key from Radarr Settings > General

Check env to see if they're already defined. 

## Workflow

### 1. Search for a Movie

```bash
curl -s "${RADARR_URL}/api/v3/movie/lookup?term=${QUERY}" \
  -H "X-Api-Key: ${RADARR_API_KEY}" | jq '[.[] | {title, year, tmdbId, overview: .overview[0:100]}]'
```

### 2. Get Available Options (before adding)

```bash
# Quality profiles
curl -s "${RADARR_URL}/api/v3/qualityprofile" -H "X-Api-Key: ${RADARR_API_KEY}" | jq '[.[] | {id, name}]'

# Root folders
curl -s "${RADARR_URL}/api/v3/rootfolder" -H "X-Api-Key: ${RADARR_API_KEY}" | jq '[.[] | {id, path}]'
```

### 3. Add a Movie

```bash
curl -s -X POST "${RADARR_URL}/api/v3/movie" \
  -H "X-Api-Key: ${RADARR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"tmdbId":TMDB_ID,"qualityProfileId":QUALITY_ID,"rootFolderPath":"ROOT_PATH","monitored":true,"addOptions":{"searchForMovie":true}}'
```

**Required fields:**
- `tmdbId` - from search results
- `qualityProfileId` - from quality profiles endpoint
- `rootFolderPath` - from root folders endpoint

**Optional fields:**
- `title` - auto-fetched from TMDB if omitted
- `monitored` - defaults to false
- `addOptions.searchForMovie` - trigger immediate search

## API Reference

See [references/api_reference.md](references/api_reference.md) for full endpoint details.
