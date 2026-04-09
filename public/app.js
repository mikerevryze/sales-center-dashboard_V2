(function () {
  'use strict';

  // ─── DOM ────────────────────────────────────────────────────────────────────
  const $loadingOverlay = document.getElementById('loading-overlay');
  const $loadingMsg     = document.getElementById('loading-msg');
  const $errorBanner    = document.getElementById('error-banner');
  const $clientSelect   = document.getElementById('client-select');
  const $locationSelect = document.getElementById('location-select');
  const $dateSelect     = document.getElementById('date-select');
  const $refreshBtn     = document.getElementById('refresh-btn');
  const $mSold          = document.getElementById('m-sold');
  const $mRevenue       = document.getElementById('m-revenue');
  const $mAppts         = document.getElementById('m-appts');
  const $mCalls         = document.getElementById('m-calls');
  const $mRate          = document.getElementById('m-rate');
  const $repSort        = document.getElementById('rep-sort');
  const $repLbList      = document.getElementById('rep-lb-list');
  const $clientSort     = document.getElementById('client-sort');
  const $clientLbList   = document.getElementById('client-lb-list');
  const $callLogTitle   = document.getElementById('call-log-title');
  const $dirTabs        = document.getElementById('dir-tabs');
  const $callList       = document.getElementById('call-log-list');
  const $callDetail     = document.getElementById('call-detail-panel');
  const $callMeta       = document.getElementById('call-meta');
  const $closeDetailBtn = document.getElementById('close-detail-btn');
  const $playBtn        = document.getElementById('play-btn');
  const $progressWrap   = document.getElementById('progress-wrap');
  const $progressFill   = document.getElementById('progress-fill');
  const $timeLabel      = document.getElementById('time-label');
  const $audioEl        = document.getElementById('audio-el');
  const $transcriptText = document.getElementById('transcript-text');

  // ─── App State ──────────────────────────────────────────────────────────────
  const appData = {
    config: { clients: [], reps: [] },
    opportunities: [],
    calls: [],
    fetchedUsers: [],
    repCallsMap: {},
    callDurations: {},  // { [convId]: seconds } — cached per-conversation call durations
  };

  const filters = {
    clientId: 'all',
    pipelineId: 'all',
    days: 30,
    repId: null,
    callDir: 'all',
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function showError(msg) {
    $errorBanner.textContent = msg;
    $errorBanner.classList.remove('hidden');
    setTimeout(() => $errorBanner.classList.add('hidden'), 10000);
  }

  async function apiFetch(path) {
    const res = await fetch(path);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function getDateCutoff() {
    const d = new Date();
    d.setDate(d.getDate() - filters.days);
    return d;
  }

  function parseDate(val) {
    if (!val) return null;
    if (typeof val === 'number') return new Date(val);
    return new Date(val);
  }

  function formatDate(val) {
    const d = parseDate(val);
    if (!d || isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatCurrency(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function formatTalkTime(sec) {
    if (!sec || isNaN(sec) || sec === 0) return '0m talk';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m talk`;
    return `${m}m talk`;
  }

  function initials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function spinnerRow(msg) {
    return `<div class="loading-row"><span class="spinner"></span>${msg || ''}</div>`;
  }

  function emptyState(msg) {
    return `<div class="empty-state">${msg}</div>`;
  }

  // ─── Call Direction / Outcome ────────────────────────────────────────────────
  function getCallDir(call) {
    const d = (call.direction || '').toLowerCase();
    if (d === 'outbound' || d === 'outgoing') return 'outbound';
    if (d === 'inbound' || d === 'incoming') return 'inbound';
    const missed = (call.status || '').toLowerCase() === 'no-answer' || call.missed === true;
    if (missed) return 'missed';
    return 'outbound';
  }

  function isAppointmentStage(stageName) {
    if (!stageName) return false;
    const s = stageName.toLowerCase();
    return s.includes('appt') || s.includes('appointment') ||
      s.includes('booked') || s.includes('scheduled') || s.includes('booking');
  }

  // ─── Filter Helpers ──────────────────────────────────────────────────────────
  function filteredOpps() {
    const cutoff = getDateCutoff();
    return appData.opportunities.filter(o => {
      if (filters.clientId !== 'all' && o._clientId !== filters.clientId) return false;
      if (filters.pipelineId !== 'all' && o.pipelineId !== filters.pipelineId) return false;
      const d = parseDate(o.dateAdded || o.createdAt || o.dateUpdated);
      if (d && d < cutoff) return false;
      return true;
    });
  }

  function filteredCalls() {
    const cutoff = getDateCutoff();
    return appData.calls.filter(c => {
      if (filters.clientId !== 'all' && c._clientId !== filters.clientId) return false;
      if (filters.pipelineId !== 'all') {
        const clientsWithPipeline = appData.config.clients.filter(cl =>
          cl.pipelines.some(p => p.pipelineId === filters.pipelineId)
        ).map(cl => cl.locationId);
        if (!clientsWithPipeline.includes(c._clientId)) return false;
      }
      const d = parseDate(c.dateAdded);
      if (d && d < cutoff) return false;
      if (filters.repId && c.userId !== filters.repId) return false;
      return true;
    });
  }

  function buildContactOppMap(opps) {
    const map = {};
    opps.forEach(o => {
      const cid = o.contactId || (o.contact && o.contact.id);
      if (!cid) return;
      if (!map[cid]) map[cid] = [];
      map[cid].push(o);
    });
    return map;
  }

  // ─── Data Loading ────────────────────────────────────────────────────────────
  async function fetchAll() {
    $loadingOverlay.classList.remove('hidden');
    $loadingMsg.textContent = 'Loading config…';

    try {
      const config = await apiFetch('/api/config');
      appData.config = config;

      const { clients, reps } = config;

      if (clients.length === 0) {
        $loadingOverlay.classList.add('hidden');
        showError('No clients configured. Add entries to clients-config.json to get started.');
        renderAll();
        return;
      }

      $loadingMsg.textContent = `Fetching data for ${clients.length} client${clients.length > 1 ? 's' : ''}…`;

      const since = new Date();
      since.setDate(since.getDate() - 90);
      const startDate = since.toISOString();

      const oppFetches = clients.flatMap(client =>
        client.pipelines.length > 0
          ? client.pipelines.map(p =>
              apiFetch(`/api/locations/${client.locationId}/opportunities?pipelineId=${encodeURIComponent(p.pipelineId)}`)
                .then(d => ({
                  clientId: client.locationId,
                  pipelineId: p.pipelineId,
                  opportunities: d.opportunities || [],
                  error: null,
                }))
                .catch(err => ({ clientId: client.locationId, pipelineId: p.pipelineId, opportunities: [], error: err.message }))
            )
          : [
              apiFetch(`/api/locations/${client.locationId}/opportunities`)
                .then(d => ({
                  clientId: client.locationId,
                  pipelineId: null,
                  opportunities: d.opportunities || [],
                  error: null,
                }))
                .catch(err => ({ clientId: client.locationId, pipelineId: null, opportunities: [], error: err.message }))
            ]
      );

      const callFetches = clients.map(client =>
        apiFetch(`/api/locations/${client.locationId}/calls`)
          .then(d => ({
            clientId: client.locationId,
            calls: d.calls || [],
            error: null,
          }))
          .catch(err => ({ clientId: client.locationId, calls: [], error: err.message }))
      );

      const [oppResults, callResults] = await Promise.all([
        Promise.all(oppFetches),
        Promise.all(callFetches),
      ]);

      appData.opportunities = [];
      oppResults.forEach(r => {
        if (r.error) showError(`Opportunities for ${r.clientId}: ${r.error}`);
        r.opportunities.forEach(o => {
          appData.opportunities.push({ ...o, _clientId: r.clientId, _pipelineId: r.pipelineId });
        });
      });

      appData.calls = [];
      callResults.forEach(r => {
        if (r.error) showError(`Calls for ${r.clientId}: ${r.error}`);
        r.calls.forEach(c => {
          appData.calls.push({ ...c, _clientId: r.clientId });
        });
      });
      // Deduplicate by conversationId
      {
        const seen = new Map();
        appData.calls = appData.calls.filter(c => {
          const key = c.conversationId;
          if (!key || seen.has(key)) return false;
          seen.set(key, true);
          return true;
        });
      }

      // Fetch users for console reference logging
      const userFetches = clients
        .filter(c => c.locationId)
        .map(client =>
          apiFetch(`/api/locations/${client.locationId}/users`)
            .then(d => ({
              locationId: client.locationId,
              clientName: client.name,
              users: d.users || [],
            }))
            .catch(() => ({ locationId: client.locationId, clientName: client.name, users: [] }))
        );

      const userResults = await Promise.all(userFetches);
      appData.fetchedUsers = [];
      userResults.forEach(r => {
        r.users.forEach(u => {
          appData.fetchedUsers.push({
            id: u.id,
            name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
            email: u.email || '',
            locationId: r.locationId,
            clientName: r.clientName,
          });
        });
      });

      // Log all fetched users so IDs can be copied into reps-config.json
      if (appData.fetchedUsers.length > 0) {
        console.log('[Revryze] Fetched GHL users — copy IDs into reps-config.json:');
        appData.fetchedUsers.forEach(u => {
          console.log(`  [${u.clientName}] id: "${u.id}"  name: "${u.name}"  email: "${u.email}"`);
        });
        console.log('[Revryze] reps-config.json format:', JSON.stringify(
          appData.fetchedUsers.map(u => ({ id: u.id, name: u.name, email: u.email })), null, 2
        ));
      }

      populateClientDropdown();
      renderAll();
    } catch (err) {
      showError('Failed to load dashboard: ' + err.message);
    } finally {
      $loadingOverlay.classList.add('hidden');
    }
  }

  // ─── Dropdowns ───────────────────────────────────────────────────────────────
  function populateClientDropdown() {
    $clientSelect.innerHTML = '<option value="all">All clients</option>';
    appData.config.clients.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.locationId;
      opt.textContent = c.name;
      $clientSelect.appendChild(opt);
    });
    $clientSelect.value = filters.clientId;
    populateLocationDropdown();
  }

  function populateLocationDropdown() {
    // Always rebuild from fresh config data
    const allClients = appData.config.clients || [];
    const selectedClients = filters.clientId === 'all'
      ? allClients
      : allClients.filter(c => c.locationId === filters.clientId);

    // Flatten all pipelines for the selected client(s)
    const pipelines = [];
    selectedClients.forEach(client => {
      (client.pipelines || []).forEach(p => {
        pipelines.push({
          pipelineId: p.pipelineId,
          label: filters.clientId === 'all' ? `${client.name} — ${p.name}` : p.name,
        });
      });
    });

    // Rebuild options
    $locationSelect.innerHTML = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'all';
    defaultOpt.textContent = 'All locations';
    $locationSelect.appendChild(defaultOpt);

    pipelines.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.pipelineId;
      opt.textContent = p.label;
      $locationSelect.appendChild(opt);
    });

    // Disable when no pipelines are available for selected client
    $locationSelect.disabled = pipelines.length === 0;

    // Restore selected value if still valid, otherwise reset
    const validIds = pipelines.map(p => p.pipelineId);
    if (filters.pipelineId !== 'all' && validIds.includes(filters.pipelineId)) {
      $locationSelect.value = filters.pipelineId;
    } else {
      filters.pipelineId = 'all';
      $locationSelect.value = 'all';
    }
  }

  // ─── Render All ──────────────────────────────────────────────────────────────
  function renderAll() {
    const opps = filteredOpps();
    const calls = filteredCalls();
    const contactOppMap = buildContactOppMap(opps);
    renderMetrics(opps, calls);
    renderRepLeaderboard(opps, calls);
    renderClientLeaderboard(opps, calls);
    renderCallLog(calls, contactOppMap);
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────────
  function renderMetrics(opps, calls) {
    const sold = opps.filter(o => (o.status || '').toLowerCase() === 'won').length;
    const revenue = opps
      .filter(o => (o.status || '').toLowerCase() === 'won')
      .reduce((s, o) => s + parseFloat(o.monetaryValue || o.value || 0), 0);
    const appts = opps.filter(o =>
      isAppointmentStage(o.pipelineStage || o.stageName || o.stage || '')
    ).length;
    const totalCalls = calls.length;
    const rateDenom = totalCalls > 0 ? totalCalls : opps.length;
    const rate = rateDenom > 0 ? ((sold / rateDenom) * 100).toFixed(1) : '0.0';

    $mSold.textContent = sold;
    $mRevenue.textContent = formatCurrency(revenue);
    $mAppts.textContent = appts;
    $mCalls.textContent = totalCalls;
    $mRate.textContent = rate + '%';
  }

  // ─── Rep Leaderboard ─────────────────────────────────────────────────────────
  function computeRepStats(repId, opps, calls) {
    const repOpps = opps.filter(o =>
      (o.assignedTo === repId) ||
      (o.contact && o.contact.id && calls.some(c => c.contactId === o.contact.id && c.userId === repId))
    );

    // Count calls where the call message's userId matches this rep
    const repCalls = calls.filter(c => c.userId === repId);

    const sold = repOpps.filter(o => (o.status || '').toLowerCase() === 'won').length;
    const revenue = repOpps
      .filter(o => (o.status || '').toLowerCase() === 'won')
      .reduce((s, o) => s + parseFloat(o.monetaryValue || o.value || 0), 0);
    const appts = repOpps.filter(o =>
      isAppointmentStage(o.pipelineStage || o.stageName || o.stage || '')
    ).length;
    const totalCalls = repCalls.length;
    const totalDurationSec = repCalls.reduce((sum, c) => sum + (c.duration || 0), 0);
    const crDenom = totalCalls > 0 ? totalCalls : repOpps.length;
    const closeRate = crDenom > 0 ? ((sold / crDenom) * 100).toFixed(1) : '0.0';

    return { sold, revenue, appointments: appts, calls: totalCalls, totalDurationSec, closeRate: parseFloat(closeRate) };
  }

  function renderRepLeaderboard(opps, calls) {
    const reps = appData.config.reps || [];

    if (reps.length === 0) {
      $repLbList.innerHTML = emptyState('Add your closers to reps-config.json to populate the leaderboard');
      return;
    }

    const sortKey = $repSort.value;
    const stats = reps.map(rep => ({
      rep,
      stats: computeRepStats(rep.id, opps, calls),
    }));

    const statFor = (s, key) => {
      if (key === 'sold') return s.sold;
      if (key === 'revenue') return s.revenue;
      if (key === 'appointments') return s.appointments;
      if (key === 'calls') return s.calls;
      return 0;
    };

    stats.sort((a, b) => statFor(b.stats, sortKey) - statFor(a.stats, sortKey));

    $repLbList.innerHTML = stats.map(({ rep, stats: s }, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const active = filters.repId === rep.id ? 'active' : '';
      const statVal = sortKey === 'revenue'
        ? formatCurrency(s.revenue)
        : statFor(s, sortKey);

      return `
        <div class="lb-row ${active}" data-rep-id="${rep.id}">
          <div class="lb-rank ${rankClass}">${rank}</div>
          <div class="lb-avatar">${initials(rep.name)}</div>
          <div class="lb-info">
            <div class="lb-name">${escHtml(rep.name)}</div>
            <div class="lb-sub">${s.calls} calls &middot; ${formatTalkTime(s.totalDurationSec)}</div>
          </div>
          <div class="lb-stat">${statVal}</div>
        </div>`;
    }).join('');

    $repLbList.querySelectorAll('.lb-row').forEach(row => {
      row.addEventListener('click', () => {
        const repId = row.dataset.repId;
        if (filters.repId === repId) {
          filters.repId = null;
        } else {
          filters.repId = repId;
        }
        filters.callDir = 'all';
        $dirTabs.querySelectorAll('.tab').forEach(t =>
          t.classList.toggle('active', t.dataset.dir === 'all')
        );
        const selectedCalls = filteredCalls();
        const oppsNow = filteredOpps();
        const contactOppMap = buildContactOppMap(oppsNow);
        updateCallLogTitle();
        renderRepLeaderboard(oppsNow, selectedCalls);
        renderCallLog(selectedCalls, contactOppMap);
        closeCallDetail();
      });
    });
  }

  // ─── Client Leaderboard ──────────────────────────────────────────────────────
  function renderClientLeaderboard(opps, calls) {
    const { clients, reps } = appData.config;

    if (!clients || clients.length === 0) {
      $clientLbList.innerHTML = emptyState('No clients configured');
      return;
    }

    const sortKey = $clientSort.value;

    const rows = clients.map(client => {
      const clientOpps = opps.filter(o => o._clientId === client.locationId);
      const clientCalls = calls.filter(c => c._clientId === client.locationId);
      const sold = clientOpps.filter(o => (o.status || '').toLowerCase() === 'won').length;
      const revenue = clientOpps
        .filter(o => (o.status || '').toLowerCase() === 'won')
        .reduce((s, o) => s + parseFloat(o.monetaryValue || o.value || 0), 0);
      const totalCalls = clientCalls.length;
      const closeRateDenom = totalCalls > 0 ? totalCalls : clientOpps.length;
      const closeRate = closeRateDenom > 0 ? parseFloat(((sold / closeRateDenom) * 100).toFixed(1)) : 0;
      const repIds = new Set(clientCalls.map(c => c.assignedTo).filter(Boolean));
      const activeReps = reps ? reps.filter(r => repIds.has(r.id)).length : 0;
      return { client, sold, revenue, closeRate, activeReps, totalCalls };
    });

    const sortVal = r => sortKey === 'sold' ? r.sold : sortKey === 'revenue' ? r.revenue : r.closeRate;
    rows.sort((a, b) => sortVal(b) - sortVal(a));

    $clientLbList.innerHTML = rows.map(r => {
      const active = filters.clientId === r.client.locationId ? 'active' : '';
      return `
        <div class="lb-row lb-row-client ${active}" data-client-id="${r.client.locationId}">
          <div class="lb-info lb-client-name">
            <div class="lb-name">${escHtml(r.client.name)}</div>
            <div class="lb-sub">${r.activeReps} active rep${r.activeReps !== 1 ? 's' : ''}</div>
          </div>
          <div class="lb-client-stats">
            <div class="lb-client-stat">
              <div class="lb-client-stat-val">${r.sold}</div>
              <div class="lb-client-stat-lbl">Sold</div>
            </div>
            <div class="lb-client-stat">
              <div class="lb-client-stat-val">${formatCurrency(r.revenue)}</div>
              <div class="lb-client-stat-lbl">Revenue</div>
            </div>
            <div class="lb-client-stat">
              <div class="lb-client-stat-val">${r.closeRate}%</div>
              <div class="lb-client-stat-lbl">Close</div>
            </div>
          </div>
        </div>`;
    }).join('');

    $clientLbList.querySelectorAll('.lb-row').forEach(row => {
      row.addEventListener('click', () => {
        const clientId = row.dataset.clientId;
        if (filters.clientId === clientId) {
          filters.clientId = 'all';
        } else {
          filters.clientId = clientId;
        }
        filters.pipelineId = 'all';
        filters.repId = null;
        filters.callDir = 'all';
        $clientSelect.value = filters.clientId;
        populateLocationDropdown();
        $locationSelect.value = 'all';
        $dirTabs.querySelectorAll('.tab').forEach(t =>
          t.classList.toggle('active', t.dataset.dir === 'all')
        );
        updateCallLogTitle();
        closeCallDetail();
        renderAll();
      });
    });
  }

  // ─── Call Log ────────────────────────────────────────────────────────────────
  function updateCallLogTitle() {
    if (filters.repId) {
      const rep = (appData.config.reps || []).find(r => r.id === filters.repId);
      $callLogTitle.textContent = rep ? `${rep.name} — Calls` : 'Call Log';
    } else {
      $callLogTitle.textContent = 'All Calls';
    }
  }

  function callOutcomeBadge(call, contactOppMap) {
    const cid = call.contactId;
    const opps = cid ? (contactOppMap[cid] || []) : [];
    if (opps.length === 0) {
      const dir = getCallDir(call);
      const label = dir === 'outbound' ? 'Outbound' : dir === 'missed' ? 'Missed' : 'Inbound';
      return `<span class="badge badge-gray">${label}</span>`;
    }
    const hasWon = opps.some(o => {
      if ((o.status || '').toLowerCase() === 'won') return true;
      const stage = (o.pipelineStage || o.stageName || o.stage || '').toLowerCase();
      return stage === 'closed won';
    });
    if (hasWon) return `<span class="badge badge-sold">Sold</span>`;
    return `<span class="badge badge-pipeline">In Pipeline</span>`;
  }

  function renderCallLog(calls, contactOppMap) {
    updateCallLogTitle();

    let displayed = calls;
    if (filters.callDir !== 'all') {
      displayed = calls.filter(c => getCallDir(c) === filters.callDir);
    }

    if (displayed.length === 0) {
      $callList.innerHTML = emptyState('No calls found for this period');
      return;
    }

    displayed.sort((a, b) => {
      const da = parseDate(a.dateAdded);
      const db = parseDate(b.dateAdded);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db - da;
    });

    $callList.innerHTML = displayed.map(call => {
      const dir = getCallDir(call);
      const contactName = call.contactName || call.phone || 'Unknown';
      const dateStr = formatDate(call.dateAdded);
      const badge = callOutcomeBadge(call, contactOppMap);
      return `
        <div class="call-row" data-conv-id="${escHtml(call.conversationId)}" data-client-id="${escHtml(call._clientId)}">
          <div class="dir-dot ${dir}"></div>
          <div class="call-info">
            <div class="call-contact">${escHtml(contactName)}</div>
            <div class="call-time">${dateStr} &middot; <span class="call-dur">—</span></div>
          </div>
          ${badge}
        </div>`;
    }).join('');

    $callList.querySelectorAll('.call-row').forEach(row => {
      row.addEventListener('click', () => {
        $callList.querySelectorAll('.call-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        openCallDetail(row.dataset.convId, row.dataset.clientId, row);
      });
    });
  }

  // ─── Call Detail ─────────────────────────────────────────────────────────────
  async function openCallDetail(convId, clientId, row) {
    $callDetail.classList.remove('hidden');
    resetAudioPlayer();
    $transcriptText.textContent = 'Loading…';

    const call = appData.calls.find(c => c.conversationId === convId);
    const clientCfg = appData.config.clients.find(c => c.locationId === clientId);
    const contactName = call ? (call.contactName || call.phone || 'Unknown') : 'Unknown';
    const phone = call ? (call.phone || '—') : '—';
    const dateStr = call ? formatDate(call.dateAdded) : '';
    const clientName = clientCfg ? clientCfg.name : (clientId || '');

    $callMeta.innerHTML = `
      <strong>${escHtml(contactName)}</strong>
      <span>${escHtml(phone)}</span>
      <span>${dateStr}</span>
      ${clientName ? `<span>${escHtml(clientName)}</span>` : ''}
    `;

    console.log(`[openCallDetail] convId=${convId} clientId=${clientId}`);

    // Fetch messages for this conversation to get messageId, duration, status
    // If already cached on the call object from a previous click, skip the fetch
    let messageId = (call && call.messageId) || null;
    if (!messageId) {
      try {
        const fetchUrl = `/api/conversations/${encodeURIComponent(convId)}/messages?locationId=${encodeURIComponent(clientId)}`;
        console.log(`[openCallDetail] fetching messages: ${fetchUrl}`);
        const msgInfo = await apiFetch(fetchUrl);
        console.log(`[openCallDetail] messages response:`, msgInfo);
        messageId = msgInfo.messageId || null;
        console.log(`[openCallDetail] messageId resolved: ${messageId}`);

        // Update duration in the call row
        if (row) {
          const durSpan = row.querySelector('.call-dur');
          if (durSpan) {
            const dur = msgInfo.duration;
            durSpan.textContent = (dur && dur > 0)
              ? `${Math.floor(dur / 60)}m ${String(Math.floor(dur % 60)).padStart(2, '0')}s`
              : '—';
          }
        }

        // Cache messageId back onto the call object so repeat clicks skip re-fetch
        if (call && messageId) call.messageId = messageId;
      } catch (err) {
        console.error(`[openCallDetail] failed to fetch messages:`, err);
      }
    } else {
      console.log(`[openCallDetail] using cached messageId: ${messageId}`);
    }

    // Load recording
    if (messageId) {
      const recUrl = `/api/recording?messageId=${encodeURIComponent(messageId)}&locationId=${encodeURIComponent(clientId)}`;
      console.log(`[openCallDetail] setting audio src: ${recUrl}`);
      $audioEl.src = recUrl;
      $audioEl.load();
    } else {
      console.warn(`[openCallDetail] no messageId — recording + transcript skipped`);
    }

    // Load transcript
    if (messageId) {
      try {
        const transcriptUrl = `/api/transcription?messageId=${encodeURIComponent(messageId)}&locationId=${encodeURIComponent(clientId)}`;
        console.log(`[openCallDetail] fetching transcript: ${transcriptUrl}`);
        const tData = await apiFetch(transcriptUrl);
        console.log(`[openCallDetail] transcript response:`, tData);
        const text = tData.transcriptionText || tData.text || tData.transcript ||
          (typeof tData === 'string' ? tData : null);
        $transcriptText.textContent = text || 'No transcript available';
      } catch (err) {
        console.error(`[openCallDetail] transcript fetch failed:`, err);
        $transcriptText.textContent = 'No transcript available';
      }
    } else {
      $transcriptText.textContent = 'No transcript available';
    }
  }

  function closeCallDetail() {
    $callDetail.classList.add('hidden');
    resetAudioPlayer();
    $callList.querySelectorAll('.call-row').forEach(r => r.classList.remove('active'));
  }

  function resetAudioPlayer() {
    $audioEl.pause();
    $audioEl.removeAttribute('src');
    $audioEl.load();
    $progressFill.style.width = '0%';
    $timeLabel.textContent = '0:00 / 0:00';
    $playBtn.innerHTML = '&#9654;';
  }

  // ─── Audio Player ────────────────────────────────────────────────────────────
  $playBtn.addEventListener('click', () => {
    if (!$audioEl.src || $audioEl.src === location.href) return;
    if ($audioEl.paused) {
      $audioEl.play().catch(() => {});
      $playBtn.innerHTML = '&#9646;&#9646;';
    } else {
      $audioEl.pause();
      $playBtn.innerHTML = '&#9654;';
    }
  });

  $audioEl.addEventListener('timeupdate', () => {
    if (!$audioEl.duration || isNaN($audioEl.duration)) return;
    const pct = ($audioEl.currentTime / $audioEl.duration) * 100;
    $progressFill.style.width = pct + '%';
    $timeLabel.textContent = formatDuration($audioEl.currentTime) + ' / ' + formatDuration($audioEl.duration);
  });

  $audioEl.addEventListener('ended', () => {
    $playBtn.innerHTML = '&#9654;';
  });

  $progressWrap.addEventListener('click', e => {
    if (!$audioEl.duration || isNaN($audioEl.duration)) return;
    const rect = $progressWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    $audioEl.currentTime = pct * $audioEl.duration;
  });

  // ─── Security Helper ─────────────────────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ─── Event Listeners ─────────────────────────────────────────────────────────
  $clientSelect.addEventListener('change', () => {
    filters.clientId = $clientSelect.value;
    filters.pipelineId = 'all';
    filters.repId = null;
    filters.callDir = 'all';
    $dirTabs.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.dir === 'all')
    );
    populateLocationDropdown();
    $locationSelect.value = 'all';
    closeCallDetail();
    renderAll();
  });

  $locationSelect.addEventListener('change', () => {
    filters.pipelineId = $locationSelect.value;
    filters.repId = null;
    filters.callDir = 'all';
    $dirTabs.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.dir === 'all')
    );
    closeCallDetail();
    renderAll();
  });

  $dateSelect.addEventListener('change', () => {
    filters.days = parseInt($dateSelect.value, 10);
    closeCallDetail();
    renderAll();
  });

  $refreshBtn.addEventListener('click', () => {
    filters.repId = null;
    filters.callDir = 'all';
    $dirTabs.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.dir === 'all')
    );
    closeCallDetail();
    fetchAll();
  });

  $repSort.addEventListener('change', () => {
    const opps = filteredOpps();
    const calls = filteredCalls();
    renderRepLeaderboard(opps, calls);
  });

  $clientSort.addEventListener('change', () => {
    const opps = filteredOpps();
    const calls = filteredCalls();
    renderClientLeaderboard(opps, calls);
  });

  $dirTabs.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    filters.callDir = tab.dataset.dir;
    $dirTabs.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.dir === filters.callDir)
    );
    const opps = filteredOpps();
    const calls = filteredCalls();
    const contactOppMap = buildContactOppMap(opps);
    renderCallLog(calls, contactOppMap);
  });

  $closeDetailBtn.addEventListener('click', closeCallDetail);

  // ─── Init ────────────────────────────────────────────────────────────────────
  fetchAll();
})();
