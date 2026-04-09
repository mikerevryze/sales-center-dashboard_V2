# Revryze Sales Center Dashboard v2

## Overview
Internal call center analytics dashboard for Revryze. Tracks sales reps, call recordings, memberships sold, and revenue across multiple GoHighLevel sub-accounts (clients).

## Tech Stack
- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JavaScript (static files in `public/`)
- **API Integration:** GoHighLevel LeadConnector API
- **Config Storage:** Local JSON files (`clients-config.json`, `reps-config.json`)

## Project Structure
```
.
├── server.js             # Express server + GHL API proxy
├── package.json          # Dependencies
├── clients-config.json   # Client/location/pipeline config (manually maintained)
├── reps-config.json      # Sales rep config (manually maintained)
├── README.md             # Setup guide for adding clients & reps
└── public/
    ├── index.html        # Dashboard UI
    ├── app.js            # Frontend logic (all filtering is client-side)
    └── style.css         # Styles
```

## Running the App
- Start: `node server.js`
- Port: **5000** (host: 0.0.0.0)
- Workflow: "Start application"

## Environment Variables / Secrets
- `GHL_AGENCY_API_KEY` — GoHighLevel Agency key (used only for agency-level lookups)
- Per-client location keys named in `clients-config.json` → `apiKeyEnvVar` field (e.g. `GHL_KEY_4EVER`)

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
- `GET /api/locations/:locationId/calls?userId=&startDate=&endDate=` — Fetches phone conversations
- `GET /api/conversations/:id/messages?locationId=` — Fetches messages (recordings/transcripts)
- `GET /api/recording?url=&locationId=` — Proxies audio recordings

## Frontend Architecture
- On page load: fetches all config, opportunities, and calls in parallel for all clients
- All filtering (client, pipeline, rep, date range, call direction) is done client-side
- No extra API calls on filter changes — only on manual Refresh

## Deployment
- Target: autoscale
- Run command: `node server.js`
