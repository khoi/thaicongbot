# Radarr API v3 Reference

## Authentication

All requests require API key via header:
```
X-Api-Key: {api_key}
```

Or query param: `?apikey={api_key}`

## Endpoints

### Movie Lookup (Search)

```
GET /api/v3/movie/lookup?term={query}
```

Returns array of movies matching query. Each result contains:
- `tmdbId` - TMDB identifier (use for adding)
- `title` - movie title
- `year` - release year
- `overview` - plot summary
- `alternateTitles` - international titles

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

### Add Movie

```
POST /api/v3/movie
Content-Type: application/json
```

Request body:
```json
{
  "tmdbId": 27205,
  "qualityProfileId": 1,
  "rootFolderPath": "/path/to/movies",
  "monitored": true,
  "addOptions": {
    "searchForMovie": true
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| tmdbId | Yes | TMDB ID from lookup |
| qualityProfileId | Yes | ID from /qualityprofile |
| rootFolderPath | Yes | Path from /rootfolder |
| title | No | Auto-fetched from TMDB |
| monitored | No | Default: false |
| addOptions.searchForMovie | No | Trigger immediate search |

Returns created movie object with assigned `id`.

### List Movies

```
GET /api/v3/movie
```

Returns all movies in library.
