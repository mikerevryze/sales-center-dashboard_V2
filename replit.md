# Revryze Sales Center Dashboard v2

## Overview
A call center analytics dashboard that integrates with the GoHighLevel (GHL) API to provide insights into sales activities, call recordings, and lead management.

## Tech Stack
- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JavaScript (served as static files from `public/`)
- **API Integration:** GoHighLevel LeadConnector API
- **Data Storage:** Local JSON file (`reps-config.json`) for sales rep configurations

## Project Structure
```
.
├── server.js           # Express server + GHL API proxy
├── package.json        # Dependencies
├── reps-config.json    # (auto-generated) Sales rep configurations
└── public/
    ├── index.html      # Dashboard UI
    ├── app.js          # Frontend logic
    └── style.css       # Styles
```

## Running the App
- Start: `node server.js`
- Port: **5000** (host: 0.0.0.0)
- Workflow: "Start application"

## Environment Variables
- `GHL_AGENCY_API_KEY` (secret) — GoHighLevel Agency API key, required for all data fetching
- `PORT` — Server port (defaults to 5000)

## Key API Endpoints
- `GET /api/locations` — Fetch GHL sub-accounts
- `GET /api/locations/:id/users` — Users for a location
- `GET /api/locations/:id/calls` — Phone conversations
- `GET /api/locations/:id/pipelines` — Sales pipelines
- `GET /api/locations/:id/opportunities` — Opportunities
- `GET /api/conversations/:id/messages` — Conversation messages
- `GET /api/recording?url=...` — Proxy audio recordings
- `GET/POST /api/config/reps` — Manage sales rep configurations

## Deployment
- Target: autoscale
- Run command: `node server.js`
