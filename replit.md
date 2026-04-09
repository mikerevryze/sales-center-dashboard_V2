# Revryze Sales Center Dashboard v2

## Overview
Internal call center analytics dashboard for Revryze. Tracks sales reps, call recordings, memberships sold, and revenue across multiple GoHighLevel sub-accounts (clients). Dark-theme, 4-tab Gong-style UI with AI call analysis via Claude.

## Tech Stack
- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JavaScript (static files in `public/`)
- **API Integration:** GoHighLevel LeadConnector API, Anthropic Claude (AI analysis)
- **Config Storage:** Local JSON files (`clients-config.json`, `reps-config.json`, `call-notes.json`)

## Project Structure
```
.
├── server.js             # Express server + GHL API proxy + Anthropic proxy
├── package.json          # Dependencies
├── clients-config.json   # Client/location/pipeline config (manually maintained)
├── reps-config.json      # Sales rep config (manually maintained)
├── call-notes.json       # Manager notes + flagged calls (auto-created)
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
    { "id": "ghl_user_id", "name": "Rep Name", "email": "rep@email.com" }
  ]
}
```

## Key API Endpoints
- `GET /api/config` — Returns combined clients + reps config
- `GET /api/setup/pipelines/:locationId` — Lists pipelines for a location (setup helper)
- `GET /api/locations/:locationId/opportunities?pipelineId=` — Fetches all opportunities
- `GET /api/locations/:locationId/calls` — Fetches phone conversations (5-min cache)
- `GET /api/locations/:locationId/sms` — Fetches SMS conversations
- `GET /api/conversations/:id/messages?locationId=` — Fetches call message (recording/transcript)
- `GET /api/conversations/:id/thread?locationId=` — Fetches full SMS thread
- `GET /api/recording?messageId=&locationId=` — Proxies audio recordings
- `GET /api/transcription?messageId=&locationId=` — Fetches call transcription
- `GET /api/call-notes/:messageId` — Gets manager note for a call
- `POST /api/call-notes/:messageId` — Saves manager note + flagged status
- `POST /api/ai-analyze` — Analyzes call transcript via Claude (model: claude-sonnet-4-5)

## Frontend Architecture (4 Tabs)
1. **Command Center** — Metrics, Rep Leaderboard, Client Leaderboard with client/pipeline/date filters
2. **Calls** — Call list (search, rep, client, date, direction filters) + Call Detail panel (audio, transcript, AI analysis, manager notes)
3. **Conversations** — SMS conversation list + thread view per client
4. **Weekly SPIFF** — Week-by-week rep rankings by memberships sold

All filtering is done client-side on page load. No extra API calls on filter changes — only on manual Refresh.

## GHL API Notes
- Version header `2021-07-28` required for calls/messages/recording/transcription
- Version header `2021-04-15` for standard endpoints
- Nested response from `/conversations/:id/messages`: `{ messages: { messages: [...] } }`
- Recording URL: `GET /conversations/messages/{messageId}/locations/{locationId}/recording`
- Transcription: `GET /conversations/locations/{locationId}/messages/{messageId}/transcription`
- Transcription returns array of `{ transcript, startTime, endTime }` objects
- Call status for missed calls: `'no-answer'`

## Deployment
- Target: autoscale
- Run command: `node server.js`
