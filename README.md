# Revryze Sales Center Dashboard v2

Call center analytics dashboard for Revryze — tracks sales reps, call recordings, memberships sold, and revenue across GoHighLevel sub-accounts.

## Setup Guide

### 1. Add your GHL Agency API Key

In Replit Secrets, add:

```
GHL_AGENCY_API_KEY = your_agency_api_key_here
```

This key is used only to authenticate agency-level requests.

---

### 2. Look up Pipeline IDs for each sub-account

Use the built-in setup helper endpoint. After the app is running, visit:

```
GET /api/setup/pipelines/:locationId
```

Replace `:locationId` with the GHL sub-account location ID you want to configure.

**Example:**
```
https://your-repl-url.replit.dev/api/setup/pipelines/PheJU6K11WwiJnS2pAat
```

This returns all pipeline names and IDs for that location, which you'll use in step 3.

---

### 3. Fill in `clients-config.json`

Edit `clients-config.json` in the project root. Each client entry looks like:

```json
{
  "clients": [
    {
      "locationId": "abc123",
      "name": "STRONG Pilates — Momentic",
      "apiKeyEnvVar": "GHL_KEY_STRONG_PILATES",
      "pipelines": [
        { "pipelineId": "pip1", "name": "Charlotte" },
        { "pipelineId": "pip2", "name": "Raleigh" }
      ]
    },
    {
      "locationId": "def456",
      "name": "4Ever Franchisor LLC",
      "apiKeyEnvVar": "GHL_KEY_4EVER",
      "pipelines": [
        { "pipelineId": "pip3", "name": "Austin TX" }
      ]
    }
  ]
}
```

- `locationId` — GHL sub-account ID
- `name` — Display name shown in the dashboard
- `apiKeyEnvVar` — The name of the Replit Secret that holds this location's API key (see step 4)
- `pipelines` — Array of pipelines from step 2; each pipeline = one "location" filter in the dashboard

---

### 4. Add each Location API key to Replit Secrets

For each client, add a secret using the env var name you specified in `apiKeyEnvVar`:

```
GHL_KEY_STRONG_PILATES = loc_api_key_for_strong_pilates
GHL_KEY_4EVER          = loc_api_key_for_4ever
GHL_KEY_TEXAS_LONGEVITY = loc_api_key_for_texas_longevity
```

Location API keys are found in GHL under **Settings → API Keys** within each sub-account.

---

### 5. Add reps to `reps-config.json`

Edit `reps-config.json` in the project root:

```json
{
  "reps": [
    { "id": "ghl_user_id_here", "name": "Jordan Mills", "email": "jordan@revryze.com" },
    { "id": "another_user_id", "name": "Alex Rivera",  "email": "alex@revryze.com" }
  ]
}
```

The `id` field is the GHL User ID. Find it in GHL under **Settings → Team** or use the `/api/setup/pipelines/:locationId` response which includes assigned user info.

---

### 6. Refresh the dashboard

Click **Refresh** in the top bar. The dashboard will load all opportunities and calls for all configured clients.

---

## How it Works

- **Client filter** — Switches the entire dashboard to a single client's data
- **Location filter** — Filters to a specific pipeline (campaign/location opening)
- **Date range** — Last 7 / 30 / 90 days, applied client-side (no extra API calls)
- **Rep leaderboard** — Ranked by memberships sold, revenue, appointments, or call volume. Click a rep to see their calls.
- **Client leaderboard** — One row per configured client. Click a client to filter the whole dashboard.
- **Call log** — Shows calls for the selected rep (or all reps). Filter by direction: All / Outbound / Inbound / Missed.
- **Call detail** — Click any call row to see the audio recording and transcript.

## Outcome Badges

| Badge | Meaning |
|-------|---------|
| **Sold** (green) | Contact has a Closed Won opportunity |
| **In Pipeline** (blue) | Contact has an open opportunity |
| Outbound / Inbound / Missed (gray) | No opportunity found for this contact |

## Dependencies

- `express` — Web server
- `node-fetch@2` — HTTP client for GHL API
- `cors` — CORS middleware
- `dotenv` — Env var loading
- `fs-extra` — Config file I/O
