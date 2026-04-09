require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fse = require('fs-extra');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const GHL_API = 'https://services.leadconnectorhq.com';
const AGENCY_KEY = process.env.GHL_AGENCY_API_KEY;
const CLIENTS_CONFIG = path.join(__dirname, 'clients-config.json');
const REPS_CONFIG = path.join(__dirname, 'reps-config.json');

function agencyHeaders() {
  return {
    Authorization: `Bearer ${AGENCY_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-04-15',
  };
}

function locationHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-04-15',
  };
}

async function ghlGet(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`GHL ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function loadClientsConfig() {
  const exists = await fse.pathExists(CLIENTS_CONFIG);
  if (!exists) {
    await fse.writeJson(CLIENTS_CONFIG, { clients: [] }, { spaces: 2 });
  }
  return fse.readJson(CLIENTS_CONFIG);
}

async function loadRepsConfig() {
  const exists = await fse.pathExists(REPS_CONFIG);
  if (!exists) {
    await fse.writeJson(REPS_CONFIG, { reps: [] }, { spaces: 2 });
  }
  return fse.readJson(REPS_CONFIG);
}

function resolveLocationKey(client) {
  const key = process.env[client.apiKeyEnvVar];
  if (!key) {
    const err = new Error(`Missing env var: ${client.apiKeyEnvVar}`);
    err.status = 503;
    throw err;
  }
  return key;
}

function findClient(clients, locationId) {
  const client = clients.find(c => c.locationId === locationId);
  if (!client) {
    const err = new Error(`Unknown locationId: ${locationId}`);
    err.status = 404;
    throw err;
  }
  return client;
}

// ─── GET /api/config ────────────────────────────────────────────────────────
app.get('/api/config', async (req, res) => {
  try {
    const [clientsData, repsData] = await Promise.all([loadClientsConfig(), loadRepsConfig()]);
    res.json({ clients: clientsData.clients || [], reps: repsData.reps || [] });
  } catch (err) {
    console.error('GET /api/config error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/setup/pipelines/:locationId ───────────────────────────────────
// Dev helper: uses location-specific key to list pipelines for a location
app.get('/api/setup/pipelines/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    const data = await ghlGet(
      `${GHL_API}/opportunities/pipelines?locationId=${locationId}`,
      locationHeaders(apiKey)
    );
    res.json(data);
  } catch (err) {
    console.error('GET /api/setup/pipelines error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/locations/:locationId/opportunities ────────────────────────────
// Returns only Closed Won opportunities (status === 'won')
app.get('/api/locations/:locationId/opportunities', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { pipelineId, startDate, endDate } = req.query;
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);

    let url = `${GHL_API}/opportunities/search?location_id=${locationId}`;
    if (pipelineId) url += `&pipeline_id=${encodeURIComponent(pipelineId)}`;

    const allOpps = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const pageUrl = url + `&page=${page}&limit=100`;
      const data = await ghlGet(pageUrl, locationHeaders(apiKey));
      const opps = data.opportunities || [];
      allOpps.push(...opps);
      const meta = data.meta || {};
      hasMore = opps.length === 100 && (meta.total ? allOpps.length < meta.total : true);
      page++;
      if (page > 20) break;
    }

    res.json({ opportunities: allOpps, total: allOpps.length });
  } catch (err) {
    console.error('GET /api/locations/:id/opportunities error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/locations/:locationId/calls ────────────────────────────────────
app.get('/api/locations/:locationId/calls', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { userId, startDate, endDate } = req.query;
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);

    let url = `${GHL_API}/conversations/search?locationId=${locationId}&type=TYPE_PHONE&limit=100`;
    if (userId) url += `&assignedTo=${encodeURIComponent(userId)}`;
    if (startDate) {
      const ts = new Date(startDate).getTime();
      if (!isNaN(ts)) url += `&startAfterDate=${ts}`;
    }
    if (endDate) {
      const ts = new Date(endDate).getTime();
      if (!isNaN(ts)) url += `&endBeforeDate=${ts}`;
    }

    const allConvs = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const pageUrl = url + `&page=${page}`;
      const data = await ghlGet(pageUrl, locationHeaders(apiKey));
      const convs = data.conversations || [];
      allConvs.push(...convs);
      const meta = data.meta || {};
      hasMore = convs.length === 100 && (meta.total ? allConvs.length < meta.total : true);
      page++;
      if (page > 20) break;
    }

    res.json({ conversations: allConvs, total: allConvs.length });
  } catch (err) {
    console.error('GET /api/locations/:id/calls error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/conversations/:conversationId/messages ─────────────────────────
app.get('/api/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { locationId } = req.query;
    if (!locationId) return res.status(400).json({ error: 'locationId query param required' });
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    const data = await ghlGet(
      `${GHL_API}/conversations/${conversationId}/messages`,
      locationHeaders(apiKey)
    );
    res.json(data);
  } catch (err) {
    console.error('GET /api/conversations/:id/messages error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/locations/:locationId/users ────────────────────────────────────
app.get('/api/locations/:locationId/users', async (req, res) => {
  try {
    const { locationId } = req.params;
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    const data = await ghlGet(
      `${GHL_API}/users/?locationId=${locationId}`,
      locationHeaders(apiKey)
    );
    res.json(data);
  } catch (err) {
    console.error('GET /api/locations/:id/users error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/all-users ───────────────────────────────────────────────────────
// Returns deduplicated users across all configured clients (deduped by email).
// Use this to identify user IDs to add to reps-config.json.
app.get('/api/all-users', async (req, res) => {
  try {
    const clientsData = await loadClientsConfig();
    const clients = (clientsData.clients || []).filter(c => c.locationId);

    const userFetches = clients.map(async client => {
      try {
        const apiKey = resolveLocationKey(client);
        const data = await ghlGet(
          `${GHL_API}/users/?locationId=${client.locationId}`,
          locationHeaders(apiKey)
        );
        return (data.users || []).map(u => ({
          id: u.id,
          name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          email: u.email || '',
          phone: u.phone || '',
          locationId: client.locationId,
          clientName: client.name,
        }));
      } catch {
        return [];
      }
    });

    const results = await Promise.all(userFetches);
    const allUsers = results.flat();

    // Deduplicate by email (keep first occurrence; merge location list)
    const seenEmails = new Map();
    allUsers.forEach(u => {
      const key = (u.email || u.id).toLowerCase();
      if (seenEmails.has(key)) {
        seenEmails.get(key).locations.push(u.clientName);
      } else {
        seenEmails.set(key, { ...u, locations: [u.clientName] });
      }
    });

    const dedupedUsers = Array.from(seenEmails.values());
    res.json({ users: dedupedUsers, total: dedupedUsers.length });
  } catch (err) {
    console.error('GET /api/all-users error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/recording ──────────────────────────────────────────────────────
app.get('/api/recording', async (req, res) => {
  try {
    const { url, locationId } = req.query;
    if (!url) return res.status(400).json({ error: 'url query param required' });
    if (!locationId) return res.status(400).json({ error: 'locationId query param required' });
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    const audioRes = await fetch(url, { headers: locationHeaders(apiKey) });
    if (!audioRes.ok) {
      return res.status(audioRes.status).json({ error: 'Failed to fetch recording' });
    }
    const contentType = audioRes.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    audioRes.body.pipe(res);
  } catch (err) {
    console.error('GET /api/recording error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Fallback to index.html ─────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Revryze Dashboard running on http://0.0.0.0:${PORT}`);
});
