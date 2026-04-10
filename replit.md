# Revryze Sales Center Dashboard v2

## Overview
Internal call center analytics dashboard for Revryze. Tracks sales reps, call recordings, memberships sold, and revenue across multiple GoHighLevel sub-accounts (clients). Dark-theme, 4-tab Gong-style UI with AI call analysis via Claude.

## Tech Stack
- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JavaScript (static files in `public/`)
- **API Integration:** GoHighLevel LeadConnector API, Anthropic Claude (AI analysis)
- **Config Storage:** Local JSON files (`clients-config.json`, `reps-config.json`, `call-notes.json`, `rep-notes.json`)

## Project Structure
```
.
├── server.js             # Express server + GHL API proxy + Anthropic proxy
├── package.json          # Dependencies
├── clients-config.json   # Client/location/pipeline config (manually maintained)
├── reps-config.json      # Sales rep config (manually maintained)
├── call-notes.json       # Manager notes + flagged calls (auto-created)
├── rep-notes.json        # Manager notes per rep (auto-created, max 50/rep)
├── scoring-rubric.json   # AI scoring rubric config
└── public/
    ├── index.html        # 4-tab dashboard UI (Command Center, Calls, Conversations, Weekly SPIFF)
    ├── app.js            # Frontend logic (all filtering is client-side)
    ├── style.css         # Dark Gong-style theme (--bg:#0a0a0a, --accent:#00f5a0)
    ├── revryze-logo.png  # Brand logo (header)
    └── revryze-icon.png  # Brand icon
```

## Running the App
- Start: `node server.js`
- Port: **5000** (host: 0.0.0.0)
- Workflow: "Start application"

## Environment Variables / Secrets
- `GHL_AGENCY_API_KEY` — GoHighLevel Agency key (setup helper only)
- `GHL_KEY_4EVER` — 4Ever location API key
- Per-client location keys named in `clients-config.json` → `apiKeyEnvVar` field
- `ANTHROPIC_API_KEY` — Claude API key for AI call analysis (optional; analysis disabled if missing)

## Auth Model
- Agency API key → used only for setup helper (`/api/setup/pipelines/:locationId`)
- Each client/sub-account has its own Location API key stored in Replit Secrets
- All pipeline, opportunity, call, and recording calls use the location-specific key

## Config Files
### clients-config.json
```json
{
  "clients": [
    {
      "locationId": "abc123",
      "name": "Client Name",
      "apiKeyEnvVar": "GHL_KEY_CLIENTNAME",
      "pipelines": [
        { "pipelineId": "pip1", "name": "Pipeline Name" }
      ]
    }
  ]
}
```

### reps-config.json
```json
{
  "reps": [
    { "id": "internal_id", "userId": "ghl_user_id", "name": "Rep Name", "email": "rep@email.com" }
  ]
}
```
Note: `userId` must match the GHL user ID from the API. Use `/api/debug/repids` to look up GHL user IDs.

## Key API Endpoints
- `GET /api/config` — Returns combined clients + reps config (maps `r.id → r.userId`)
- `GET /api/setup/pipelines/:locationId` — Lists pipelines for a location (setup helper)
- `GET /api/debug/repids` — Lists GHL users per location for ID mapping
- `GET /api/locations/:locationId/opportunities?pipelineId=` — Fetches all opportunities (cursor-based pagination, 10-min cache keyed by `locationId__pipelineId`)
- `GET /api/locations/:locationId/calls` — Fetches phone conversations (5-min cache)
- `GET /api/locations/:locationId/sms` — Fetches SMS conversations
- `GET /api/conversations/:id/messages?locationId=` — Fetches call message (recording/transcript)
- `GET /api/conversations/:id/thread?locationId=` — Fetches full SMS thread
- `GET /api/recording?messageId=&locationId=` — Proxies audio recordings
- `GET /api/transcription?messageId=&locationId=` — Fetches call transcription
- `GET /api/call-notes/:messageId` — Gets manager note for a call
- `POST /api/call-notes/:messageId` — Saves manager note + flagged status
- `POST /api/ai-analyze` — Analyzes call transcript via Claude (model: claude-sonnet-4-5)
- `GET /api/reps/:repId/pipeline-stats?locationId=` — Pipeline funnel counts per rep from opp cache
- `GET /api/reps/:repId/appointments?locationId=` — Rep appointments from GHL calendar API
- `GET /api/rep-notes/:repId` — Gets all manager notes for a rep
- `POST /api/rep-notes/:repId` — Saves a new note for a rep (max 50 per rep, FIFO eviction)

