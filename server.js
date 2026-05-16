require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const fse = require('fs-extra');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const GHL_API = 'https://services.leadconnectorhq.com';
const AGENCY_KEY = process.env.GHL_AGENCY_API_KEY;
const CLIENTS_CONFIG = path.join(__dirname, 'clients-config.json');
const REPS_CONFIG = path.join(__dirname, 'reps-config.json');
const CALL_NOTES_FILE = path.join(__dirname, 'call-notes.json');
const SCORING_RUBRIC_FILE = path.join(__dirname, 'scoring-rubric.json');
const CALLS_CACHE_FILE = path.join(__dirname, 'calls-cache.json');

const DEFAULT_RUBRIC = `You are a sales call analyst for Revryze, a franchise presale membership company. Score this call out of 10 based on:
- Opening (1pt): Did the rep introduce themselves clearly and professionally?
- Discovery (2pts): Did they ask about the prospect's goals, timeline, and situation?
- Pitch (2pts): Did they clearly explain the founding membership value and urgency?
- Objection Handling (2pts): Did they address concerns effectively and pivot to value?
- Close Attempt (2pts): Did they ask for the sale, set a next step, or book an appointment?
- Professionalism (1pt): Was the call respectful, energetic, and well-paced?
Deduct points for: excessive filler words, talking over the prospect, ignoring objections, no close attempt.`;

