# anthropic-podcast-feed

Daily-scanned podcast RSS feeds with rule-based detection of Anthropic employee guests. Used as a long-term accumulating database for an Anthropic-tracking weekly digest.

## How it works

GitHub Actions runs daily at 23:00 UTC (= 07:00 Asia/Taipei):

1. `scripts/scan.js` — fetch all configured RSS feeds, append new episodes to `data/episodes.jsonl` (dedup by guid)
2. `scripts/filter.js` — match each new episode against `data/roster.json`, classify confidence (`rule:strong` / `medium` / `weak` / `miss`), append to `data/episodes-curated.jsonl`
3. Commit changes back to repo

Both `.jsonl` files are append-only — historical state is preserved in git.

## Files

| File | Purpose |
|------|---------|
| `data/feeds.json` | List of `{name, url}` RSS sources |
| `data/roster.json` | Anthropic employee names + handles + aliases |
| `data/episodes.jsonl` | All episodes ever scanned (one JSON per line) |
| `data/episodes-curated.jsonl` | Same with `is_anthropic`, `confidence`, `matched_names` added |

## Local run

```bash
npm install
npm run all
```

No API key needed — pure rule-based.

## Maintenance

- Add a feed: edit `data/feeds.json`, add `{name, url}`
- Add a person: edit `data/roster.json`, add `{handle, name, aliases: []}`
- Manual override: edit `data/episodes-curated.jsonl`, change `is_anthropic` field