## Frontend Architecture (4 Tabs)
1. **Command Center** — Metrics (sold, revenue, calls, talk time, close rate), Rep Leaderboard, Client Leaderboard with client/pipeline/date filters; click any rep row to open slide-in Rep Profile Panel
2. **Calls** — Call list (expanded 2-row filter bar: outcome/duration/AI score/flagged/custom date/clear) + Call Detail panel (audio, transcript, AI analysis, manager notes, flagging)
3. **Conversations** — SMS list + full chat-bubble thread view (grouped by direction, sender labels, auto-scroll)
4. **Weekly SPIFF** — Week-by-week rep rankings by memberships sold (filters by `lastStageChangeAt`)

All filtering is done client-side on page load. No extra API calls on filter changes — only on manual Refresh.

## Rep Profile Panel (Slide-in, 62% width from right)
Opens when clicking a rep row in the Rep Leaderboard. Has 6 tabs:
1. **Pipeline Funnel** — Bar chart of opp counts per stage (won=green, lost=red, other=teal) from `/api/reps/:repId/pipeline-stats`
2. **Appointments** — Upcoming appointments from GHL calendar API for this rep
3. **Calls** — Filtered call list with search, same click-to-open-detail behavior as main Calls tab
4. **SMS** — Rep's SMS conversations with contact name + last message preview
5. **Scores** — Average AI score + list of scored calls with badge colors (green ≥80, yellow ≥60, red <60)
6. **Notes** — Manager notes textarea + saved notes list; persisted in `rep-notes.json`

Panel state: `currentProfileRepId`, `currentPanelLocId`, `$repPanel` (`.open` class drives CSS transform)

## Manager / My View Toggle
- **Manager View** (default): shows all reps' data across all tabs
- **My View**: filters all metrics, leaderboards, calls, SMS, and SPIFF to a single rep
- Toggle button in header top-right; My View shows a rep selector dropdown
- State persisted in `localStorage` as `myViewRepId` (null = Manager View)
- `viewToggleReady` flag prevents duplicate event listener attachment on data refresh

## Data Accuracy Rules (GHL field mapping)
- **Memberships sold**: `status === 'won'` filtered by `lastStageChangeAt` (not `dateAdded`)
- **Rep attribution priority**: `assignedTo` → `followers[0]` → contactId cross-ref against calls → unattributed
- **Revenue**: Only sums `monetaryValue > 0`; shows $0 honestly when no values set in GHL
- **Talk time**: Sums `c.duration || c.meta?.call?.duration` from all calls; formatted as "Xh Ym" or "Ym Ys"
- **Close rate**: `(won opps ÷ total calls) × 100`; shows "—" and logs warning if > 100% (sanity check)
- **Rep call counts**: Uses `c.userId` from TYPE_CALL messages matched to `rep.userId`
- **SPIFF win date**: Uses `lastStageChangeAt` via `getWonDate()` helper
- **userId normalization**: `/api/config` maps `r.id → r.userId` so frontend always uses `rep.userId` consistently

## Opportunity Cache (`oppsCache`)
- Server-side `Map()` with 10-minute TTL
- Key: `${locationId}__${pipelineId||''}` (no pipelineId suffix when not filtered)
- Cursor-based pagination using `startAfterId` from last opp on each page
- Pipeline-stats endpoint reads from `oppsCache.get(locationId + '__')` to avoid refetch

## GHL API Notes
- Version header `2021-07-28` required for calls/messages/recording/transcription
- Version header `2021-04-15` for standard endpoints
- Nested response from `/conversations/:id/messages`: `{ messages: { messages: [...] } }`
- Recording URL: `GET /conversations/messages/{messageId}/locations/{locationId}/recording`
- Transcription: `GET /conversations/locations/{locationId}/messages/{messageId}/transcription`
- Transcription returns array of `{ transcript, startTime, endTime }` objects
- Call status for missed calls: `'no-answer'`
- 429 rate limiting: server retries with exponential backoff (3s, 6s, 12s); calls wait 300ms between sequential enrichment fetches

## Deployment
- Target: autoscale
- Run command: `node server.js`
