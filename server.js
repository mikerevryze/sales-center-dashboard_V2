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
const API_KEY = process.env.GHL_AGENCY_API_KEY;
const REPS_CONFIG = path.join(__dirname, 'reps-config.json');

function ghlHeaders(extraHeaders = {}) {
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    Version: '2021-04-15',
    ...extraHeaders,
  };
}

async function ghlFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: ghlHeaders(opts.headers || {}),
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`GHL API ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ─── Locations (sub-accounts) ───────────────────────────────────────────────
app.get('/api/locations', async (req, res) => {
  try {
    const data = await ghlFetch(`${GHL_API}/locations/search`, {});
    res.json(data);
  } catch (err) {
    console.error('GET /api/locations error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Users for a location ───────────────────────────────────────────────────
app.get('/api/locations/:locationId/users', async (req, res) => {
  try {
    const { locationId } = req.params;
    const data = await ghlFetch(`${GHL_API}/users/search`, {
      headers: { 'channel-Id': locationId },
    });
    res.json(data);
  } catch (err) {
    console.error('GET /api/locations/:id/users error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Pipelines for a location ───────────────────────────────────────────────
app.get('/api/locations/:locationId/pipelines', async (req, res) => {
  try {
    const { locationId } = req.params;
    const data = await ghlFetch(
      `${GHL_API}/opportunities/pipelines?locationId=${locationId}`,
      {}
    );
    res.json(data);
  } catch (err) {
    console.error('GET /api/locations/:id/pipelines error:', err.message);
    if (err.status === 401) {
      return res.json({ pipelines: [] });
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Calls (conversations) for a location ───────────────────────────────────
app.get('/api/locations/:locationId/calls', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { userId, startDate } = req.query;
    let url = `${GHL_API}/conversations/search?locationId=${locationId}&type=TYPE_PHONE`;
    if (userId) url += `&assignedTo=${userId}`;
    if (startDate) url += `&startAfterDate=${encodeURIComponent(startDate)}`;
    const data = await ghlFetch(url, {});
    res.json(data);
  } catch (err) {
    console.error('GET /api/locations/:id/calls error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Messages for a conversation (includes recordings / transcripts) ────────
app.get('/api/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const data = await ghlFetch(
      `${GHL_API}/conversations/${conversationId}/messages`,
      {}
    );
    res.json(data);
  } catch (err) {
    console.error('GET /api/conversations/:id/messages error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Proxy audio recordings (avoids CORS) ───────────────────────────────────
app.get('/api/recording', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url query param required' });
    const audioRes = await fetch(url, { headers: ghlHeaders() });
    if (!audioRes.ok) {
      return res.status(audioRes.status).json({ error: 'Failed to fetch recording' });
    }
    const contentType = audioRes.headers.get('content-type') || 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    audioRes.body.pipe(res);
  } catch (err) {
    console.error('GET /api/recording error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Opportunities for a location ───────────────────────────────────────────
app.get('/api/locations/:locationId/opportunities', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { pipelineId } = req.query;
    let url = `${GHL_API}/opportunities/search?locationId=${locationId}`;
    if (pipelineId) url += `&pipelineId=${pipelineId}`;
    const data = await ghlFetch(url, {});
    res.json(data);
  } catch (err) {
    console.error('GET /api/locations/:id/opportunities error:', err.message);
    if (err.status === 401) {
      return res.json({ opportunities: [] });
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Reps config ────────────────────────────────────────────────────────────
app.get('/api/config/reps', async (req, res) => {
  try {
    const exists = await fse.pathExists(REPS_CONFIG);
    if (!exists) {
      await fse.writeJson(REPS_CONFIG, { reps: [] });
    }
    const data = await fse.readJson(REPS_CONFIG);
    res.json(data);
  } catch (err) {
    console.error('GET /api/config/reps error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/config/reps', async (req, res) => {
  try {
    const { reps } = req.body;
    if (!Array.isArray(reps)) {
      return res.status(400).json({ error: 'reps must be an array' });
    }
    await fse.writeJson(REPS_CONFIG, { reps }, { spaces: 2 });
    res.json({ success: true, reps });
  } catch (err) {
    console.error('POST /api/config/reps error:', err.message);
    res.status(500).json({ error: err.message });
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