async function loadScoringRubric() {
  const exists = await fse.pathExists(SCORING_RUBRIC_FILE);
  if (!exists) {
    const defaults = { default: DEFAULT_RUBRIC, repOverrides: {} };
    await fse.writeJson(SCORING_RUBRIC_FILE, defaults, { spaces: 2 });
    return defaults;
  }
  return fse.readJson(SCORING_RUBRIC_FILE);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// In-memory calls cache (stale-while-revalidate — returns cached data immediately, refreshes in background)
const callsCache = new Map(); // locationId -> { data, timestamp }
// 30-minute in-memory cache for opportunities per locationId+pipelineId
const oppsCache = new Map(); // locationId__pipelineId -> { data, timestamp }
// 60-minute in-memory cache for pipeline stage names per locationId
const stagesCache = new Map(); // locationId -> { map: { stageId: stageName }, timestamp }
// Disk-backed enrichment cache: conversationId -> { messageId, duration, status, userId, enrichedAt }
const callEnrichmentCache = new Map();
// Set of locationIds currently being refreshed in the background
const refreshingLocations = new Set();

// Fetch stageId → stageName map for a location from GHL pipeline API (60-min cache)
async function fetchStageNameMap(locationId, headers) {
  const cached = stagesCache.get(locationId);
  if (cached && (Date.now() - cached.timestamp) < 60 * 60 * 1000) return cached.map;
  try {
    const r = await fetch(`${GHL_API}/opportunities/pipelines?locationId=${locationId}`, { headers });
    if (!r.ok) return {};
    const body = await r.json();
    const map = {};
    (body.pipelines || []).forEach(p => {
      (p.stages || []).forEach(s => {
        if (s.id && s.name) map[s.id] = s.name;
      });
    });
    stagesCache.set(locationId, { map, timestamp: Date.now() });
    return map;
  } catch {
    return {};
  }
}

// ─── Disk-backed call enrichment cache helpers ────────────────────────────────
async function loadCallEnrichmentCache() {
  try {
    if (await fse.pathExists(CALLS_CACHE_FILE)) {
      const data = await fse.readJson(CALLS_CACHE_FILE);
      Object.entries(data).forEach(([k, v]) => callEnrichmentCache.set(k, v));
      console.log(`[enrichCache] Loaded ${callEnrichmentCache.size} entries from calls-cache.json`);
    }
  } catch (e) {
    console.warn('[enrichCache] Failed to load calls-cache.json:', e.message);
  }
}

async function persistCallEnrichmentCache() {
  try {
    const obj = {};
    callEnrichmentCache.forEach((v, k) => { obj[k] = v; });
    await fse.writeJson(CALLS_CACHE_FILE, obj, { spaces: 2 });
  } catch (e) {
    console.warn('[enrichCache] Failed to write calls-cache.json:', e.message);
  }
}

// Concurrent enrichment helper (no extra npm packages)
async function enrichWithConcurrency(items, fn, concurrency = 8) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        try { results[idx] = await fn(items[idx], idx); }
        catch (e) { results[idx] = null; }
      }
    })
  );
  return results;
}

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
    console.warn(`[config] Missing env var: ${client.apiKeyEnvVar} — skipping client "${client.name}"`);
    return null;
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
    // Bug 1 fix: normalize userId — reps-config uses 'id', frontend expects 'userId'
    const reps = (repsData.reps || []).map(r => ({
      ...r,
      userId: r.userId || r.id,
    }));
    res.json({ clients: clientsData.clients || [], reps });
  } catch (err) {
    console.error('GET /api/config error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Shared opportunity fetcher — cursor-based, 500-opp hard cap ─────────────
async function fetchAllOpportunities(locationId, pipelineId, headers) {
  let allOpps = [];
  let startAfterId = null;
  let keepGoing = true;

  while (keepGoing) {
    let url = `${GHL_API}/opportunities/search?location_id=${locationId}&limit=100`;
    if (pipelineId) url += `&pipeline_id=${encodeURIComponent(pipelineId)}`;
    if (startAfterId) url += `&startAfterId=${encodeURIComponent(startAfterId)}`;

    // Fetch with 429 retry
    let data;
    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      const r = await fetch(url, { headers });
      if (r.status === 429) {
        console.warn(`[opps] 429 rate limit, waiting ${attempt * 3000}ms...`);
        await sleep(attempt * 3000);
        continue;
      }
      if (!r.ok) {
        const text = await r.text();
        const err = new Error(`GHL ${r.status}: ${text}`);
        err.status = r.status;
        throw err;
      }
      data = await r.json();
      break;
    }
    if (!data) break;

    const opps = data.opportunities || [];
    allOpps = allOpps.concat(opps);
    console.log(`[opps] ${locationId}${pipelineId ? '/' + pipelineId : ''} fetched ${opps.length}, total: ${allOpps.length}`);

    if (opps.length < 100) {
      keepGoing = false;
    } else {
      startAfterId = opps[opps.length - 1].id;
      await sleep(300);
    }

    // Hard safety cap — never fetch more than 500 opps per call
    if (allOpps.length >= 500) {
      keepGoing = false;
    }
  }

  const wonCount = allOpps.filter(o => o.status === 'won').length;
  console.log(`[opps] ${locationId}${pipelineId ? '/' + pipelineId : ''} done — ${allOpps.length} total, ${wonCount} won`);
  return allOpps;
}

// Fetch EVERY won opportunity for a location/pipeline — no 500 cap.
// Uses the GHL &status=won server-side filter so pagination is never consumed by leads.
async function fetchAllWonOpportunities(locationId, pipelineId, headers) {
  let allWon = [];
  let startAfterId = null;
  let keepGoing = true;

  while (keepGoing) {
    let url = `${GHL_API}/opportunities/search?location_id=${locationId}&status=won&limit=100`;
    if (pipelineId) url += `&pipeline_id=${encodeURIComponent(pipelineId)}`;
    if (startAfterId) url += `&startAfterId=${encodeURIComponent(startAfterId)}`;

    let data;
    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      const r = await fetch(url, { headers });
      if (r.status === 429) { await sleep(attempt * 3000); continue; }
      if (!r.ok) { keepGoing = false; break; }
      data = await r.json();
      break;
    }
    if (!data) break;

    const opps = data.opportunities || [];
    allWon = allWon.concat(opps);
    console.log(`[wonOpps] ${locationId}${pipelineId ? '/' + pipelineId : ''} page fetched ${opps.length}, total won: ${allWon.length}`);

    if (opps.length < 100) {
      keepGoing = false;
    } else {
      startAfterId = opps[opps.length - 1].id;
      await sleep(250);
    }

    if (allWon.length >= 5000) {
      console.warn(`[wonOpps] ${locationId} hit 5000 won-opp safety ceiling — data may be incomplete`);
      keepGoing = false;
    }
  }

  return allWon;
}

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
// Bug 2 fix: cursor-based pagination using startAfterId (not page numbers).
// Results cached 10 min to avoid repeated GHL rate limits.
app.get('/api/locations/:locationId/opportunities', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { pipelineId } = req.query;

    // Serve from cache if fresh (key includes pipelineId so different pipeline
    // filters get their own cache entry)
    const cacheKey = `${locationId}__${pipelineId || ''}`;
    const cachedOpps = oppsCache.get(cacheKey);
    if (cachedOpps && (Date.now() - cachedOpps.timestamp) < 30 * 60 * 1000) {
      console.log(`[opps] ${locationId} serving ${cachedOpps.data.total} opps from cache`);
      return res.json(cachedOpps.data);
    }

    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    if (!apiKey) return res.json({ opportunities: [], total: 0 });
    const headers = locationHeaders(apiKey);

    let allOpps = [];

    // Fetch the regular all-opps array (capped at 500 — fine for pipeline funnel display)
    if (!pipelineId && client.pipelines && client.pipelines.length > 0) {
      for (const pipeline of client.pipelines) {
        const pOpps = await fetchAllOpportunities(locationId, pipeline.pipelineId, headers);
        allOpps = allOpps.concat(pOpps);
        await sleep(300);
      }
    } else {
      allOpps = await fetchAllOpportunities(locationId, pipelineId || null, headers);
    }

    // CRITICAL: fetch every won opp separately so none are truncated by the 500 cap
    let allWon = [];
    if (!pipelineId && client.pipelines && client.pipelines.length > 0) {
      for (const pipeline of client.pipelines) {
        const pWon = await fetchAllWonOpportunities(locationId, pipeline.pipelineId, headers);
        allWon = allWon.concat(pWon);
        await sleep(300);
      }
    } else {
      allWon = await fetchAllWonOpportunities(locationId, pipelineId || null, headers);
    }

    // Merge — won opps take priority (they are the source of truth for sold count)
    const byId = new Map();
    allWon.forEach(o => byId.set(o.id, o));
    allOpps.forEach(o => { if (!byId.has(o.id)) byId.set(o.id, o); });
    const merged = Array.from(byId.values());
    const seen = new Set();
    const finalOpps = merged.filter(o => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });

    const wonCount = finalOpps.filter(o => o.status === 'won').length;
    console.log(`[opps] ${locationId} combined — ${finalOpps.length} total, ${wonCount} won (from ${allWon.length} won-fetched)`);

    const responseData = { opportunities: finalOpps, total: finalOpps.length, wonTotal: wonCount };
    oppsCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    res.json(responseData);
  } catch (err) {
    console.error('GET /api/locations/:id/opportunities error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Core calls refresh (used directly and as stale-while-revalidate background task) ──
async function doCallsRefresh(locationId, extend = false) {
  const clientsData = await loadClientsConfig();
  const client = findClient(clientsData.clients, locationId);
  const apiKey = resolveLocationKey(client);
  if (!apiKey) return null;

  const callHeaders = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  // max 2 pages (200 calls) on first fetch; max 5 pages (500) when extend=1
  const maxPages = extend ? 5 : 2;
  let allConvs = [];
  let callPage = 1;
  let hasMore = false;
  let keepFetchingCalls = true;

  while (keepFetchingCalls) {
    const pageUrl = `${GHL_API}/conversations/search?locationId=${locationId}&lastMessageType=TYPE_CALL&limit=100&page=${callPage}&sortBy=last_message_date&sortOrder=desc`;
    let pageData;
    let attempt = 0;
    while (attempt < 3) {
      attempt++;
      const r = await fetch(pageUrl, { headers: callHeaders });
      if (r.status === 429) { await sleep(attempt * 3000); continue; }
      if (!r.ok) { keepFetchingCalls = false; break; }
      pageData = await r.json();
      break;
    }
    if (!pageData) break;
    const pageConvs = Array.isArray(pageData.conversations) ? pageData.conversations : [];
    allConvs = allConvs.concat(pageConvs);
    if (pageConvs.length < 100 || callPage >= maxPages) {
      if (pageConvs.length === 100 && callPage >= maxPages) hasMore = true;
      keepFetchingCalls = false;
    } else {
      callPage++;
      await sleep(300);
    }
  }

  const callObjects = allConvs.map(conv => ({
    conversationId: conv.id,
    messageId: null,
    contactName: conv.contactName || conv.fullName || null,
    contactId:   conv.contactId || null,
    phone:       conv.phone || conv.lastMessageBody || null,
    direction:   (conv.lastMessageDirection || '').toLowerCase(),
    dateAdded:   conv.lastMessageDate || null,
    duration:    null,
    status:      conv.lastMessageType || null,
    userId:      conv.assignedTo || null,
    locationId,
  }));

  // Cache-first enrichment: skip API call for convos enriched within last 7 days
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const needsEnrichment = [];
  callObjects.forEach(co => {
    const cached = callEnrichmentCache.get(co.conversationId);
    if (cached && (Date.now() - new Date(cached.enrichedAt).getTime()) < SEVEN_DAYS_MS) {
      co.messageId = cached.messageId;
      co.duration  = cached.duration;
      if (cached.status) co.status = cached.status;
      if (!co.userId && cached.userId) co.userId = cached.userId;
    } else {
      needsEnrichment.push(co);
    }
  });

  console.log(`[calls] ${locationId}: ${callObjects.length - needsEnrichment.length} from enrichment cache, ${needsEnrichment.length} need API fetch`);

  let newEnrichCount = 0;
  await enrichWithConcurrency(needsEnrichment, async (co) => {
    let msgRes = await fetch(`${GHL_API}/conversations/${co.conversationId}/messages`, { headers: callHeaders });
    if (msgRes.status === 429) {
      await sleep(3000);
      msgRes = await fetch(`${GHL_API}/conversations/${co.conversationId}/messages`, { headers: callHeaders });
    }
    if (!msgRes.ok) return;
    const msgData = await msgRes.json();
    const messages = Array.isArray(msgData.messages?.messages) ? msgData.messages.messages
      : Array.isArray(msgData.messages) ? msgData.messages : [];
    const callMsg = messages.find(m => m.type === 1 || m.messageType === 'TYPE_CALL');
    if (callMsg) {
      co.messageId = callMsg.id || callMsg.messageId || null;
      co.duration  = callMsg.meta?.call?.duration ?? callMsg.meta?.callDuration ?? null;
      const callStatus = callMsg.meta?.call?.status || null;
      if (!co.userId && callMsg.userId) co.userId = callMsg.userId;
      callEnrichmentCache.set(co.conversationId, {
        messageId:  co.messageId,
        duration:   co.duration,
        status:     callStatus,
        userId:     co.userId,
        enrichedAt: new Date().toISOString(),
      });
      newEnrichCount++;
      if (newEnrichCount % 50 === 0) await persistCallEnrichmentCache();
    }
  }, 8);

  if (newEnrichCount > 0) await persistCallEnrichmentCache();

  const nullDur = callObjects.filter(c => c.duration === null).length;
  console.log(`[calls] ${locationId} done — ${callObjects.length} calls, ${nullDur} null duration, ${newEnrichCount} newly enriched, hasMore=${hasMore}`);

  const responseData = { calls: callObjects, total: callObjects.length, hasMore };
  callsCache.set(locationId, { data: responseData, timestamp: Date.now() });
  return responseData;
}

// ─── GET /api/locations/:locationId/calls ─────────────────────────────────────
// Stale-while-revalidate: returns cached data immediately, refreshes in background.
// Blocks only on first cold-cache request for a location.
app.get('/api/locations/:locationId/calls', async (req, res) => {
  try {
    const { locationId } = req.params;
    const extend = req.query.extend === '1';
    const cached = callsCache.get(locationId);
    const isStale = !cached || (Date.now() - cached.timestamp) >= 5 * 60 * 1000;

    if (cached) {
      if (isStale && !refreshingLocations.has(locationId)) {
        refreshingLocations.add(locationId);
        doCallsRefresh(locationId, extend)
          .catch(e => console.error('[calls] background refresh error:', e.message))
          .finally(() => refreshingLocations.delete(locationId));
      }
      return res.json(cached.data);
    }

    // No cache yet — must block until data is ready
    if (!refreshingLocations.has(locationId)) {
      refreshingLocations.add(locationId);
      try {
        await doCallsRefresh(locationId, extend);
      } finally {
        refreshingLocations.delete(locationId);
      }
    } else {
      // Concurrent request — wait briefly then serve from whatever cache exists
      await sleep(2000);
    }

    const freshCache = callsCache.get(locationId);
    return res.json(freshCache ? freshCache.data : { calls: [], total: 0, hasMore: false });
  } catch (err) {
    console.error('GET /api/locations/:id/calls error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/conversations/:conversationId/messages ─────────────────────────
// Fetches messages for a single conversation, finds the TYPE_CALL message,
// and returns messageId, duration, and status. Used on call row click.
app.get('/api/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { locationId } = req.query;
    if (!locationId) return res.status(400).json({ error: 'locationId query param required' });

    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);

    const callHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    };

    const url = `${GHL_API}/conversations/${conversationId}/messages`;
    let msgRes = await fetch(url, { headers: callHeaders });
    if (msgRes.status === 429) {
      await sleep(2000);
      msgRes = await fetch(url, { headers: callHeaders });
    }
    if (!msgRes.ok) return res.status(msgRes.status).json({ error: `GHL ${msgRes.status}` });

    const msgData = await msgRes.json();

    // GHL returns { messages: { messages: [...], ... } } — the array is nested one level deeper
    console.log(`[conv-messages] raw top-level keys:`, Object.keys(msgData));
    console.log(`[conv-messages] typeof msgData.messages:`, typeof msgData.messages, Array.isArray(msgData.messages));
    if (msgData.messages && typeof msgData.messages === 'object' && !Array.isArray(msgData.messages)) {
      console.log(`[conv-messages] msgData.messages keys:`, Object.keys(msgData.messages));
    }

    const messages = Array.isArray(msgData.messages?.messages) ? msgData.messages.messages
      : Array.isArray(msgData.messages) ? msgData.messages
      : Array.isArray(msgData.items) ? msgData.items
      : Array.isArray(msgData) ? msgData : [];

    console.log(`[conv-messages] convId=${conversationId} total messages=${messages.length}`);
    console.log(`[conv-messages] message types:`, messages.map(m => ({ id: m.id, type: m.type, messageType: m.messageType })));

    const callMsg = messages.find(m => m.type === 1 || m.messageType === 'TYPE_CALL');
    if (!callMsg) {
      console.log(`[conv-messages] No TYPE_CALL message found for convId=${conversationId}`);
      return res.json({ messageId: null, duration: null, status: null });
    }

    const messageId = callMsg.id || callMsg.messageId || null;
    const duration = callMsg.meta?.call?.duration ?? callMsg.meta?.callDuration ?? null;
    const status = callMsg.meta?.call?.status || callMsg.meta?.callStatus || callMsg.status || null;

    console.log(`[conv-messages] Found call message: id=${callMsg.id} messageId=${callMsg.messageId} => messageId=${messageId} duration=${duration} status=${status}`);
    console.log(`[conv-messages] callMsg.meta:`, JSON.stringify(callMsg.meta));

    res.json({ messageId, duration, status, userId: callMsg.userId || null });
  } catch (err) {
    console.error('GET /api/conversations/:id/messages error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/debug/repids ────────────────────────────────────────────────────
// Returns reps from config alongside unique userIds found in calls cache.
// Use to verify IDs match between reps-config.json and GHL call data.
app.get('/api/debug/repids', async (req, res) => {
  try {
    const repsData = await loadRepsConfig();
    const reps = repsData.reps || [];

    // Collect all userIds from every cached calls set
    const callsById = {};
    callsCache.forEach((cached, locId) => {
      (cached.data.calls || []).forEach(c => {
        if (c.userId) {
          if (!callsById[c.userId]) callsById[c.userId] = 0;
          callsById[c.userId]++;
        }
      });
    });

    const userIdsInCalls = Object.keys(callsById);

    const matches = reps.map(r => {
      const id = r.userId || r.id;
      return {
        repName: r.name,
        id,
        callCount: callsById[id] || 0,
        matchFound: userIdsInCalls.includes(id),
      };
    });

    res.json({
      repsInConfig: reps.map(r => ({ id: r.userId || r.id, name: r.name })),
      userIdsInCalls,
      callCountsByUserId: callsById,
      matches,
      note: 'Hit /api/locations/:locationId/calls first to warm the cache',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ─── GET /api/debug/msgsearch/:locationId ────────────────────────────────────
// Tests the message search endpoint and returns the raw response.
app.get('/api/debug/msgsearch/:locationId', async (req, res) => {
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

    const url = `${GHL_API}/conversations/messages/search?locationId=${locationId}&messageType=TYPE_CALL&limit=50&sortBy=dateAdded&sortOrder=desc`;
    const raw = await fetch(url, { headers: callHeaders });
    const data = await raw.json();

    res.json({ status: raw.status, url, data });
  } catch (err) {
    console.error('GET /api/debug/msgsearch error:', err.message);
    res.status(500).json({ error: err.message });
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

// ─── GET /api/debug/recording ────────────────────────────────────────────────
// Returns { status, contentType, url } without piping audio — for verifying
// that the GHL recording endpoint is reachable and returning the right type.
app.get('/api/debug/recording', async (req, res) => {
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

    const url = `${GHL_API}/conversations/messages/${messageId}/locations/${locationId}/recording`;
    console.log(`[debug/recording] fetching: ${url}`);

    const audioRes = await fetch(url, { headers: callHeaders });
    const contentType = audioRes.headers.get('content-type') || null;
    const contentLength = audioRes.headers.get('content-length') || null;

    console.log(`[debug/recording] status=${audioRes.status} contentType=${contentType}`);

    res.json({ status: audioRes.status, contentType, contentLength, url });
  } catch (err) {
    console.error('GET /api/debug/recording error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/call-notes (all) ───────────────────────────────────────────────
app.get('/api/call-notes', async (req, res) => {
  try {
    const exists = await fse.pathExists(CALL_NOTES_FILE);
    if (!exists) return res.json({});
    const notes = await fse.readJson(CALL_NOTES_FILE);
    res.json(notes);
  } catch (err) {
    console.error('GET /api/call-notes (all) error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/call-notes/:messageId ─────────────────────────────────────────
app.get('/api/call-notes/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const exists = await fse.pathExists(CALL_NOTES_FILE);
    if (!exists) return res.json({});
    const notes = await fse.readJson(CALL_NOTES_FILE);
    res.json(notes[messageId] || {});
  } catch (err) {
    console.error('GET /api/call-notes error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/call-notes/:messageId ────────────────────────────────────────
app.post('/api/call-notes/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { note, flagged, conversationId, aiAnalysis, aiAnalyzedAt } = req.body;
    const exists = await fse.pathExists(CALL_NOTES_FILE);
    const notes = exists ? await fse.readJson(CALL_NOTES_FILE) : {};
    const existing = notes[messageId] || {};
    notes[messageId] = {
      ...existing,
      ...(note !== undefined ? { note, savedAt: new Date().toISOString() } : {}),
      ...(flagged !== undefined ? { flagged: !!flagged } : {}),
      ...(conversationId ? { conversationId } : {}),
      ...(aiAnalysis ? { aiAnalysis, aiAnalyzedAt: aiAnalyzedAt || new Date().toISOString() } : {}),
    };
    await fse.writeJson(CALL_NOTES_FILE, notes, { spaces: 2 });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/call-notes error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/scoring-rubric ─────────────────────────────────────────────────
app.get('/api/scoring-rubric', async (req, res) => {
  try {
    const rubric = await loadScoringRubric();
    res.json(rubric);
  } catch (err) {
    console.error('GET /api/scoring-rubric error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/scoring-rubric ────────────────────────────────────────────────
app.post('/api/scoring-rubric', async (req, res) => {
  try {
    const { default: defaultRubric, repOverrides } = req.body;
    const existing = await loadScoringRubric();
    const updated = {
      default: defaultRubric !== undefined ? defaultRubric : existing.default,
      repOverrides: repOverrides !== undefined ? repOverrides : (existing.repOverrides || {}),
    };
    await fse.writeJson(SCORING_RUBRIC_FILE, updated, { spaces: 2 });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /api/scoring-rubric error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai-analyze ────────────────────────────────────────────────────
app.post('/api/ai-analyze', async (req, res) => {
  try {
    const { transcript, repName, contactName, repId } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript is required' });

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });

    const rubric = await loadScoringRubric();
    const rubricText = (repId && rubric.repOverrides && rubric.repOverrides[repId])
      ? rubric.repOverrides[repId]
      : (rubric.default || DEFAULT_RUBRIC);

    const systemPrompt = `${rubricText}

Respond ONLY with valid JSON in this exact structure:
{
  "score": <integer 1-10>,
  "summary": "<2-3 sentence summary of the call>",
  "keyMoments": [
    { "type": "<e.g. Opening, Objection Handling, Close Attempt, Rapport Building, Discovery>", "description": "<what happened>" }
  ],
  "coachingTip": "<1-2 sentence actionable coaching tip for the rep>",
  "labeledTranscript": [
    { "speaker": "Rep", "text": "<their words>" },
    { "speaker": "Lead", "text": "<their words>" }
  ]
}
Limit keyMoments to 4. Limit labeledTranscript to 8 segments (most important ones).`;

    const userPrompt = `Analyze this sales call between Rep (${repName || 'unknown'}) and Lead (${contactName || 'unknown'}):\n\n${transcript}`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('[ai-analyze] Anthropic error:', anthropicRes.status, errText);
      return res.status(502).json({ error: `Anthropic API error ${anthropicRes.status}: ${errText.slice(0, 200)}` });
    }

    const anthropicData = await anthropicRes.json();
    const rawContent = anthropicData.content?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (_) {
      const match = rawContent.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { summary: rawContent };
    }

    res.json(parsed);
  } catch (err) {
    console.error('POST /api/ai-analyze error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/locations/:locationId/sms ─────────────────────────────────────
app.get('/api/locations/:locationId/sms', async (req, res) => {
  try {
    const { locationId } = req.params;
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    if (!apiKey) return res.json({ conversations: [] });

    const callHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-04-15',
    };

    const url = `${GHL_API}/conversations/search?locationId=${locationId}&lastMessageType=TYPE_SMS&limit=100`;
    const data = await ghlGet(url, callHeaders);

    const conversations = data.conversations || data.data || [];
    console.log(`[sms] location=${locationId} found ${conversations.length} SMS convos`);

    res.json({ conversations });
  } catch (err) {
    console.error('GET /api/locations/:id/sms error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/conversations/:conversationId/thread ───────────────────────────
app.get('/api/conversations/:conversationId/thread', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { locationId } = req.query;
    if (!locationId) return res.status(400).json({ error: 'locationId query param required' });

    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);

    const callHeaders = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Version: '2021-07-28',
    };

    const url = `${GHL_API}/conversations/${conversationId}/messages?limit=50`;
    const data = await ghlGet(url, callHeaders);

    // Handle nested response: { messages: { messages: [...] } }
    let messages = [];
    if (Array.isArray(data.messages)) {
      messages = data.messages;
    } else if (data.messages && Array.isArray(data.messages.messages)) {
      messages = data.messages.messages;
    }

    // Filter to SMS messages only (type 1 or TYPE_SMS)
    const smsMessages = messages.filter(m => {
      const t = (m.messageType || m.type || '');
      return String(t) === '1' || t === 'TYPE_SMS' || t === 'SMS';
    });

    // Sort by date ascending for thread view
    smsMessages.sort((a, b) => {
      const da = new Date(a.dateAdded || a.createdAt), db = new Date(b.dateAdded || b.createdAt);
      return da - db;
    });

    res.json({ messages: smsMessages.length > 0 ? smsMessages : messages });
  } catch (err) {
    console.error('GET /api/conversations/:id/thread error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── Rep Notes ───────────────────────────────────────────────────────────────
const REP_NOTES_FILE = path.join(__dirname, 'rep-notes.json');

async function loadRepNotes() {
  if (!(await fse.pathExists(REP_NOTES_FILE))) {
    await fse.writeJson(REP_NOTES_FILE, {}, { spaces: 2 });
    return {};
  }
  return fse.readJson(REP_NOTES_FILE);
}

// GET /api/reps/:repId/pipeline-stats?locationId=
app.get('/api/reps/:repId/pipeline-stats', async (req, res) => {
  try {
    const { repId } = req.params;
    const { locationId } = req.query;
    if (!locationId) return res.status(400).json({ error: 'locationId required' });

    const cacheKey = `${locationId}__`;
    const cachedEntry = oppsCache.get(cacheKey);
    const opps = cachedEntry ? (cachedEntry.data.opportunities || []) : [];

    // Fetch real stage names from GHL pipeline API (60-min cached)
    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);
    const stageNameMap = await fetchStageNameMap(locationId, locationHeaders(apiKey));

    const repOpps = opps.filter(o =>
      o.assignedTo === repId ||
      (Array.isArray(o.followers) && o.followers.includes(repId))
    );

    const stageCounts = {};
    repOpps.forEach(o => {
      // Priority: GHL pipeline API name → pipelineStageName field → raw ID → Unknown
      const name = stageNameMap[o.pipelineStageId] || o.pipelineStageName || o.pipelineStageId || 'Unknown';
      stageCounts[name] = (stageCounts[name] || 0) + 1;
    });

    res.json({ stageCounts, total: repOpps.length });
  } catch (err) {
    console.error('GET /api/reps/:repId/pipeline-stats error:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/reps/:repId/appointments?locationId=
app.get('/api/reps/:repId/appointments', async (req, res) => {
  try {
    const { repId } = req.params;
    const { locationId } = req.query;
    if (!locationId) return res.status(400).json({ error: 'locationId required' });

    const clientsData = await loadClientsConfig();
    const client = findClient(clientsData.clients, locationId);
    const apiKey = resolveLocationKey(client);

    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const url = `${GHL_API}/calendars/events?locationId=${locationId}&userId=${repId}&startTime=${now}&endTime=${now + thirtyDaysMs}`;

    let data;
    try {
      data = await ghlGet(url, locationHeaders(apiKey));
    } catch (e) {
      console.warn(`[appointments] calendar API: ${e.message}`);
      data = { events: [] };
    }

    res.json({ events: data.events || [] });
  } catch (err) {
    console.error('GET /api/reps/:repId/appointments error:', err.message);
    res.status(err.status || 500).json({ error: err.message, events: [] });
  }
});

// GET /api/rep-notes/:repId
app.get('/api/rep-notes/:repId', async (req, res) => {
  try {
    const { repId } = req.params;
    const notes = await loadRepNotes();
    res.json({ notes: notes[repId] || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/rep-notes/:repId
app.post('/api/rep-notes/:repId', async (req, res) => {
  try {
    const { repId } = req.params;
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'note required' });

    const notes = await loadRepNotes();
    if (!notes[repId]) notes[repId] = [];
    notes[repId].unshift({ note, savedAt: new Date().toISOString() });
    if (notes[repId].length > 50) notes[repId] = notes[repId].slice(0, 50);
    await fse.writeJson(REP_NOTES_FILE, notes, { spaces: 2 });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Standalone debug endpoint (no /api/ prefix — never shadowed by static) ──
app.get('/debug-opps', async (req, res) => {
  try {
    const locationId = '9oW28j2SxdPAmUhO5MDI';
    const pipelineId = 'udyl3lJvKs31tt6O01SZ';
    const apiKey = process.env.GHL_KEY_STRONG_PILATES;
    if (!apiKey) return res.status(500).json({ error: 'GHL_KEY_STRONG_PILATES secret not set' });

    const url = `${GHL_API}/opportunities/search?location_id=${locationId}&pipeline_id=${pipelineId}&limit=10`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: '2021-07-28' }
    });
    if (!r.ok) return res.status(r.status).json({ error: `GHL returned ${r.status}`, url });
    const body = await r.json();
    const opps = (body.opportunities || []).slice(0, 10).map(o => ({
      id:                o.id,
      status:            o.status,
      assignedTo:        o.assignedTo,
      followers:         o.followers,
      monetaryValue:     o.monetaryValue,
      lastStageChangeAt: o.lastStageChangeAt,
    }));
    res.json({ count: opps.length, opps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── /debug-wonopps — won opp breakdown by assignedTo (no /api/ prefix) ─────
app.get('/debug-wonopps', async (req, res) => {
  try {
    const locationId = '9oW28j2SxdPAmUhO5MDI';
    // All 4 Strong Pilates pipelines
    const pipelines = [
      { id: 'udyl3lJvKs31tt6O01SZ', name: 'Highland Village' },
      { id: 'DEs336XJX4T8J1orIqYm', name: 'Lakeview' },
      { id: 'Kz0hjzNRc8312nZQMOMw', name: 'Santa Monica' },
      { id: 'acDfCLF5rfk6FO9Wwns5', name: 'West Lake' },
    ];
    const apiKey = process.env.GHL_KEY_STRONG_PILATES;
    if (!apiKey) return res.status(500).json({ error: 'GHL_KEY_STRONG_PILATES secret not set' });

    const headers = locationHeaders(apiKey);
    let allOpps = [];
    const perPipeline = {};

    for (const pipeline of pipelines) {
      const pOpps = await fetchAllOpportunities(locationId, pipeline.id, headers);
      perPipeline[pipeline.name] = { total: pOpps.length, won: pOpps.filter(o => o.status === 'won').length };
      allOpps = allOpps.concat(pOpps);
      await sleep(300);
    }

    // Deduplicate by id
    const seen = new Set();
    allOpps = allOpps.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });

    const wonOpps = allOpps.filter(o => o.status === 'won');
    const wonByAssignedTo = {};
    wonOpps.forEach(o => {
      const key = o.assignedTo || (Array.isArray(o.followers) && o.followers.length ? `follower:${o.followers[0]}` : 'unattributed');
      wonByAssignedTo[key] = (wonByAssignedTo[key] || 0) + 1;
    });

    res.json({
      totalOpps: allOpps.length,
      totalWon: wonOpps.length,
      perPipeline,
      wonByAssignedTo,
      first5WonOpps: wonOpps.slice(0, 5).map(o => ({
        id: o.id,
        status: o.status,
        assignedTo: o.assignedTo,
        followers: o.followers,
        monetaryValue: o.monetaryValue,
        lastStageChangeAt: o.lastStageChangeAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/debug/sold-breakdown ───────────────────────────────────────────
app.get('/api/debug/sold-breakdown', async (req, res) => {
  try {
    const clientsData = await loadClientsConfig();
    const result = [];
    let grandTotalWon = 0;

    for (const cl of clientsData.clients) {
      const apiKey = resolveLocationKey(cl);
      if (!apiKey) {
        result.push({ client: cl.name, locationId: cl.locationId, apiKey: 'missing', pipelines: [], clientTotalWon: 0 });
        continue;
      }
      const headers = locationHeaders(apiKey);
      const pipelines = [];
      let clientTotalWon = 0;

      if (!cl.pipelines || cl.pipelines.length === 0) {
        const won = await fetchAllWonOpportunities(cl.locationId, null, headers);
        const monetaryValueTotal = won.reduce((s, o) => s + (o.monetaryValue > 0 ? o.monetaryValue : 0), 0);
        pipelines.push({ name: '(default)', pipelineId: null, wonTotal: won.length, monetaryValueTotal });
        clientTotalWon = won.length;
      } else {
        for (const p of cl.pipelines) {
          const won = await fetchAllWonOpportunities(cl.locationId, p.pipelineId, headers);
          const monetaryValueTotal = won.reduce((s, o) => s + (o.monetaryValue > 0 ? o.monetaryValue : 0), 0);
          pipelines.push({ name: p.name, pipelineId: p.pipelineId, wonTotal: won.length, monetaryValueTotal });
          clientTotalWon += won.length;
          await sleep(300);
        }
      }

      grandTotalWon += clientTotalWon;
      result.push({ client: cl.name, locationId: cl.locationId, pipelines, clientTotalWon });
    }

    res.json({ clients: result, grandTotalWon });
  } catch (err) {
    console.error('GET /api/debug/sold-breakdown error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/refresh-status ─────────────────────────────────────────────────
app.get('/api/refresh-status', (req, res) => {
  res.json({ refreshing: Array.from(refreshingLocations) });
});

// ─── GET /api/debug/cache-stats ──────────────────────────────────────────────
app.get('/api/debug/cache-stats', (req, res) => {
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  let freshCount = 0, staleCount = 0;
  let oldestEntry = null, newestEntry = null;
  callEnrichmentCache.forEach(entry => {
    const t = new Date(entry.enrichedAt).getTime();
    if (now - t < SEVEN_DAYS_MS) freshCount++; else staleCount++;
    if (!oldestEntry || t < new Date(oldestEntry).getTime()) oldestEntry = entry.enrichedAt;
    if (!newestEntry || t > new Date(newestEntry).getTime()) newestEntry = entry.enrichedAt;
  });
  res.json({ totalCached: callEnrichmentCache.size, freshCount, staleCount, oldestEntry, newestEntry });
});

// ─── Static files + SPA fallback (MUST be last — after all /api/* routes) ───
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 5000;
loadCallEnrichmentCache().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Revryze Dashboard running on http://0.0.0.0:${PORT}`);
  });
});
