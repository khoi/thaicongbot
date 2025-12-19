# Sonarr API v3 Reference

## Authentication

All requests require API key via header:
```
X-Api-Key: {api_key}
```

Or query param: `?apikey={api_key}`

## Endpoints

### Series Lookup (Search)

```
GET /api/v3/series/lookup?term={query}
```

Returns array of series matching query. Each result contains:
- `tvdbId` - TVDB identifier (use for adding)
- `title` - series title
- `year` - first air year
- `overview` - plot summary
- `seasonCount` - number of seasons
- `status` - continuing, ended, etc.

### Quality Profiles

```
GET /api/v3/qualityprofile
```

Returns available quality profiles:
- `id` - profile ID (use for adding)
- `name` - profile name (Any, SD, HD-720p, HD-1080p, Ultra-HD, etc.)

### Root Folders

```
GET /api/v3/rootfolder
```

Returns configured storage paths:
- `id` - folder ID
- `path` - filesystem path (use for adding)

### Add Series

```
POST /api/v3/series
Content-Type: application/json
```

Request body:
```json
{
  "tvdbId": 121361,
  "title": "Game of Thrones",
  "qualityProfileId": 1,
  "rootFolderPath": "/path/to/tv",
  "monitored": true,
  "seasonFolder": true,
  "addOptions": {
    "searchForMissingEpisodes": true
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| tvdbId | Yes | TVDB ID from lookup |
| title | Yes | Series title |
| qualityProfileId | Yes | ID from /qualityprofile |
| rootFolderPath | Yes | Path from /rootfolder |
| monitored | No | Default: false |
| seasonFolder | No | Organize by season folders |
| addOptions.searchForMissingEpisodes | No | Trigger immediate search |

Returns created series object with assigned `id`.

### List Series

```
GET /api/v3/series
```

Returns all series in library.
