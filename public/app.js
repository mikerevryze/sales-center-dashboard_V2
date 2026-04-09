(function () {
  'use strict';

  // ─── DOM ────────────────────────────────────────────────────────────────────
  const $loadingOverlay   = document.getElementById('loading-overlay');
  const $loadingMsg       = document.getElementById('loading-msg');
  const $errorBanner      = document.getElementById('error-banner');
  const $refreshBtn       = document.getElementById('refresh-btn');

  // Nav tabs
  const $navTabs          = document.querySelectorAll('.nav-tab');
  const $tabSections      = document.querySelectorAll('.tab-section');

  // Command Center
  const $ccClientSelect   = document.getElementById('cc-client-select');
  const $ccLocationSelect = document.getElementById('cc-location-select');
  const $ccDateSelect     = document.getElementById('cc-date-select');
  const $mSold            = document.getElementById('m-sold');
  const $mRevenue         = document.getElementById('m-revenue');
  const $mCalls           = document.getElementById('m-calls');
  const $mTalktime        = document.getElementById('m-talktime');
  const $mRate            = document.getElementById('m-rate');
  const $repSort          = document.getElementById('rep-sort');
  const $repLbList        = document.getElementById('rep-lb-list');
  const $clientSort       = document.getElementById('client-sort');
  const $clientLbList     = document.getElementById('client-lb-list');

  // Calls tab
  const $callsSearch      = document.getElementById('calls-search');
  const $callsRepSelect   = document.getElementById('calls-rep-select');
  const $callsClientSelect= document.getElementById('calls-client-select');
  const $callsDateSelect  = document.getElementById('calls-date-select');
  const $dirTabs          = document.getElementById('dir-tabs');
  const $callLogTitle     = document.getElementById('call-log-title');
  const $callLogCount     = document.getElementById('call-log-count');
  const $callList         = document.getElementById('call-log-list');
  const $callDetail       = document.getElementById('call-detail-panel');
  const $callMeta         = document.getElementById('call-meta');
  const $closeDetailBtn   = document.getElementById('close-detail-btn');
  const $playBtn          = document.getElementById('play-btn');
  const $progressWrap     = document.getElementById('progress-wrap');
  const $progressFill     = document.getElementById('progress-fill');
  const $timeLabel        = document.getElementById('time-label');
  const $audioEl          = document.getElementById('audio-el');
  const $transcriptText   = document.getElementById('transcript-text');
  const $aiAnalyzeBtn     = document.getElementById('ai-analyze-btn');
  const $aiResults        = document.getElementById('ai-results');
  const $existingNote     = document.getElementById('existing-note');
  const $managerNoteText  = document.getElementById('manager-note-text');
  const $saveNoteBtn      = document.getElementById('save-note-btn');
  const $flagToggle       = document.getElementById('flag-toggle');

  // SMS tab
  const $smsSearch        = document.getElementById('sms-search');
  const $smsClientSelect  = document.getElementById('sms-client-select');
  const $smsList          = document.getElementById('sms-list');
  const $smsCount         = document.getElementById('sms-count');
  const $smsThreadPanel   = document.getElementById('sms-thread-panel');
  const $smsThreadContact = document.getElementById('sms-thread-contact');
  const $smsThreadMessages= document.getElementById('sms-thread-messages');
  const $closeSmsBtn      = document.getElementById('close-sms-btn');

  // SPIFF tab
  const $spiffWeekSelect  = document.getElementById('spiff-week-select');
  const $spiffBannerRange = document.getElementById('spiff-banner-range');
  const $spiffLbList      = document.getElementById('spiff-lb-list');

  // ─── App State ──────────────────────────────────────────────────────────────
  const appData = {
    config: { clients: [], reps: [] },
    opportunities: [],
    calls: [],
    smsConvos: [],
    fetchedUsers: [],
  };

  const filters = {
    clientId: 'all',
    pipelineId: 'all',
    days: 30,
    repId: null,
    callDir: 'all',
    callSearch: '',
    callsDays: 30,
  };

  let currentCallConvId  = null;
  let currentCallLocId   = null;
  let currentMessageId   = null;
  let activeTab          = 'command';

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function showError(msg) {
    $errorBanner.textContent = msg;
    $errorBanner.classList.remove('hidden');
    setTimeout(() => $errorBanner.classList.add('hidden'), 10000);
  }

  async function apiFetch(path, opts) {
    const res = await fetch(path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function getDateCutoff(days) {
    const d = new Date();
    d.setDate(d.getDate() - (days || filters.days));
    return d;
  }

  function parseDate(val) {
    if (!val) return null;
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
    if (!sec || isNaN(sec) || !isFinite(sec)) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function formatTalkTime(sec) {
    if (!sec || isNaN(sec) || sec === 0) return '0m';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function formatTalkTimeFull(sec) {
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

  function emptyState(msg) {
    return `<div class="empty-state">${msg}</div>`;
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

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
    return s.includes('appt') || s.includes('appointment') || s.includes('booked') || s.includes('scheduled');
  }

  function getWeekBounds(offsetWeeks) {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + (offsetWeeks || 0) * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  function formatWeekLabel(start, end) {
    const opts = { month: 'short', day: 'numeric' };
    return start.toLocaleDateString('en-US', opts) + ' – ' + end.toLocaleDateString('en-US', opts);
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
    const cutoff = getDateCutoff(filters.callsDays);
    const search = filters.callSearch.toLowerCase().trim();
    return appData.calls.filter(c => {
      if (filters.clientId !== 'all' && c._clientId !== filters.clientId) return false;
      if (filters.pipelineId !== 'all') {
        const clientsWithPipeline = appData.config.clients
          .filter(cl => cl.pipelines.some(p => p.pipelineId === filters.pipelineId))
          .map(cl => cl.locationId);
        if (!clientsWithPipeline.includes(c._clientId)) return false;
      }
      const d = parseDate(c.dateAdded);
      if (d && d < cutoff) return false;
      if (filters.repId && c.userId !== filters.repId) return false;
      if (search) {
        const name = (c.contactName || c.phone || '').toLowerCase();
        if (!name.includes(search)) return false;
      }
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

  function getRepName(userId) {
    if (!userId) return null;
    const rep = (appData.config.reps || []).find(r => r.id === userId);
    return rep ? rep.name : null;
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
        showError('No clients configured.');
        renderAll();
        return;
      }

      $loadingMsg.textContent = `Fetching data for ${clients.length} client${clients.length > 1 ? 's' : ''}…`;

      const oppFetches = clients.flatMap(client =>
        client.pipelines.length > 0
          ? client.pipelines.map(p =>
              apiFetch(`/api/locations/${client.locationId}/opportunities?pipelineId=${encodeURIComponent(p.pipelineId)}`)
                .then(d => ({ clientId: client.locationId, pipelineId: p.pipelineId, opportunities: d.opportunities || [], error: null }))
                .catch(err => ({ clientId: client.locationId, pipelineId: p.pipelineId, opportunities: [], error: err.message }))
            )
          : [apiFetch(`/api/locations/${client.locationId}/opportunities`)
              .then(d => ({ clientId: client.locationId, pipelineId: null, opportunities: d.opportunities || [], error: null }))
              .catch(err => ({ clientId: client.locationId, pipelineId: null, opportunities: [], error: err.message }))]
      );

      const callFetches = clients.map(client =>
        apiFetch(`/api/locations/${client.locationId}/calls`)
          .then(d => ({ clientId: client.locationId, calls: d.calls || [], error: null }))
          .catch(err => ({ clientId: client.locationId, calls: [], error: err.message }))
      );

      const smsFetches = clients.map(client =>
        apiFetch(`/api/locations/${client.locationId}/sms`)
          .then(d => ({ clientId: client.locationId, convos: d.conversations || [], error: null }))
          .catch(() => ({ clientId: client.locationId, convos: [], error: null }))
      );

      const [oppResults, callResults, smsResults] = await Promise.all([
        Promise.all(oppFetches),
        Promise.all(callFetches),
        Promise.all(smsFetches),
      ]);

      appData.opportunities = [];
      oppResults.forEach(r => {
        if (r.error) showError(`Opportunities for ${r.clientId}: ${r.error}`);
        r.opportunities.forEach(o => appData.opportunities.push({ ...o, _clientId: r.clientId, _pipelineId: r.pipelineId }));
      });

      appData.calls = [];
      callResults.forEach(r => {
        if (r.error) showError(`Calls for ${r.clientId}: ${r.error}`);
        r.calls.forEach(c => appData.calls.push({ ...c, _clientId: r.clientId }));
      });
      // Deduplicate by conversationId
      {
        const seen = new Map();
        appData.calls = appData.calls.filter(c => {
          if (!c.conversationId || seen.has(c.conversationId)) return false;
          seen.set(c.conversationId, true);
          return true;
        });
      }

      appData.smsConvos = [];
      smsResults.forEach(r => {
        r.convos.forEach(c => appData.smsConvos.push({ ...c, _clientId: r.clientId }));
      });

      // Fetch users for console reference
      const userFetches = clients.map(client =>
        apiFetch(`/api/locations/${client.locationId}/users`)
          .then(d => ({ locationId: client.locationId, clientName: client.name, users: d.users || [] }))
          .catch(() => ({ locationId: client.locationId, clientName: client.name, users: [] }))
      );
      const userResults = await Promise.all(userFetches);
      appData.fetchedUsers = [];
      userResults.forEach(r => {
        r.users.forEach(u => appData.fetchedUsers.push({
          id: u.id,
          name: u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
          email: u.email || '',
          locationId: r.locationId,
          clientName: r.clientName,
        }));
      });

      if (appData.fetchedUsers.length > 0) {
        console.log('[Revryze] Fetched GHL users — copy IDs into reps-config.json:');
        appData.fetchedUsers.forEach(u => {
          console.log(`  [${u.clientName}] id: "${u.id}"  name: "${u.name}"  email: "${u.email}"`);
        });
      }

      populateDropdowns();
      renderAll();
    } catch (err) {
      showError('Failed to load dashboard: ' + err.message);
    } finally {
      $loadingOverlay.classList.add('hidden');
    }
  }

  // ─── Dropdowns ───────────────────────────────────────────────────────────────
  function populateDropdowns() {
    const clients = appData.config.clients;
    const reps = appData.config.reps || [];

    // Command Center client dropdown
    $ccClientSelect.innerHTML = '<option value="all">All clients</option>';
    clients.forEach(c => {
      const o = document.createElement('option');
      o.value = c.locationId; o.textContent = c.name;
      $ccClientSelect.appendChild(o);
    });

    // Calls tab client + rep dropdowns
    $callsClientSelect.innerHTML = '<option value="all">All clients</option>';
    clients.forEach(c => {
      const o = document.createElement('option');
      o.value = c.locationId; o.textContent = c.name;
      $callsClientSelect.appendChild(o);
    });
    $callsRepSelect.innerHTML = '<option value="all">All reps</option>';
    reps.forEach(r => {
      const o = document.createElement('option');
      o.value = r.id; o.textContent = r.name;
      $callsRepSelect.appendChild(o);
    });

    // SMS client dropdown
    $smsClientSelect.innerHTML = '<option value="all">All clients</option>';
    clients.forEach(c => {
      const o = document.createElement('option');
      o.value = c.locationId; o.textContent = c.name;
      $smsClientSelect.appendChild(o);
    });

    populateCCLocationDropdown();
    populateSpiffWeeks();
  }

  function populateCCLocationDropdown() {
    const allClients = appData.config.clients;
    const selectedClients = filters.clientId === 'all'
      ? allClients
      : allClients.filter(c => c.locationId === filters.clientId);
    const pipelines = [];
    selectedClients.forEach(client => {
      (client.pipelines || []).forEach(p => {
        pipelines.push({
          pipelineId: p.pipelineId,
          label: filters.clientId === 'all' ? `${client.name} — ${p.name}` : p.name,
        });
      });
    });

    $ccLocationSelect.innerHTML = '<option value="all">All pipelines</option>';
    pipelines.forEach(p => {
      const o = document.createElement('option');
      o.value = p.pipelineId; o.textContent = p.label;
      $ccLocationSelect.appendChild(o);
    });
    $ccLocationSelect.disabled = pipelines.length === 0;
    if (filters.pipelineId !== 'all' && !pipelines.some(p => p.pipelineId === filters.pipelineId)) {
      filters.pipelineId = 'all';
    }
    $ccLocationSelect.value = filters.pipelineId;
  }

  function populateSpiffWeeks() {
    $spiffWeekSelect.innerHTML = '';
    for (let i = 0; i >= -12; i--) {
      const { start, end } = getWeekBounds(i);
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = i === 0 ? `Current Week — ${formatWeekLabel(start, end)}` : formatWeekLabel(start, end);
      $spiffWeekSelect.appendChild(o);
    }
    $spiffWeekSelect.value = '0';
  }

  // ─── Tab Switching ────────────────────────────────────────────────────────────
  function switchTab(tabId) {
    activeTab = tabId;
    $navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    $tabSections.forEach(s => s.classList.toggle('hidden', s.id !== `tab-${tabId}`));
    if (tabId === 'spiff') renderSpiff();
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
    renderSmsTab();
    renderSpiff();
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────────
  function renderMetrics(opps, calls) {
    const sold = opps.filter(o => (o.status || '').toLowerCase() === 'won').length;
    const revenue = opps
      .filter(o => (o.status || '').toLowerCase() === 'won')
      .reduce((s, o) => s + parseFloat(o.monetaryValue || o.value || 0), 0);
    const totalCalls = calls.length;
    const totalDuration = calls.reduce((s, c) => s + (c.duration || 0), 0);
    const rateDenom = totalCalls > 0 ? totalCalls : opps.length;
    const rate = rateDenom > 0 ? ((sold / rateDenom) * 100).toFixed(1) : '0.0';

    $mSold.textContent = sold;
    $mRevenue.textContent = formatCurrency(revenue);
    $mCalls.textContent = totalCalls;
    $mTalktime.textContent = formatTalkTime(totalDuration);
    $mRate.textContent = rate + '%';
  }

  // ─── Rep Leaderboard ─────────────────────────────────────────────────────────
  function computeRepStats(repId, opps, calls) {
    const repOpps = opps.filter(o => o.assignedTo === repId);
    const repCalls = calls.filter(c => c.userId === repId);
    const sold = repOpps.filter(o => (o.status || '').toLowerCase() === 'won').length;
    const revenue = repOpps
      .filter(o => (o.status || '').toLowerCase() === 'won')
      .reduce((s, o) => s + parseFloat(o.monetaryValue || o.value || 0), 0);
    const totalCalls = repCalls.length;
    const totalDurationSec = repCalls.reduce((sum, c) => sum + (c.duration || 0), 0);
    const crDenom = totalCalls > 0 ? totalCalls : repOpps.length;
    const closeRate = crDenom > 0 ? parseFloat(((sold / crDenom) * 100).toFixed(1)) : 0;
    return { sold, revenue, calls: totalCalls, totalDurationSec, closeRate };
  }

  function renderRepLeaderboard(opps, calls) {
    const reps = appData.config.reps || [];
    if (reps.length === 0) {
      $repLbList.innerHTML = emptyState('Add closers to reps-config.json to populate the leaderboard');
      return;
    }

    const sortKey = $repSort.value;
    const stats = reps.map(rep => ({ rep, stats: computeRepStats(rep.id, opps, calls) }));
    const sortVal = s => {
      if (sortKey === 'sold') return s.sold;
      if (sortKey === 'revenue') return s.revenue;
      if (sortKey === 'calls') return s.calls;
      if (sortKey === 'talktime') return s.totalDurationSec;
      return 0;
    };
    stats.sort((a, b) => sortVal(b.stats) - sortVal(a.stats));

    $repLbList.innerHTML = stats.map(({ rep, stats: s }, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const active = filters.repId === rep.id ? 'active' : '';
      const statVal = sortKey === 'revenue'
        ? formatCurrency(s.revenue)
        : sortKey === 'talktime'
          ? formatTalkTime(s.totalDurationSec)
          : sortKey === 'sold' ? s.sold : s.calls;
      return `
        <div class="lb-row ${active}" data-rep-id="${rep.id}">
          <div class="lb-rank ${rankClass}">${rank}</div>
          <div class="lb-avatar">${initials(rep.name)}</div>
          <div class="lb-info">
            <div class="lb-name">${escHtml(rep.name)}</div>
            <div class="lb-sub">${s.calls} calls &middot; ${s.closeRate}% close &middot; ${formatTalkTimeFull(s.totalDurationSec)}</div>
          </div>
          <div class="lb-stat">${statVal}</div>
        </div>`;
    }).join('');

    $repLbList.querySelectorAll('.lb-row').forEach(row => {
      row.addEventListener('click', () => {
        const repId = row.dataset.repId;
        filters.repId = filters.repId === repId ? null : repId;
        filters.callDir = 'all';
        $dirTabs.querySelectorAll('.dtab').forEach(t => t.classList.toggle('active', t.dataset.dir === 'all'));
        $callsRepSelect.value = filters.repId || 'all';
        const updatedCalls = filteredCalls();
        const updatedOpps = filteredOpps();
        const map = buildContactOppMap(updatedOpps);
        renderRepLeaderboard(updatedOpps, updatedCalls);
        renderCallLog(updatedCalls, map);
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
      const crDenom = totalCalls > 0 ? totalCalls : clientOpps.length;
      const closeRate = crDenom > 0 ? parseFloat(((sold / crDenom) * 100).toFixed(1)) : 0;
      return { client, sold, revenue, closeRate, totalCalls };
    });
    const sortVal = r => sortKey === 'sold' ? r.sold : sortKey === 'revenue' ? r.revenue : r.closeRate;
    rows.sort((a, b) => sortVal(b) - sortVal(a));

    $clientLbList.innerHTML = rows.map(r => {
      const active = filters.clientId === r.client.locationId ? 'active' : '';
      return `
        <div class="lb-row lb-row-client ${active}" data-client-id="${r.client.locationId}">
          <div class="lb-info lb-client-name">
            <div class="lb-name">${escHtml(r.client.name)}</div>
            <div class="lb-sub">${r.totalCalls} calls</div>
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
        filters.clientId = filters.clientId === clientId ? 'all' : clientId;
        filters.pipelineId = 'all';
        filters.repId = null;
        filters.callDir = 'all';
        $ccClientSelect.value = filters.clientId;
        populateCCLocationDropdown();
        $dirTabs.querySelectorAll('.dtab').forEach(t => t.classList.toggle('active', t.dataset.dir === 'all'));
        closeCallDetail();
        renderAll();
      });
    });
  }

  // ─── Call Log ────────────────────────────────────────────────────────────────
  function callOutcomeBadge(call, contactOppMap) {
    const opps = call.contactId ? (contactOppMap[call.contactId] || []) : [];
    if (opps.length === 0) {
      const dir = getCallDir(call);
      const label = dir === 'outbound' ? 'Outbound' : dir === 'missed' ? 'Missed' : 'Inbound';
      return `<span class="badge badge-gray">${label}</span>`;
    }
    const hasWon = opps.some(o => (o.status || '').toLowerCase() === 'won' ||
      (o.pipelineStage || o.stageName || '').toLowerCase() === 'closed won');
    if (hasWon) return `<span class="badge badge-sold">Sold</span>`;
    return `<span class="badge badge-pipeline">In Pipeline</span>`;
  }

  function renderCallLog(calls, contactOppMap) {
    let displayed = calls;
    if (filters.callDir !== 'all') {
      displayed = calls.filter(c => getCallDir(c) === filters.callDir);
    }
    displayed = [...displayed].sort((a, b) => {
      const da = parseDate(a.dateAdded), db = parseDate(b.dateAdded);
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      return db - da;
    });

    const title = filters.repId
      ? ((appData.config.reps || []).find(r => r.id === filters.repId) || {}).name + ' — Calls'
      : 'All Calls';
    $callLogTitle.textContent = title;
    $callLogCount.textContent = displayed.length ? `${displayed.length} calls` : '';

    if (displayed.length === 0) {
      $callList.innerHTML = emptyState('No calls found for this period');
      return;
    }

    $callList.innerHTML = displayed.map(call => {
      const dir = getCallDir(call);
      const contactName = call.contactName || call.phone || 'Unknown';
      const repName = getRepName(call.userId);
      const dateStr = formatDate(call.dateAdded);
      const badge = callOutcomeBadge(call, contactOppMap);
      return `
        <div class="call-row" data-conv-id="${escHtml(call.conversationId)}" data-client-id="${escHtml(call._clientId)}">
          <div class="dir-dot ${dir}"></div>
          <div class="call-info">
            <div class="call-contact">${escHtml(contactName)}</div>
            ${repName ? `<div class="call-rep">${escHtml(repName)}</div>` : ''}
            <div class="call-time-row">${dateStr} &middot; <span class="call-dur">—</span></div>
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
    $aiResults.classList.add('hidden');
    $aiAnalyzeBtn.disabled = false;
    $aiAnalyzeBtn.textContent = '✦ Analyze with AI';
    $existingNote.classList.add('hidden');
    $managerNoteText.value = '';
    $flagToggle.checked = false;

    currentCallConvId = convId;
    currentCallLocId = clientId;
    currentMessageId = null;

    const call = appData.calls.find(c => c.conversationId === convId);
    const clientCfg = appData.config.clients.find(c => c.locationId === clientId);
    const contactName = call ? (call.contactName || call.phone || 'Unknown') : 'Unknown';
    const phone = call ? (call.phone || '—') : '—';
    const dateStr = call ? formatDate(call.dateAdded) : '';
    const clientName = clientCfg ? clientCfg.name : (clientId || '');
    const repName = call ? getRepName(call.userId) : null;

    $callMeta.innerHTML = `
      <div>
        <strong>${escHtml(contactName)}</strong>
        ${repName ? `<span class="call-meta-rep">↗ ${escHtml(repName)}</span>` : ''}
      </div>
      <span>${escHtml(phone)}</span>
      <span>${dateStr}</span>
      ${clientName ? `<span>${escHtml(clientName)}</span>` : ''}
    `;

    console.log(`[openCallDetail] convId=${convId} clientId=${clientId}`);

    // Fetch messages on click (or use cached messageId)
    let messageId = (call && call.messageId) || null;
    if (!messageId) {
      try {
        const fetchUrl = `/api/conversations/${encodeURIComponent(convId)}/messages?locationId=${encodeURIComponent(clientId)}`;
        console.log(`[openCallDetail] fetching messages: ${fetchUrl}`);
        const msgInfo = await apiFetch(fetchUrl);
        console.log(`[openCallDetail] messages response:`, msgInfo);
        messageId = msgInfo.messageId || null;
        console.log(`[openCallDetail] messageId resolved: ${messageId}`);

        if (row) {
          const durSpan = row.querySelector('.call-dur');
          if (durSpan) {
            const dur = msgInfo.duration;
            durSpan.textContent = (dur && dur > 0)
              ? `${Math.floor(dur / 60)}m ${String(Math.floor(dur % 60)).padStart(2, '0')}s`
              : '—';
          }
        }
        if (call && messageId) call.messageId = messageId;
      } catch (err) {
        console.error(`[openCallDetail] failed to fetch messages:`, err);
      }
    } else {
      console.log(`[openCallDetail] using cached messageId: ${messageId}`);
    }

    currentMessageId = messageId;

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
        console.log('[transcript] fetching for messageId:', messageId, 'locationId:', clientId);
        const tRes = await fetch(`/api/transcription?messageId=${messageId}&locationId=${clientId}`);
        const tData = await tRes.json();
        console.log('[transcript] raw response:', JSON.stringify(tData));
        let text = null;
        if (Array.isArray(tData) && tData.length > 0) {
          text = tData.map(s => s.transcript).filter(Boolean).join(' ');
        } else if (tData && typeof tData === 'object') {
          text = tData.transcriptionText || tData.text || tData.transcript || null;
        } else if (typeof tData === 'string') {
          text = tData;
        }
        $transcriptText.textContent = text || 'No transcript available';
        $transcriptText.dataset.raw = text || '';
      } catch (err) {
        console.error('[transcript] fetch failed:', err);
        $transcriptText.textContent = 'No transcript available';
        $transcriptText.dataset.raw = '';
      }
    } else {
      $transcriptText.textContent = 'No transcript available';
      $transcriptText.dataset.raw = '';
    }

    // Load manager note
    if (messageId) {
      try {
        const noteData = await apiFetch(`/api/call-notes/${encodeURIComponent(messageId)}`);
        if (noteData.note) {
          $existingNote.innerHTML = `
            <div>${escHtml(noteData.note)}</div>
            <div class="existing-note-meta">Saved ${noteData.savedAt ? new Date(noteData.savedAt).toLocaleString() : ''}</div>
          `;
          $existingNote.classList.remove('hidden');
          $managerNoteText.value = noteData.note;
        }
        if (noteData.flagged) $flagToggle.checked = true;
      } catch (_) {}
    }
  }

  function closeCallDetail() {
    $callDetail.classList.add('hidden');
    resetAudioPlayer();
    currentCallConvId = null;
    currentCallLocId = null;
    currentMessageId = null;
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

  // ─── Audio Player ─────────────────────────────────────────────────────────────
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

  function updateAudioProgress() {
    if (!$audioEl.duration || isNaN($audioEl.duration) || !isFinite($audioEl.duration)) return;
    const pct = ($audioEl.currentTime / $audioEl.duration) * 100;
    $progressFill.style.width = pct + '%';
    $timeLabel.textContent = formatDuration($audioEl.currentTime) + ' / ' + formatDuration($audioEl.duration);
  }

  $audioEl.addEventListener('timeupdate', updateAudioProgress);
  $audioEl.addEventListener('loadedmetadata', updateAudioProgress);
  $audioEl.addEventListener('ended', () => { $playBtn.innerHTML = '&#9654;'; });

  $progressWrap.addEventListener('click', e => {
    if (!$audioEl.duration || isNaN($audioEl.duration) || !isFinite($audioEl.duration)) return;
    const rect = $progressWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    $audioEl.currentTime = pct * $audioEl.duration;
  });

  // ─── AI Analysis ─────────────────────────────────────────────────────────────
  $aiAnalyzeBtn.addEventListener('click', async () => {
    const transcript = $transcriptText.dataset.raw || $transcriptText.textContent;
    if (!transcript || transcript === 'No transcript available') {
      showError('No transcript available to analyze');
      return;
    }

    const call = appData.calls.find(c => c.conversationId === currentCallConvId);
    const repName = call ? (getRepName(call.userId) || 'Rep') : 'Rep';
    const contactName = call ? (call.contactName || 'Lead') : 'Lead';

    $aiAnalyzeBtn.disabled = true;
    $aiAnalyzeBtn.textContent = '✦ Analyzing…';
    $aiResults.innerHTML = '<div class="loading-row"><span class="spinner"></span> Analyzing call…</div>';
    $aiResults.classList.remove('hidden');

    try {
      const result = await apiFetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, repName, contactName }),
      });

      renderAiResults(result, transcript);
    } catch (err) {
      $aiResults.innerHTML = `<div class="empty-state">AI analysis failed: ${escHtml(err.message)}</div>`;
    } finally {
      $aiAnalyzeBtn.disabled = false;
      $aiAnalyzeBtn.textContent = '✦ Re-analyze';
    }
  });

  function renderAiResults(data, rawTranscript) {
    if (!data) { $aiResults.innerHTML = emptyState('No results'); return; }

    const scoreHtml = data.score != null
      ? `<div class="ai-score-badge">Score: ${data.score}/10</div>`
      : '';

    const summaryHtml = data.summary
      ? `<div class="ai-card"><div class="ai-card-label">Summary</div><div class="ai-card-body">${escHtml(data.summary)}</div></div>`
      : '';

    const momentsHtml = Array.isArray(data.keyMoments) && data.keyMoments.length > 0
      ? `<div class="ai-card">
          <div class="ai-card-label">Key Moments</div>
          ${data.keyMoments.map(m => `
            <div class="ai-moment">
              <span class="ai-moment-type">${escHtml(m.type || '')}</span>
              <span>${escHtml(m.description || m.text || String(m))}</span>
            </div>`).join('')}
        </div>`
      : '';

    const coachHtml = data.coachingTip
      ? `<div class="ai-card"><div class="ai-card-label">Coaching Tip</div><div class="ai-card-body">${escHtml(data.coachingTip)}</div></div>`
      : '';

    const transcriptHtml = data.labeledTranscript
      ? `<div class="ai-card">
          <div class="ai-card-label">Labeled Transcript</div>
          <div class="transcript-labeled">${data.labeledTranscript.map(seg => `
            <div><span class="${seg.speaker === 'Rep' ? 'transcript-rep' : 'transcript-lead'}">${escHtml(seg.speaker)}: </span>${escHtml(seg.text)}</div>
          `).join('')}</div>
        </div>`
      : '';

    $aiResults.innerHTML = `${scoreHtml}${summaryHtml}${momentsHtml}${coachHtml}${transcriptHtml}`;
  }

  // ─── Manager Notes ────────────────────────────────────────────────────────────
  $saveNoteBtn.addEventListener('click', async () => {
    if (!currentMessageId) { showError('No call selected'); return; }
    $saveNoteBtn.disabled = true;
    $saveNoteBtn.textContent = 'Saving…';
    try {
      await apiFetch(`/api/call-notes/${encodeURIComponent(currentMessageId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: $managerNoteText.value, flagged: $flagToggle.checked }),
      });
      $existingNote.innerHTML = `
        <div>${escHtml($managerNoteText.value)}</div>
        <div class="existing-note-meta">Saved just now</div>
      `;
      $existingNote.classList.remove('hidden');
      $saveNoteBtn.textContent = 'Saved ✓';
      setTimeout(() => { $saveNoteBtn.textContent = 'Save Note'; $saveNoteBtn.disabled = false; }, 2000);
    } catch (err) {
      showError('Failed to save note: ' + err.message);
      $saveNoteBtn.textContent = 'Save Note';
      $saveNoteBtn.disabled = false;
    }
  });

  // ─── SMS Tab ─────────────────────────────────────────────────────────────────
  function renderSmsTab() {
    const search = ($smsSearch.value || '').toLowerCase().trim();
    const clientId = $smsClientSelect.value;

    let convos = appData.smsConvos.filter(c => {
      if (clientId !== 'all' && c._clientId !== clientId) return false;
      if (search) {
        const name = (c.contactName || c.fullName || c.phone || '').toLowerCase();
        if (!name.includes(search)) return false;
      }
      return true;
    });

    convos.sort((a, b) => {
      const da = parseDate(a.lastMessageDate), db = parseDate(b.lastMessageDate);
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      return db - da;
    });

    $smsCount.textContent = convos.length ? `${convos.length} conversations` : '';

    if (convos.length === 0) {
      $smsList.innerHTML = emptyState('No SMS conversations found');
      return;
    }

    $smsList.innerHTML = convos.map(c => {
      const name = c.contactName || c.fullName || c.phone || 'Unknown';
      const preview = c.lastMessage || c.lastMessageBody || '';
      const dateStr = formatDate(c.lastMessageDate);
      return `
        <div class="sms-row" data-conv-id="${escHtml(c.id)}" data-client-id="${escHtml(c._clientId)}">
          <div class="call-info">
            <div class="sms-contact">${escHtml(name)}</div>
            <div class="sms-preview">${escHtml(preview)}</div>
          </div>
          <div class="sms-date">${dateStr}</div>
        </div>`;
    }).join('');

    $smsList.querySelectorAll('.sms-row').forEach(row => {
      row.addEventListener('click', () => {
        $smsList.querySelectorAll('.sms-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        openSmsThread(row.dataset.convId, row.dataset.clientId);
      });
    });
  }

  async function openSmsThread(convId, clientId) {
    $smsThreadPanel.classList.remove('hidden');
    $smsThreadMessages.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading…</div>';

    const convo = appData.smsConvos.find(c => c.id === convId);
    const name = convo ? (convo.contactName || convo.fullName || convo.phone || 'Conversation') : 'Conversation';
    $smsThreadContact.textContent = name;

    try {
      const data = await apiFetch(`/api/conversations/${encodeURIComponent(convId)}/thread?locationId=${encodeURIComponent(clientId)}`);
      const messages = Array.isArray(data.messages) ? data.messages : [];
      if (messages.length === 0) {
        $smsThreadMessages.innerHTML = emptyState('No messages in this conversation');
        return;
      }
      $smsThreadMessages.innerHTML = messages.map(m => {
        const dir = (m.direction || '').toLowerCase().includes('out') ? 'outbound' : 'inbound';
        const body = m.body || m.message || m.text || '';
        const time = m.dateAdded || m.createdAt;
        return `
          <div class="sms-bubble ${dir}">
            <div>${escHtml(body)}</div>
            ${time ? `<div class="sms-bubble-time">${formatDate(time)}</div>` : ''}
          </div>`;
      }).join('');
      $smsThreadMessages.scrollTop = $smsThreadMessages.scrollHeight;
    } catch (err) {
      $smsThreadMessages.innerHTML = emptyState('Failed to load thread: ' + err.message);
    }
  }

  // ─── Weekly SPIFF ────────────────────────────────────────────────────────────
  function renderSpiff() {
    const offsetWeeks = parseInt($spiffWeekSelect.value || '0', 10);
    const { start, end } = getWeekBounds(offsetWeeks);
    $spiffBannerRange.textContent = formatWeekLabel(start, end);

    const reps = appData.config.reps || [];
    if (reps.length === 0) {
      $spiffLbList.innerHTML = emptyState('Add reps to reps-config.json to see SPIFF rankings');
      return;
    }

    const weekOpps = appData.opportunities.filter(o => {
      const d = parseDate(o.dateAdded || o.createdAt || o.dateUpdated);
      return d && d >= start && d <= end;
    });

    const stats = reps.map(rep => {
      const repOpps = weekOpps.filter(o => o.assignedTo === rep.id);
      const sold = repOpps.filter(o => (o.status || '').toLowerCase() === 'won').length;
      const revenue = repOpps
        .filter(o => (o.status || '').toLowerCase() === 'won')
        .reduce((s, o) => s + parseFloat(o.monetaryValue || o.value || 0), 0);
      const weekCalls = appData.calls.filter(c => {
        const d = parseDate(c.dateAdded);
        return c.userId === rep.id && d && d >= start && d <= end;
      }).length;
      return { rep, sold, revenue, calls: weekCalls };
    });

    stats.sort((a, b) => b.sold - a.sold);

    $spiffLbList.innerHTML = stats.map(({ rep, sold, revenue, calls }, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const crown = rank === 1 ? '<span class="spiff-crown">👑</span>' : '';
      return `
        <div class="lb-row" style="${rank === 1 ? 'background:rgba(0,245,160,0.06)' : ''}">
          <div class="lb-rank ${rankClass}">${rank}</div>
          <div class="lb-avatar">${initials(rep.name)}</div>
          <div class="lb-info">
            <div class="lb-name">${crown}${escHtml(rep.name)}</div>
            <div class="lb-sub">${calls} calls &middot; ${formatCurrency(revenue)} revenue</div>
          </div>
          <div style="text-align:right">
            <div class="spiff-sold-big">${sold}</div>
            <div class="spiff-sold-label">sold</div>
          </div>
        </div>`;
    }).join('');
  }

  // ─── Event Listeners ─────────────────────────────────────────────────────────
  $navTabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  $refreshBtn.addEventListener('click', () => {
    closeCallDetail();
    fetchAll();
  });

  // Command Center filters
  $ccClientSelect.addEventListener('change', () => {
    filters.clientId = $ccClientSelect.value;
    filters.pipelineId = 'all';
    filters.repId = null;
    populateCCLocationDropdown();
    closeCallDetail();
    renderAll();
  });
  $ccLocationSelect.addEventListener('change', () => {
    filters.pipelineId = $ccLocationSelect.value;
    filters.repId = null;
    closeCallDetail();
    renderAll();
  });
  $ccDateSelect.addEventListener('change', () => {
    filters.days = parseInt($ccDateSelect.value, 10);
    closeCallDetail();
    renderAll();
  });

  // Calls tab filters
  $callsSearch.addEventListener('input', () => {
    filters.callSearch = $callsSearch.value;
    const calls = filteredCalls();
    const opps = filteredOpps();
    renderCallLog(calls, buildContactOppMap(opps));
  });
  $callsRepSelect.addEventListener('change', () => {
    filters.repId = $callsRepSelect.value === 'all' ? null : $callsRepSelect.value;
    const calls = filteredCalls();
    const opps = filteredOpps();
    renderCallLog(calls, buildContactOppMap(opps));
    closeCallDetail();
  });
  $callsClientSelect.addEventListener('change', () => {
    filters.clientId = $callsClientSelect.value;
    const calls = filteredCalls();
    const opps = filteredOpps();
    renderCallLog(calls, buildContactOppMap(opps));
    closeCallDetail();
  });
  $callsDateSelect.addEventListener('change', () => {
    filters.callsDays = parseInt($callsDateSelect.value, 10);
    filters.days = filters.callsDays;
    const calls = filteredCalls();
    const opps = filteredOpps();
    renderCallLog(calls, buildContactOppMap(opps));
    closeCallDetail();
  });

  $dirTabs.addEventListener('click', e => {
    const tab = e.target.closest('.dtab');
    if (!tab) return;
    filters.callDir = tab.dataset.dir;
    $dirTabs.querySelectorAll('.dtab').forEach(t => t.classList.toggle('active', t.dataset.dir === filters.callDir));
    const calls = filteredCalls();
    const opps = filteredOpps();
    renderCallLog(calls, buildContactOppMap(opps));
  });

  $repSort.addEventListener('change', () => { renderRepLeaderboard(filteredOpps(), filteredCalls()); });
  $clientSort.addEventListener('change', () => { renderClientLeaderboard(filteredOpps(), filteredCalls()); });

  $closeDetailBtn.addEventListener('click', closeCallDetail);
  $closeSmsBtn.addEventListener('click', () => {
    $smsThreadPanel.classList.add('hidden');
    $smsList.querySelectorAll('.sms-row').forEach(r => r.classList.remove('active'));
  });

  $smsSearch.addEventListener('input', renderSmsTab);
  $smsClientSelect.addEventListener('change', renderSmsTab);
  $spiffWeekSelect.addEventListener('change', renderSpiff);

  // ─── Init ────────────────────────────────────────────────────────────────────
  fetchAll();
})();
