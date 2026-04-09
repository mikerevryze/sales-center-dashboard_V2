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
// Fetches conversations where lastMessageType=TYPE_CALL, then fetches messages
// for each to extract the TYPE_CALL message and its meta fields.
app.get('/api/locations/:locationId/calls', async (req, res) => {
  try {
    const { locationId } = req.params;
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);

    const callHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    };

    // Step 1: paginate conversations filtered to lastMessageType=TYPE_CALL
    const allConvs = [];
    let page = 1;
    while (true) {
      const url = `${GHL_API}/conversations/search?locationId=${locationId}&lastMessageType=TYPE_CALL&limit=100&sortBy=last_message_date&sortOrder=desc&page=${page}`;
      const data = await ghlGet(url, callHeaders);
      const convs = data.conversations || [];
      allConvs.push(...convs);
      const meta = data.meta || {};
      const hasMore = convs.length === 100 && (meta.total ? allConvs.length < meta.total : true);
      page++;
      if (!hasMore || page > 10) break;
    }

    // Step 2: fetch messages for each conversation in batches of 10
    const callObjects = [];
    for (let i = 0; i < allConvs.length; i += 10) {
      const batch = allConvs.slice(i, i + 10);
      const batchResults = await Promise.all(batch.map(async conv => {
        try {
          const msgRes = await fetch(`${GHL_API}/conversations/${conv.id}/messages`, { headers: callHeaders });
          const msgData = await msgRes.json();
          const messages = Array.isArray(msgData.messages) ? msgData.messages
            : Array.isArray(msgData.items) ? msgData.items
            : Array.isArray(msgData) ? msgData : [];

          const callMsg = messages.find(m => m.type === 1 || m.messageType === 'TYPE_CALL');
          if (!callMsg) return null;

          return {
            conversationId: conv.id,
            messageId: callMsg.id || callMsg.messageId || null,
            contactName: conv.contactName || conv.fullName || conv.phone || null,
            contactId: conv.contactId || null,
            userId: callMsg.userId || conv.assignedTo || null,
            phone: conv.phone || conv.contactPhone || null,
            direction: (callMsg.direction || conv.lastMessageDirection || '').toLowerCase(),
            dateAdded: callMsg.dateAdded || callMsg.createdAt || conv.lastMessageDate || null,
            duration: callMsg.meta?.call?.duration ?? callMsg.meta?.callDuration ?? 0,
            status: callMsg.meta?.call?.status || callMsg.meta?.callStatus || callMsg.status || null,
            locationId,
          };
        } catch (_) {
          return null;
        }
      }));
      batchResults.forEach(c => { if (c) callObjects.push(c); });
      if (i + 10 < allConvs.length) await new Promise(r => setTimeout(r, 300));
    }

    res.json({ calls: callObjects, total: callObjects.length });
  } catch (err) {
    console.error('GET /api/locations/:id/calls error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/debug/calls/:locationId ────────────────────────────────────────
// Tests lastMessageType=TYPE_CALL filter and compares to unfiltered results.
app.get('/api/debug/calls/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);

    const callHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    };

    const tryFetch = async url =>
      fetch(url, { headers: callHeaders }).then(r => r.json()).catch(e => ({ error: e.message }));

    const [lastMsgTypeCall, noFilter] = await Promise.all([
      tryFetch(`${GHL_API}/conversations/search?locationId=${locationId}&lastMessageType=TYPE_CALL&limit=25&sortBy=last_message_date&sortOrder=desc`),
      tryFetch(`${GHL_API}/conversations/search?locationId=${locationId}&limit=25&sortBy=last_message_date&sortOrder=desc`),
    ]);

    const summarise = (data) => {
      const convs = data.conversations || [];
      const types = {};
      convs.forEach(c => { const k = c.lastMessageType || '?'; types[k] = (types[k] || 0) + 1; });
      return {
        status_from_meta: data.meta,
        count: convs.length,
        lastMessageTypes: types,
        sample: convs.slice(0, 3).map(c => ({
          id: c.id,
          contactName: c.contactName || c.fullName,
          lastMessageType: c.lastMessageType,
          lastMessageDirection: c.lastMessageDirection,
          lastMessageDate: c.lastMessageDate,
        })),
        error: data.error,
      };
    };

    res.json({
      locationId,
      lastMessageType_TYPE_CALL: summarise(lastMsgTypeCall),
      no_filter_sample: summarise(noFilter),
    });
  } catch (err) {
    console.error('GET /api/debug/calls error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/debug/callsonly/:locationId ────────────────────────────────────
// Tries three different GHL endpoints to find which one returns actual call data.
app.get('/api/debug/callsonly/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    const locHeaders = locationHeaders(apiKey);

    const tryFetch = async (url, extraHeaders = {}) => {
      try {
        const r = await fetch(url, { headers: { ...locHeaders, ...extraHeaders } });
        const data = await r.json();
        return { status: r.status, data };
      } catch (e) {
        return { error: e.message };
      }
    };

    const [callsEndpoint, conversationsSearch, v1Endpoint] = await Promise.all([
      tryFetch(`${GHL_API}/calls/?locationId=${locationId}&limit=100`),
      tryFetch(`${GHL_API}/conversations/search?locationId=${locationId}&messageTypes[]=TYPE_CALL&limit=100`),
      tryFetch(`https://rest.gohighlevel.com/v1/conversations/?locationId=${locationId}&type=TYPE_CALL&limit=100`),
    ]);

    res.json({ calls_endpoint: callsEndpoint, conversations_search: conversationsSearch, v1_endpoint: v1Endpoint });
  } catch (err) {
    console.error('GET /api/debug/callsonly error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/debug/findcalls/:locationId ────────────────────────────────────
// Fetches 20 conversations, checks each for TYPE_CALL messages, returns only those with calls.
app.get('/api/debug/findcalls/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    const headers = locationHeaders(apiKey);

    // POST search for conversations
    const searchRes = await fetch(`${GHL_API}/conversations/search`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, limit: 20 }),
    });
    const searchData = await searchRes.json();
    const conversations = searchData.conversations || searchData.data || [];

    // For each conversation, fetch messages and look for call messages
    const results = [];
    for (const convo of conversations) {
      const msgRes = await fetch(`${GHL_API}/conversations/${convo.id}/messages`, { headers });
      const msgData = await msgRes.json();
      const messages = msgData.messages || msgData.data || [];

      const callMessages = messages.filter(m =>
        m.messageType === 'TYPE_CALL' ||
        m.type === 1 ||
        (m.meta && m.meta.recordingUrl)
      );

      if (callMessages.length > 0) {
        results.push({
          conversationId: convo.id,
          contactName: convo.contactName || convo.fullName || null,
          callMessages,
        });
      }
    }

    res.json({ searched: conversations.length, withCalls: results.length, results });
  } catch (err) {
    console.error('GET /api/debug/findcalls error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/debug/messages/:conversationId ─────────────────────────────────
// Returns raw GHL messages response with no modification, for debugging field shape.
app.get('/api/debug/messages/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { locationId } = req.query;
    if (!locationId) return res.status(400).json({ error: 'locationId query param required' });
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    const rawRes = await fetch(
      `${GHL_API}/conversations/${conversationId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: '2021-07-28',
          'Content-Type': 'application/json',
        },
      }
    );
    const data = await rawRes.json();
    res.json(data);
  } catch (err) {
    console.error('GET /api/debug/messages error:', err.message);
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
    // Normalize: always return { messages: [] } regardless of GHL response shape
    const messages = Array.isArray(data) ? data
      : Array.isArray(data?.messages) ? data.messages
      : Array.isArray(data?.items) ? data.items
      : [];
    res.json({ messages });
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
// Accepts messageId + locationId, uses the official GHL recording endpoint.
// Falls back to accepting a raw url param for backward-compat.
app.get('/api/recording', async (req, res) => {
  try {
    const { messageId, locationId, url: rawUrl } = req.query;
    if (!locationId) return res.status(400).json({ error: 'locationId query param required' });
    if (!messageId && !rawUrl) return res.status(400).json({ error: 'messageId (or url) query param required' });

    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);

    const callHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    };
    const rangeHeader = req.headers['range'];
    if (rangeHeader) callHeaders['Range'] = rangeHeader;

    const audioUrl = messageId
      ? `${GHL_API}/conversations/messages/${messageId}/locations/${locationId}/recording`
      : rawUrl;

    const audioRes = await fetch(audioUrl, { headers: callHeaders });
    if (!audioRes.ok && audioRes.status !== 206) {
      return res.status(audioRes.status).json({ error: 'Failed to fetch recording' });
    }

    const contentType = audioRes.headers.get('content-type') || 'audio/x-wav';
    const contentLength = audioRes.headers.get('content-length');
    const contentRange = audioRes.headers.get('content-range');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    res.status(audioRes.status);
    audioRes.body.pipe(res);
  } catch (err) {
    console.error('GET /api/recording error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/transcription ───────────────────────────────────────────────────
// Official GHL transcription endpoint by messageId + locationId.
app.get('/api/transcription', async (req, res) => {
  try {
    const { messageId, locationId } = req.query;
    if (!messageId) return res.status(400).json({ error: 'messageId query param required' });
    if (!locationId) return res.status(400).json({ error: 'locationId query param required' });

    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);

    const callHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    };

    const url = `${GHL_API}/conversations/locations/${locationId}/messages/${messageId}/transcription`;
    const tRes = await fetch(url, { headers: callHeaders });
    const data = await tRes.json();
    res.status(tRes.status).json(data);
  } catch (err) {
    console.error('GET /api/transcription error:', err.message);
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
