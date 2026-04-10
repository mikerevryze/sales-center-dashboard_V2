(function () {
  'use strict';

  // ─── DOM ────────────────────────────────────────────────────────────────────
  const $loadingOverlay   = document.getElementById('loading-overlay');
  const $loadingMsg       = document.getElementById('loading-msg');
  const $errorBanner      = document.getElementById('error-banner');
  const $refreshBtn       = document.getElementById('refresh-btn');

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
  const $callsSearch         = document.getElementById('calls-search');
  const $callsRepSelect      = document.getElementById('calls-rep-select');
  const $callsClientSelect   = document.getElementById('calls-client-select');
  const $callsDateSelect     = document.getElementById('calls-date-select');
  const $customDateInputs    = document.getElementById('custom-date-inputs');
  const $callsFromDate       = document.getElementById('calls-from-date');
  const $callsToDate         = document.getElementById('calls-to-date');
  const $filterCountBadge    = document.getElementById('filter-count-badge');
  const $clearFiltersBtn     = document.getElementById('clear-filters-btn');
  const $dirTabs             = document.getElementById('dir-tabs');
  const $callsOutcomeSelect  = document.getElementById('calls-outcome-select');
  const $callsMinDurSelect   = document.getElementById('calls-min-duration-select');
  const $callsAiScoreSelect  = document.getElementById('calls-ai-score-select');
  const $callsFlaggedToggle  = document.getElementById('calls-flagged-toggle');
  const $callLogTitle        = document.getElementById('call-log-title');
  const $callLogCount        = document.getElementById('call-log-count');
  const $callList            = document.getElementById('call-log-list');
  const $callDetail          = document.getElementById('call-detail-panel');
  const $callMeta            = document.getElementById('call-meta');
  const $closeDetailBtn      = document.getElementById('close-detail-btn');
  const $playBtn             = document.getElementById('play-btn');
  const $progressWrap        = document.getElementById('progress-wrap');
  const $progressFill        = document.getElementById('progress-fill');
  const $timeLabel           = document.getElementById('time-label');
  const $audioEl             = document.getElementById('audio-el');
  const $transcriptSection   = document.getElementById('transcript-section');
  const $transcriptText      = document.getElementById('transcript-text');
  const $aiAnalyzeBtn        = document.getElementById('ai-analyze-btn');
  const $aiResults           = document.getElementById('ai-results');
  const $existingNote        = document.getElementById('existing-note');
  const $managerNoteText     = document.getElementById('manager-note-text');
  const $saveNoteBtn         = document.getElementById('save-note-btn');
  const $flagToggle          = document.getElementById('flag-toggle');

  // SMS tab
  const $smsSearch           = document.getElementById('sms-search');
  const $smsClientSelect     = document.getElementById('sms-client-select');
  const $smsOutcomeSelect    = document.getElementById('sms-outcome-select');
  const $smsList             = document.getElementById('sms-list');
  const $smsCount            = document.getElementById('sms-count');
  const $smsThreadPanel      = document.getElementById('sms-thread-panel');
  const $smsThreadContact    = document.getElementById('sms-thread-contact');
  const $smsThreadMessages   = document.getElementById('sms-thread-messages');
  const $closeSmsBtn         = document.getElementById('close-sms-btn');

  // SPIFF tab
  const $spiffWeekSelect     = document.getElementById('spiff-week-select');
  const $spiffBannerRange    = document.getElementById('spiff-banner-range');
  const $spiffLbList         = document.getElementById('spiff-lb-list');

  // Settings
  const $settingsBtn         = document.getElementById('settings-btn');
  const $settingsPanel       = document.getElementById('settings-panel');
  const $settingsOverlay     = document.getElementById('settings-overlay');
  const $settingsClose       = document.getElementById('settings-close');
  const $rubricDefaultText   = document.getElementById('rubric-default-text');
  const $rubricRepSelect     = document.getElementById('rubric-rep-select');
  const $rubricOverrideText  = document.getElementById('rubric-override-text');
  const $saveRubricBtn       = document.getElementById('save-rubric-btn');
  const $saveRepOverrideBtn  = document.getElementById('save-rep-override-btn');

  // Rep profile panel (slide-in from right)
  const $repPanelOverlay = document.getElementById('rep-panel-overlay');
  const $repPanel        = document.getElementById('rep-panel');
  // Manager / My View toggle
  const $viewModeBtn   = document.getElementById('view-mode-btn');
  const $myViewRepSel  = document.getElementById('my-view-rep-select');

  // ─── App State ──────────────────────────────────────────────────────────────
  const appData = {
    config: { clients: [], reps: [] },
    opportunities: [],
    calls: [],
    smsConvos: [],
    callNotes: {},
    notesByConvId: {},
    scoringRubric: { default: '', repOverrides: {} },
    contactWonSet: new Set(),
    allContactOppMap: {},
    contactCallRepMap: {},
  };

  const ccFilters = { clientId: 'all', pipelineId: 'all', days: 30 };
  const callFilters = {
    repId: null,
    clientId: 'all',
    days: 30,
    fromDate: null,
    toDate: null,
    dir: 'all',
    search: '',
    outcome: 'all',
    minDuration: 0,
    flaggedOnly: false,
    minAiScore: 0,
  };
  const smsFilters = { clientId: 'all', search: '', outcome: 'all' };

  let currentCallConvId    = null;
  let currentCallLocId     = null;
  let currentMessageId     = null;
  let currentCallRepId     = null;
  let currentCallContactId = null;
  let currentProfileRepId  = null;
  let currentPanelLocId    = null;
  let activeTab            = 'command';
  let myViewRepId          = null;
  let viewToggleReady      = false;

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function showError(msg) {
    $errorBanner.textContent = msg;
    $errorBanner.classList.remove('hidden');
    setTimeout(() => $errorBanner.classList.add('hidden'), 10000);
  }

  async function apiFetch(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`${res.status} ${txt.slice(0, 120)}`);
    }
    return res.json();
  }

  function fmt$(n) { return '$' + (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); }
  function fmtDur(sec) {
    if (!sec || !isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  function fmtDurLong(sec) {
    if (!sec || !isFinite(sec)) return '0m 0s';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }
  function parseDate(v) {
    if (!v) return null;
    const d = new Date(typeof v === 'number' ? v : v);
    return isNaN(d) ? null : d;
  }
  function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function getDateCutoff(days) {
    const d = new Date();
    d.setDate(d.getDate() - (days || 30));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getCallDir(c) {
    const dir = (c.direction || c.type || '').toLowerCase();
    if (dir.includes('inbound')) return 'inbound';
    if (dir.includes('outbound')) return 'outbound';
    const status = (c.status || '').toLowerCase();
    if (status === 'no-answer' || status === 'busy' || status === 'no_answer' || status === 'missed') return 'missed';
    if (dir.includes('missed')) return 'missed';
    return 'outbound';
  }

  function getCallDuration(c) {
    return c.duration || c.meta?.call?.duration || 0;
  }

  function getRepById(id) {
    return appData.config.reps.find(r => r.userId === id) || null;
  }
  function getRepName(id) {
    const r = getRepById(id);
    return r ? r.name : (id ? id.slice(0, 8) : 'Unknown');
  }
  function getClientName(locId) {
    const c = appData.config.clients.find(cl => cl.locationId === locId);
    return c ? c.name : locId;
  }

  // Fix 1: Use lastStageChangeAt as win date for SPIFF
  function getWonDate(opp) {
    if ((opp.status || '').toLowerCase() !== 'won') return null;
    return parseDate(opp.lastStageChangeAt || opp.dateUpdated || opp.dateAdded);
  }

  function buildNotesByConvId() {
    appData.notesByConvId = {};
    Object.entries(appData.callNotes).forEach(([messageId, note]) => {
      if (note.conversationId) {
        appData.notesByConvId[note.conversationId] = { ...note, messageId };
      }
    });
  }

  function buildContactMaps() {
    appData.contactWonSet = new Set();
    appData.allContactOppMap = {};
    appData.opportunities.forEach(o => {
      if (!o.contactId) return;
      if (!appData.allContactOppMap[o.contactId]) appData.allContactOppMap[o.contactId] = [];
      appData.allContactOppMap[o.contactId].push(o);
      if ((o.status || '').toLowerCase() === 'won') {
        appData.contactWonSet.add(o.contactId);
      }
    });
    buildContactCallRepMap();
  }

  // Fix 2: Build a contactId → userId map from call data (most recent call's rep wins)
  function buildContactCallRepMap() {
    appData.contactCallRepMap = {};
    [...appData.calls]
      .sort((a, b) => (parseDate(b.dateAdded) || 0) - (parseDate(a.dateAdded) || 0))
      .forEach(c => {
        if (c.contactId && c.userId && !appData.contactCallRepMap[c.contactId]) {
          appData.contactCallRepMap[c.contactId] = c.userId;
        }
      });
  }

  // Sales attribution priority (confirmed from raw GHL data):
  //   1. assignedTo — explicit rep assignment
  //   2. followers[0] — used when assignedTo is null (GHL single-follower attribution)
  //   3. contactId cross-ref — calls cache lookup as last fallback
  function getOppRepId(opp) {
    if (opp.assignedTo) return opp.assignedTo;
    if (Array.isArray(opp.followers) && opp.followers.length) return opp.followers[0];
    if (opp.contactId && appData.contactCallRepMap[opp.contactId]) {
      return appData.contactCallRepMap[opp.contactId];
    }
    return null;
  }

  function getActiveFilterCount() {
    let n = 0;
    if (callFilters.repId) n++;
    if (callFilters.clientId !== 'all') n++;
    if (callFilters.fromDate || callFilters.toDate || callFilters.days !== 30) n++;
    if (callFilters.dir !== 'all') n++;
    if (callFilters.search) n++;
    if (callFilters.outcome !== 'all') n++;
    if (callFilters.minDuration > 0) n++;
    if (callFilters.flaggedOnly) n++;
    if (callFilters.minAiScore > 0) n++;
    return n;
  }

  function updateFilterBadge() {
    const n = getActiveFilterCount();
    if (n > 0) {
      $filterCountBadge.textContent = `${n} active`;
      $filterCountBadge.classList.remove('hidden');
      $clearFiltersBtn.classList.remove('hidden');
    } else {
      $filterCountBadge.classList.add('hidden');
      $clearFiltersBtn.classList.add('hidden');
    }
  }

  function clearAllCallFilters() {
    callFilters.repId = null;
    callFilters.clientId = 'all';
    callFilters.days = 30;
    callFilters.fromDate = null;
    callFilters.toDate = null;
    callFilters.dir = 'all';
    callFilters.search = '';
    callFilters.outcome = 'all';
    callFilters.minDuration = 0;
    callFilters.flaggedOnly = false;
    callFilters.minAiScore = 0;
    // Reset DOM
    $callsSearch.value = '';
    $callsRepSelect.value = 'all';
    $callsClientSelect.value = 'all';
    $callsDateSelect.value = '30';
    $callsFromDate.value = '';
    $callsToDate.value = '';
    $customDateInputs.classList.add('hidden');
    $callsOutcomeSelect.value = 'all';
    $callsMinDurSelect.value = '0';
    $callsAiScoreSelect.value = '0';
    $callsFlaggedToggle.checked = false;
    document.querySelectorAll('.dtab').forEach(t => t.classList.toggle('active', t.dataset.dir === 'all'));
    updateFilterBadge();
    renderCallLog();
  }

  // ─── Data Fetching ───────────────────────────────────────────────────────────
  const callsCache = {};

  async function fetchCalls(locationId, apiKey) {
    const now = Date.now();
    if (callsCache[locationId] && now - callsCache[locationId].ts < 5 * 60 * 1000) {
      return callsCache[locationId].data;
    }
    const url = `/api/locations/${locationId}/calls?page=1&limit=100`;
    const res = await apiFetch(url);
    const calls = (Array.isArray(res) ? res : res.conversations || res.calls || [])
      .filter(c => (c.lastMessageType || '').toLowerCase().includes('call'));
    callsCache[locationId] = { ts: now, data: calls };
    return calls;
  }

  async function fetchAll() {
    $loadingOverlay.classList.remove('hidden');
    try {
      const [config, notes, rubric] = await Promise.all([
        apiFetch('/api/config'),
        apiFetch('/api/call-notes').catch(() => ({})),
        apiFetch('/api/scoring-rubric').catch(() => ({ default: '', repOverrides: {} })),
      ]);
      appData.config = config;
      appData.callNotes = notes || {};
      appData.scoringRubric = rubric || { default: '', repOverrides: {} };
      buildNotesByConvId();

      populateSelects();
      if (!viewToggleReady) { initViewToggle(); viewToggleReady = true; }

      const clientCount = config.clients.length;
      $loadingMsg.textContent = `Fetching data for ${clientCount} client${clientCount > 1 ? 's' : ''}…`;

      const results = await Promise.allSettled(
        config.clients.map(cl => fetchClientData(cl))
      );

      appData.opportunities = [];
      appData.calls = [];
      appData.smsConvos = [];

      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value) {
          appData.opportunities.push(...(r.value.opportunities || []));
          const calls = (r.value.calls || []).map(c => ({ ...c, _clientId: config.clients[i].locationId }));
          appData.calls.push(...calls);
          appData.smsConvos.push(...(r.value.sms || []));
        } else if (r.status === 'rejected') {
          console.warn('[fetchAll] client error:', r.reason);
        }
      });

      buildContactMaps();
      logFetchedUsers();

      renderCommandCenter();
      renderCallLog();
      renderSmsList();
      buildSpiffWeekOptions();
      renderSpiff();

      populateRubricEditor();
    } catch (err) {
      console.error('[fetchAll] error:', err && err.message ? err.message : String(err));
      console.error('[fetchAll] stack:', err && err.stack);
      showError('Failed to load data: ' + (err && err.message ? err.message : String(err)));
    } finally {
      $loadingOverlay.classList.add('hidden');
    }
  }

  function toArr(v) {
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.opportunities)) return v.opportunities;
    if (v && Array.isArray(v.conversations)) return v.conversations;
    if (v && Array.isArray(v.calls)) return v.calls;
    if (v && Array.isArray(v.sms)) return v.sms;
    return [];
  }

  async function fetchClientData(cl) {
    const [oppsRes, callsRes, smsRes] = await Promise.allSettled([
      apiFetch(`/api/locations/${cl.locationId}/opportunities`),
      apiFetch(`/api/locations/${cl.locationId}/calls`),
      apiFetch(`/api/locations/${cl.locationId}/sms`),
    ]);
    const oppsRaw  = oppsRes.status  === 'fulfilled' ? oppsRes.value  : null;
    const callsRaw = callsRes.status === 'fulfilled' ? callsRes.value : null;
    const smsRaw   = smsRes.status   === 'fulfilled' ? smsRes.value   : null;
    return {
      opportunities: oppsRaw  ? (Array.isArray(oppsRaw.opportunities)  ? oppsRaw.opportunities  : toArr(oppsRaw))  : [],
      calls:         callsRaw ? (Array.isArray(callsRaw.conversations)  ? callsRaw.conversations : toArr(callsRaw)) : [],
      sms:           smsRaw   ? (Array.isArray(smsRaw.conversations)    ? smsRaw.conversations   : toArr(smsRaw))   : [],
    };
  }

  function logFetchedUsers() {
    const seen = new Set();
    const lines = [];
    appData.config.clients.forEach(cl => {
      appData.calls
        .filter(c => c._clientId === cl.locationId && c.userId && !seen.has(c.userId))
        .forEach(c => {
          seen.add(c.userId);
          const rep = getRepById(c.userId);
          lines.push(`  [${cl.name}] id: "${c.userId}"  name: "${rep ? rep.name : 'unknown'}"`);
        });
    });
    console.log('[Revryze] Fetched GHL users — copy IDs into reps-config.json:');
    lines.forEach(l => console.log(l));
  }

  // ─── Populate Selects ────────────────────────────────────────────────────────
  function populateSelects() {
    const clients = appData.config.clients;
    const reps = appData.config.reps;

    [[$ccClientSelect], [$callsClientSelect], [$smsClientSelect]].forEach(([el]) => {
      while (el.options.length > 1) el.remove(1);
      clients.forEach(cl => {
        const o = new Option(cl.name, cl.locationId);
        el.add(o);
      });
    });

    while ($ccLocationSelect.options.length > 1) $ccLocationSelect.remove(1);
    clients.forEach(cl => {
      (cl.pipelines || []).forEach(p => {
        $ccLocationSelect.add(new Option(`${cl.name} — ${p.name || p.pipelineId}`, p.pipelineId));
      });
    });

    while ($callsRepSelect.options.length > 1) $callsRepSelect.remove(1);
    reps.forEach(r => $callsRepSelect.add(new Option(r.name, r.userId)));

    while ($rubricRepSelect.options.length > 1) $rubricRepSelect.remove(1);
    reps.forEach(r => $rubricRepSelect.add(new Option(r.name, r.userId)));

    // My View rep selector
    while ($myViewRepSel.options.length) $myViewRepSel.remove(0);
    reps.forEach(r => $myViewRepSel.add(new Option(r.name, r.userId)));
    const storedRep = localStorage.getItem('myViewRepId');
    if (storedRep) $myViewRepSel.value = storedRep;
  }

  // ─── Command Center ──────────────────────────────────────────────────────────
  function filteredOpps() {
    const cutoff = getDateCutoff(ccFilters.days);
    return appData.opportunities.filter(o => {
      if (ccFilters.clientId !== 'all' && o.locationId !== ccFilters.clientId) return false;
      if (ccFilters.pipelineId !== 'all' && o.pipelineId !== ccFilters.pipelineId) return false;
      const d = parseDate(o.dateAdded);
      if (d && d < cutoff) return false;
      return true;
    });
  }

  // Fix 1: Won opps filtered by lastStageChangeAt (not dateAdded)
  function filteredWonOpps() {
    const cutoff = getDateCutoff(ccFilters.days);
    return appData.opportunities.filter(o => {
      if ((o.status || '').toLowerCase() !== 'won') return false;
      if (ccFilters.clientId !== 'all' && o.locationId !== ccFilters.clientId) return false;
      if (ccFilters.pipelineId !== 'all' && o.pipelineId !== ccFilters.pipelineId) return false;
      const d = parseDate(o.lastStageChangeAt);
      if (!d || d < cutoff) return false;
      if (myViewRepId && getOppRepId(o) !== myViewRepId) return false;
      return true;
    });
  }

  function filteredCallsCC() {
    const cutoff = getDateCutoff(ccFilters.days);
    return appData.calls.filter(c => {
      if (ccFilters.clientId !== 'all' && c._clientId !== ccFilters.clientId) return false;
      const d = parseDate(c.dateAdded);
      if (d && d < cutoff) return false;
      if (myViewRepId && c.userId !== myViewRepId) return false;
      return true;
    });
  }

  function renderCommandCenter() {
    // Fix 1: Use lastStageChangeAt for won opps; Fix 3: only count monetaryValue > 0
    const wonOpps    = filteredWonOpps();
    const calls      = filteredCallsCC();
    const sold       = wonOpps.length;
    const revenue    = wonOpps.reduce((s, o) => s + (o.monetaryValue > 0 ? o.monetaryValue : 0), 0);
    const totalCalls = calls.length;
    const talkSec    = calls.reduce((s, c) => s + getCallDuration(c), 0);

    // Fix 5: Close rate sanity check — cap at 100%
    let closeRate = '—';
    if (totalCalls > 0) {
      const raw = (sold / totalCalls) * 100;
      if (raw > 100) {
        console.warn('[closeRate] exceeds 100% — sold:', sold, 'calls:', totalCalls, 'raw:', raw.toFixed(1) + '%');
      } else {
        closeRate = raw.toFixed(1) + '%';
      }
    }

    $mSold.textContent     = sold;
    $mRevenue.textContent  = fmt$(revenue);
    $mCalls.textContent    = totalCalls;
    $mTalktime.textContent = fmtDurLong(talkSec);
    $mRate.textContent     = closeRate;

    renderRepLeaderboard(wonOpps, calls);
    renderClientLeaderboard(wonOpps, calls);
  }

  // Fix 2, 3, 6: wonOpps already filtered by lastStageChangeAt; uses getOppRepId(); monetaryValue > 0 only
  function renderRepLeaderboard(wonOpps, calls) {
    const sort = $repSort.value;
    const reps = myViewRepId
      ? appData.config.reps.filter(r => r.userId === myViewRepId)
      : appData.config.reps;

    const rows = reps.map(r => {
      const rWon   = wonOpps.filter(o => getOppRepId(o) === r.userId);
      const rCalls = calls.filter(c => c.userId === r.userId);
      const sold   = rWon.length;
      const rev    = rWon.reduce((s, o) => s + (o.monetaryValue > 0 ? o.monetaryValue : 0), 0);
      const nCalls = rCalls.length;
      const talk   = rCalls.reduce((s, c) => s + getCallDuration(c), 0);
      // Fix 5: sanity check close rate
      let rate = '—';
      if (nCalls > 0) {
        const raw = (sold / nCalls) * 100;
        if (raw <= 100) rate = raw.toFixed(1) + '%';
      }
      return { rep: r, sold, rev, nCalls, talk, rate };
    });

    rows.sort((a, b) => {
      if (sort === 'sold')     return b.sold - a.sold;
      if (sort === 'revenue')  return b.rev - a.rev;
      if (sort === 'calls')    return b.nCalls - a.nCalls;
      if (sort === 'talktime') return b.talk - a.talk;
      return 0;
    });

    $repLbList.innerHTML = rows.map((row, i) => `
      <div class="lb-row" data-rep-id="${row.rep.userId}">
        <span class="lb-rank">${i + 1}</span>
        <div class="lb-avatar">${initials(row.rep.name)}</div>
        <div class="lb-info">
          <div class="lb-name">${row.rep.name}</div>
          <div class="lb-sub">${row.nCalls} calls · ${fmtDurLong(row.talk)}</div>
        </div>
        <div class="lb-right">
          <div class="lb-val">${row.sold}</div>
          <div class="lb-sub">${row.rate} close</div>
        </div>
      </div>
    `).join('');

    $repLbList.querySelectorAll('.lb-row[data-rep-id]').forEach(row => {
      row.addEventListener('click', () => openRepProfile(row.dataset.repId));
    });
  }

  // Fix 1, 3, 5: wonOpps by lastStageChangeAt; monetaryValue > 0; close rate sanity
  function renderClientLeaderboard(wonOpps, calls) {
    const sort = $clientSort.value;
    const clients = appData.config.clients;

    const rows = clients.map(cl => {
      const cWon   = wonOpps.filter(o => o.locationId === cl.locationId);
      const cCalls = calls.filter(c => c._clientId === cl.locationId);
      const sold   = cWon.length;
      const rev    = cWon.reduce((s, o) => s + (o.monetaryValue > 0 ? o.monetaryValue : 0), 0);
      let rate = '—';
      if (cCalls.length > 0) {
        const raw = (sold / cCalls.length) * 100;
        if (raw <= 100) rate = raw.toFixed(1) + '%';
        else console.warn('[closeRate] client sanity:', cl.name, raw.toFixed(1) + '%');
      }
      return { cl, sold, rev, rate, calls: cCalls.length };
    });

    rows.sort((a, b) => {
      if (sort === 'sold')      return b.sold - a.sold;
      if (sort === 'revenue')   return b.rev - a.rev;
      if (sort === 'closeRate') return parseFloat(b.rate) - parseFloat(a.rate);
      return 0;
    });

    $clientLbList.innerHTML = rows.map((row, i) => `
      <div class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <div class="lb-avatar" style="background:#1e2a2a;color:var(--accent)">
          ${(row.cl.name || '?')[0].toUpperCase()}
        </div>
        <div class="lb-info">
          <div class="lb-name">${row.cl.name}</div>
          <div class="lb-sub">${row.calls} calls</div>
        </div>
        <div class="lb-right">
          <div class="lb-val">${row.sold}</div>
          <div class="lb-sub">${row.rate} close · ${fmt$(row.rev)}</div>
        </div>
      </div>
    `).join('');
  }

  // ─── Calls Tab ───────────────────────────────────────────────────────────────
  function getFilteredCalls() {
    const cutoff = callFilters.fromDate ? null : getDateCutoff(callFilters.days);
    const search = callFilters.search.toLowerCase().trim();

    return appData.calls.filter(c => {
      // Client
      if (callFilters.clientId !== 'all' && c._clientId !== callFilters.clientId) return false;
      // Rep (explicit filter takes precedence; My View adds implicit filter)
      if (callFilters.repId && c.userId !== callFilters.repId) return false;
      if (!callFilters.repId && myViewRepId && c.userId !== myViewRepId) return false;
      // Date
      const d = parseDate(c.dateAdded);
      if (callFilters.fromDate && d && d < callFilters.fromDate) return false;
      if (callFilters.toDate && d && d > callFilters.toDate) return false;
      if (!callFilters.fromDate && cutoff && d && d < cutoff) return false;
      // Direction
      const dir = getCallDir(c);
      if (callFilters.dir !== 'all' && dir !== callFilters.dir) return false;
      // Search
      if (search && !(c.contactName || c.phone || '').toLowerCase().includes(search)) return false;
      // Outcome
      if (callFilters.outcome !== 'all') {
        if (callFilters.outcome === 'noanswer') {
          if (dir !== 'missed') return false;
        } else if (callFilters.outcome === 'sold') {
          if (!appData.contactWonSet.has(c.contactId)) return false;
        } else if (callFilters.outcome === 'pipeline') {
          if (appData.contactWonSet.has(c.contactId)) return false;
          if (!appData.allContactOppMap[c.contactId]?.length) return false;
        }
      }
      // Min duration
      if (callFilters.minDuration > 0 && getCallDuration(c) < callFilters.minDuration) return false;
      // Flagged
      if (callFilters.flaggedOnly) {
        const note = appData.notesByConvId[c.conversationId || c.id];
        if (!note || !note.flagged) return false;
      }
      // AI score
      if (callFilters.minAiScore > 0) {
        const note = appData.notesByConvId[c.conversationId || c.id];
        const score = note?.aiAnalysis?.score;
        if (!score || score < callFilters.minAiScore) return false;
      }
      return true;
    });
  }

  function renderCallLog() {
    const calls = getFilteredCalls();
    $callLogCount.textContent = `${calls.length} calls`;
    updateFilterBadge();

    if (!calls.length) {
      $callList.innerHTML = '<div class="empty-state">No calls match the current filters.</div>';
      return;
    }

    calls.sort((a, b) => {
      const da = parseDate(a.dateAdded), db = parseDate(b.dateAdded);
      return (db || 0) - (da || 0);
    });

    $callList.innerHTML = calls.map(c => buildCallRow(c)).join('');

    $callList.querySelectorAll('.call-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.call-rep')) {
          e.stopPropagation();
          const repId = e.target.closest('.call-rep').dataset.repId;
          if (repId) openRepProfile(repId);
          return;
        }
        $callList.querySelectorAll('.call-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        openCallDetail(row.dataset.convId, row.dataset.clientId, row);
      });
    });
  }

  function buildCallRow(c) {
    const dir    = getCallDir(c);
    const dur    = getCallDuration(c);
    const rep    = getRepById(c.userId);
    const repName = rep ? rep.name : '';
    const d      = parseDate(c.dateAdded);
    const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const note   = appData.notesByConvId[c.conversationId || c.id];
    const flagged = note?.flagged;
    const aiScore = note?.aiAnalysis?.score;
    const sold   = appData.contactWonSet.has(c.contactId);
    const convId = c.conversationId || c.id;

    let dirIcon = '↗', dirClass = 'dir-out', dirLabel = 'Outbound';
    if (dir === 'inbound') { dirIcon = '↙'; dirClass = 'dir-in';     dirLabel = 'Inbound';  }
    if (dir === 'missed')  { dirIcon = '↗'; dirClass = 'dir-missed'; dirLabel = 'Missed';   }

    return `
      <div class="call-row" data-conv-id="${convId}" data-client-id="${c._clientId}">
        <div class="call-dir-icon ${dirClass}" title="${dirLabel}">${dirIcon}</div>
        <div class="call-row-main">
          <div class="call-row-top">
            <span class="call-contact">${c.contactName || c.phone || 'Unknown'}</span>
            ${sold ? '<span class="badge badge-sold">Sold</span>' : ''}
            ${flagged ? '<span class="badge badge-flag">🚩</span>' : ''}
            ${aiScore ? `<span class="badge badge-ai">AI ${aiScore}/10</span>` : ''}
          </div>
          <div class="call-row-sub">
            ${repName ? `<span class="call-rep" data-rep-id="${c.userId}">${repName}</span>` : ''}
            <span>${getClientName(c._clientId)}</span>
            ${dur ? `<span>${fmtDur(dur)}</span>` : ''}
            ${dateStr ? `<span>${dateStr}</span>` : ''}
          </div>
        </div>
        <svg class="call-chevron" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
      </div>
    `;
  }

  async function openCallDetail(convId, clientId, row) {
    currentCallConvId    = convId;
    currentCallLocId     = clientId;
    currentMessageId     = null;
    currentCallRepId     = null;
    currentCallContactId = null;

    $callDetail.classList.remove('hidden');
    $aiResults.classList.add('hidden');
    $aiAnalyzeBtn.textContent = '✦ Analyze with AI';
    $aiAnalyzeBtn.disabled = false;
    $transcriptSection.classList.remove('hidden');
    $transcriptText.textContent = 'Loading…';
    $existingNote.classList.add('hidden');
    $managerNoteText.value = '';
    $flagToggle.checked = false;

    // Build meta from call data
    const call = appData.calls.find(c => (c.conversationId || c.id) === convId);
    if (call) {
      currentCallRepId     = call.userId;
      currentCallContactId = call.contactId;
      const repName = getRepName(call.userId);
      const dir = getCallDir(call);
      const d = parseDate(call.dateAdded);
      const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      $callMeta.innerHTML = `
        <div class="meta-row">
          <span class="meta-contact">${call.contactName || call.phone || 'Unknown'}</span>
          <span class="meta-badge meta-${dir}">${dir}</span>
        </div>
        <div class="meta-sub">
          <span>Rep: <strong>${repName}</strong></span>
          <span>${getClientName(clientId)}</span>
          ${dateStr ? `<span>${dateStr}</span>` : ''}
        </div>
      `;
    }

    // Reset audio
    $audioEl.src = '';
    $progressFill.style.width = '0%';
    $timeLabel.textContent = '0:00 / 0:00';
    $playBtn.textContent = '▶';

    // Check for cached analysis (Fix 7)
    const cachedNote = appData.notesByConvId[convId];
    if (cachedNote) {
      if (cachedNote.note) {
        $existingNote.textContent = cachedNote.note;
        $existingNote.classList.remove('hidden');
        $managerNoteText.value = cachedNote.note;
      }
      $flagToggle.checked = !!cachedNote.flagged;
      if (cachedNote.aiAnalysis) {
        renderAiResults(cachedNote.aiAnalysis);
        $aiAnalyzeBtn.textContent = '✦ Re-analyze';
      }
    }

    // Fetch recording + transcript
    try {
      const msgPath = `/api/conversations/${convId}/messages?locationId=${clientId}`;
      const msgData = await apiFetch(msgPath);
      // Server returns { messageId, duration, status, userId } summary object
      const messageId = msgData?.messageId;

      if (messageId) {
        currentMessageId = messageId;

        // Load cached note by messageId if we didn't load by convId above
        if (!cachedNote && appData.callNotes[messageId]) {
          const n = appData.callNotes[messageId];
          if (n.note) {
            $existingNote.textContent = n.note;
            $existingNote.classList.remove('hidden');
            $managerNoteText.value = n.note;
          }
          $flagToggle.checked = !!n.flagged;
          if (n.aiAnalysis) {
            renderAiResults(n.aiAnalysis);
            $aiAnalyzeBtn.textContent = '✦ Re-analyze';
          }
        }

        // Recording (proxy via messageId)
        const recProxyUrl = `/api/recording?messageId=${messageId}&locationId=${clientId}`;
        $audioEl.src = recProxyUrl;
        $audioEl.load();
        $audioEl.addEventListener('loadedmetadata', () => {
          $timeLabel.textContent = `0:00 / ${fmtDur($audioEl.duration)}`;
        }, { once: true });

        // Transcript
        try {
          const tPath = `/api/transcription?messageId=${messageId}&locationId=${clientId}`;
          const tRes  = await apiFetch(tPath);
          let text = '';
          if (typeof tRes === 'string') {
            text = tRes;
          } else if (Array.isArray(tRes)) {
            text = tRes.map(seg => seg.transcript || seg.text || '').join(' ');
          } else {
            text = tRes.transcript || tRes.text || '';
          }
          $transcriptText.textContent = text || 'No transcript text returned.';
        } catch (e) {
          $transcriptText.textContent = 'No transcript available for this call.';
        }
      } else {
        $transcriptText.textContent = 'No call message found.';
      }
    } catch (err) {
      console.error('[openCallDetail] error:', err);
      $transcriptText.textContent = 'Error loading call data.';
    }
  }

  // ─── Audio Player ────────────────────────────────────────────────────────────
  $playBtn.addEventListener('click', () => {
    if ($audioEl.paused) { $audioEl.play(); $playBtn.textContent = '⏸'; }
    else                 { $audioEl.pause(); $playBtn.textContent = '▶'; }
  });
  $audioEl.addEventListener('ended', () => { $playBtn.textContent = '▶'; });
  $audioEl.addEventListener('timeupdate', () => {
    const pct = $audioEl.duration ? ($audioEl.currentTime / $audioEl.duration) * 100 : 0;
    $progressFill.style.width = pct + '%';
    $timeLabel.textContent = `${fmtDur($audioEl.currentTime)} / ${fmtDur($audioEl.duration)}`;
  });
  $progressWrap.addEventListener('click', e => {
    if (!$audioEl.duration) return;
    const rect = $progressWrap.getBoundingClientRect();
    $audioEl.currentTime = ((e.clientX - rect.left) / rect.width) * $audioEl.duration;
  });
  $closeDetailBtn.addEventListener('click', () => {
    $callDetail.classList.add('hidden');
    $audioEl.pause();
    $callList.querySelectorAll('.call-row').forEach(r => r.classList.remove('active'));
  });

  // ─── AI Analysis (Fix 2, 7) ──────────────────────────────────────────────────
  $aiAnalyzeBtn.addEventListener('click', runAiAnalysis);

  async function runAiAnalysis() {
    const transcript = $transcriptText.textContent;
    if (!transcript || transcript === 'No transcript available.' || transcript === 'Loading…') {
      showError('No transcript to analyze.');
      return;
    }
    $aiAnalyzeBtn.disabled = true;
    $aiAnalyzeBtn.textContent = '✦ Analyzing…';
    $aiResults.classList.add('hidden');

    const call = appData.calls.find(c => (c.conversationId || c.id) === currentCallConvId);
    const repName = getRepName(currentCallRepId);
    const contactName = call?.contactName || '';

    try {
      const result = await apiFetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          repName,
          contactName,
          repId: currentCallRepId,
        }),
      });

      renderAiResults(result);
      $aiAnalyzeBtn.textContent = '✦ Re-analyze';

      // Fix 7: Save to call-notes
      if (currentMessageId) {
        const savePayload = {
          conversationId: currentCallConvId,
          aiAnalysis: result,
          aiAnalyzedAt: new Date().toISOString(),
        };
        await apiFetch(`/api/call-notes/${currentMessageId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(savePayload),
        }).catch(err => console.warn('[ai-cache] save error:', err));

        // Update local cache
        if (!appData.callNotes[currentMessageId]) appData.callNotes[currentMessageId] = {};
        Object.assign(appData.callNotes[currentMessageId], savePayload);
        if (currentCallConvId) {
          appData.notesByConvId[currentCallConvId] = {
            ...appData.callNotes[currentMessageId],
            messageId: currentMessageId,
          };
        }

        // Refresh call row badge
        const row = $callList.querySelector(`[data-conv-id="${currentCallConvId}"]`);
        if (row) {
          const newRow = document.createElement('div');
          newRow.innerHTML = buildCallRow(appData.calls.find(c => (c.conversationId || c.id) === currentCallConvId));
          row.replaceWith(newRow.firstElementChild);
        }
      }
    } catch (err) {
      showError('AI analysis failed: ' + err.message);
      $aiAnalyzeBtn.textContent = '✦ Analyze with AI';
    } finally {
      $aiAnalyzeBtn.disabled = false;
    }
  }

  // Fix 2: After AI results load, hide plain transcript
  function renderAiResults(data) {
    if (!data) return;
    const score = data.score || 0;
    const scoreColor = score >= 8 ? '#00f5a0' : score >= 6 ? '#f5a623' : '#ff4d4f';

    let html = `
      <div class="ai-score-row">
        <span class="ai-score" style="color:${scoreColor}">${score}/10</span>
        <span class="ai-score-label">AI Score</span>
      </div>
      <div class="ai-summary">${data.summary || ''}</div>
    `;

    if (data.keyMoments?.length) {
      html += `<div class="ai-sub-label">Key Moments</div>`;
      html += `<div class="ai-moments">` + data.keyMoments.map(m =>
        `<div class="ai-moment"><span class="ai-moment-type">${m.type}</span> ${m.description}</div>`
      ).join('') + `</div>`;
    }

    if (data.coachingTip) {
      html += `<div class="ai-sub-label">Coaching Tip</div>
               <div class="ai-coaching">${data.coachingTip}</div>`;
    }

    if (data.labeledTranscript?.length) {
      html += `<div class="ai-sub-label">Labeled Transcript</div>
               <div class="ai-transcript">` +
        data.labeledTranscript.map(seg =>
          `<div class="ai-seg ai-seg-${seg.speaker === 'Rep' ? 'rep' : 'lead'}">
             <span class="ai-seg-label">${seg.speaker}</span>
             <span class="ai-seg-text">${seg.text}</span>
           </div>`
        ).join('') + `</div>`;
    }

    $aiResults.innerHTML = html;
    $aiResults.classList.remove('hidden');
    // Fix 2: Hide plain transcript once AI analysis renders
    $transcriptSection.classList.add('hidden');
  }

  // ─── Manager Notes ────────────────────────────────────────────────────────────
  $saveNoteBtn.addEventListener('click', async () => {
    if (!currentMessageId && !currentCallConvId) return;
    const note    = $managerNoteText.value.trim();
    const flagged = $flagToggle.checked;

    try {
      if (currentMessageId) {
        await apiFetch(`/api/call-notes/${currentMessageId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note, flagged, conversationId: currentCallConvId }),
        });
        if (!appData.callNotes[currentMessageId]) appData.callNotes[currentMessageId] = {};
        Object.assign(appData.callNotes[currentMessageId], { note, flagged, conversationId: currentCallConvId });
        if (currentCallConvId) {
          if (!appData.notesByConvId[currentCallConvId]) appData.notesByConvId[currentCallConvId] = {};
          Object.assign(appData.notesByConvId[currentCallConvId], { note, flagged, messageId: currentMessageId });
        }
      }
      if (note) {
        $existingNote.textContent = note;
        $existingNote.classList.remove('hidden');
      }
      $saveNoteBtn.textContent = '✓ Saved';
      setTimeout(() => { $saveNoteBtn.textContent = 'Save Note'; }, 2000);
      renderCallLog();
    } catch (err) {
      showError('Failed to save note: ' + err.message);
    }
  });

  // ─── SMS / Conversations Tab ─────────────────────────────────────────────────
  function getFilteredSms() {
    const search = smsFilters.search.toLowerCase().trim();
    return appData.smsConvos.filter(c => {
      if (smsFilters.clientId !== 'all' && c.locationId !== smsFilters.clientId) return false;
      if (myViewRepId && c.assignedTo !== myViewRepId) return false;
      if (search && !(c.contactName || c.phone || '').toLowerCase().includes(search)) return false;
      if (smsFilters.outcome !== 'all') {
        if (smsFilters.outcome === 'sold') {
          if (!appData.contactWonSet.has(c.contactId)) return false;
        } else if (smsFilters.outcome === 'pipeline') {
          if (appData.contactWonSet.has(c.contactId)) return false;
          if (!appData.allContactOppMap[c.contactId]?.length) return false;
        }
      }
      return true;
    });
  }

  function renderSmsList() {
    const convos = getFilteredSms();
    $smsCount.textContent = `${convos.length} conversations`;

    if (!convos.length) {
      $smsList.innerHTML = '<div class="empty-state">No SMS conversations found.</div>';
      return;
    }

    const sold = appData.contactWonSet;

    $smsList.innerHTML = convos.map(c => {
      const d = parseDate(c.dateUpdated || c.lastMessageDate);
      const dateStr = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const isSold = sold.has(c.contactId);
      const hasOpp = !!appData.allContactOppMap[c.contactId]?.length;

      return `
        <div class="call-row" data-conv-id="${c.id}" data-location-id="${c.locationId}">
          <div class="call-dir-icon dir-sms">💬</div>
          <div class="call-row-main">
            <div class="call-row-top">
              <span class="call-contact">${c.contactName || c.phone || 'Unknown'}</span>
              <div class="sms-badges">
                ${isSold ? '<span class="badge badge-sold">Sold</span>' : ''}
                ${!isSold && hasOpp ? '<span class="badge badge-pipeline">Pipeline</span>' : ''}
              </div>
            </div>
            <div class="call-row-sub">
              <span>${getClientName(c.locationId)}</span>
              ${c.lastMessageBody ? `<span class="sms-preview">${c.lastMessageBody.slice(0, 60)}…</span>` : ''}
              ${dateStr ? `<span>${dateStr}</span>` : ''}
            </div>
          </div>
          <svg class="call-chevron" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
        </div>
      `;
    }).join('');

    $smsList.querySelectorAll('.call-row').forEach(row => {
      row.addEventListener('click', () => {
        $smsList.querySelectorAll('.call-row').forEach(r => r.classList.remove('active'));
        row.classList.add('active');
        openSmsThread(row.dataset.convId, row.dataset.locationId);
      });
    });
  }

  // Fix 7: Proper chat bubble UI — grouped by direction, sender label, auto-scroll
  async function openSmsThread(convId, locId) {
    $smsThreadPanel.classList.remove('hidden');
    $smsThreadContact.textContent = 'Loading…';
    $smsThreadMessages.innerHTML = '<div class="empty-state">Loading…</div>';

    try {
      const data = await apiFetch(`/api/conversations/${convId}/thread?locationId=${locId}`);
      const raw = data?.messages?.messages || data?.messages || [];
      const convo = appData.smsConvos.find(c => c.id === convId);
      const contactName = convo?.contactName || convo?.phone || 'Contact';
      $smsThreadContact.textContent = contactName;

      if (!raw.length) {
        $smsThreadMessages.innerHTML = '<div class="empty-state">No messages in thread.</div>';
        return;
      }

      // Sort oldest → newest
      const messages = [...raw].sort((a, b) =>
        (parseDate(a.dateAdded || a.createdAt) || 0) - (parseDate(b.dateAdded || b.createdAt) || 0)
      );

      // Group consecutive messages by direction
      const groups = [];
      let cur = null;
      messages.forEach(m => {
        const isOut = (m.direction || '').toLowerCase() === 'outbound';
        if (!cur || cur.isOut !== isOut) {
          cur = { isOut, messages: [] };
          groups.push(cur);
        }
        cur.messages.push(m);
      });

      $smsThreadMessages.innerHTML = groups.map(g => {
        const firstMsg = g.messages[0];
        const d = parseDate(firstMsg.dateAdded || firstMsg.createdAt);
        const timeStr = d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const sender  = g.isOut ? 'Rep' : contactName;

        const bubbles = g.messages.map(m => {
          const body = (m.body || m.text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
          return `<div class="chat-bubble chat-${g.isOut ? 'out' : 'in'}">${body || '<em style="color:var(--sub)">Media / attachment</em>'}</div>`;
        }).join('');

        return `
          <div class="chat-group chat-group-${g.isOut ? 'out' : 'in'}">
            <div class="chat-group-header">${sender}${timeStr ? ` · ${timeStr}` : ''}</div>
            ${bubbles}
          </div>
        `;
      }).join('');

      $smsThreadMessages.scrollTop = $smsThreadMessages.scrollHeight;
    } catch (err) {
      $smsThreadMessages.innerHTML = `<div class="empty-state">Failed to load: ${err.message}</div>`;
    }
  }

  $closeSmsBtn.addEventListener('click', () => {
    $smsThreadPanel.classList.add('hidden');
    $smsList.querySelectorAll('.call-row').forEach(r => r.classList.remove('active'));
  });

  // ─── SPIFF Tab (Fix 1) ───────────────────────────────────────────────────────
  function buildSpiffWeekOptions() {
    while ($spiffWeekSelect.options.length) $spiffWeekSelect.remove(0);

    const now = new Date();
    const day = now.getDay(); // 0=Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    for (let w = 0; w < 8; w++) {
      const start = new Date(monday);
      start.setDate(monday.getDate() - w * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);

      const label = w === 0
        ? `Current Week (${fmtWeekLabel(start, end)})`
        : fmtWeekLabel(start, end);
      $spiffWeekSelect.add(new Option(label, start.toISOString()));
    }
  }

  function fmtWeekLabel(start, end) {
    const opts = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
  }

  function renderSpiff() {
    const val = $spiffWeekSelect.value;
    const start = val ? new Date(val) : (() => {
      const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); d.setHours(0,0,0,0); return d;
    })();
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    $spiffBannerRange.textContent = fmtWeekLabel(start, end);

    // Fix 1: Filter by lastStageChangeAt (win date) not dateAdded
    const weekWonOpps = appData.opportunities.filter(o => {
      const d = getWonDate(o);
      return d && d >= start && d <= end;
    });

    const reps = myViewRepId
      ? appData.config.reps.filter(r => r.userId === myViewRepId)
      : appData.config.reps;
    const rows = reps.map(r => {
      // Fix 2, 3: use getOppRepId for attribution; only count monetaryValue > 0
      const rWon  = weekWonOpps.filter(o => getOppRepId(o) === r.userId);
      const sold  = rWon.length;
      const rev   = rWon.reduce((s, o) => s + (o.monetaryValue > 0 ? o.monetaryValue : 0), 0);
      const calls = appData.calls.filter(c => {
        if (c.userId !== r.userId) return false;
        const d = parseDate(c.dateAdded);
        return d && d >= start && d <= end;
      }).length;
      return { rep: r, sold, rev, calls };
    }).filter(r => r.sold > 0 || r.calls > 0);

    rows.sort((a, b) => b.sold - a.sold || b.rev - a.rev);

    if (!rows.length) {
      $spiffLbList.innerHTML = '<div class="empty-state">No activity found for this week.</div>';
      return;
    }

    $spiffLbList.innerHTML = rows.map((row, i) => {
      const crown = i === 0 && row.sold > 0 ? ' 👑' : '';
      return `
        <div class="lb-row spiff-row" data-rep-id="${row.rep.userId}">
          <span class="lb-rank spiff-rank">${i + 1}${crown}</span>
          <div class="lb-avatar">${initials(row.rep.name)}</div>
          <div class="lb-info">
            <div class="lb-name">${row.rep.name}</div>
            <div class="lb-sub">${row.calls} calls this week</div>
          </div>
          <div class="lb-right">
            <div class="lb-val">${row.sold}</div>
            <div class="lb-sub">${fmt$(row.rev)}</div>
          </div>
        </div>
      `;
    }).join('');

    $spiffLbList.querySelectorAll('.spiff-row[data-rep-id]').forEach(row => {
      row.addEventListener('click', () => openRepProfile(row.dataset.repId));
    });
  }

  // ─── Settings Panel (Fix 6) ──────────────────────────────────────────────────
  function openSettings() {
    $settingsPanel.classList.remove('hidden');
    $settingsOverlay.classList.remove('hidden');
  }
  function closeSettings() {
    $settingsPanel.classList.add('hidden');
    $settingsOverlay.classList.add('hidden');
  }

  function populateRubricEditor() {
    const rubric = appData.scoringRubric;
    $rubricDefaultText.value = rubric.default || '';
    const repId = $rubricRepSelect.value;
    $rubricOverrideText.value = repId ? (rubric.repOverrides?.[repId] || '') : '';
  }

  $settingsBtn.addEventListener('click', openSettings);
  $settingsClose.addEventListener('click', closeSettings);
  $settingsOverlay.addEventListener('click', closeSettings);

  $rubricRepSelect.addEventListener('change', () => {
    const repId = $rubricRepSelect.value;
    $rubricOverrideText.value = repId ? (appData.scoringRubric.repOverrides?.[repId] || '') : '';
  });

  $saveRubricBtn.addEventListener('click', async () => {
    try {
      $saveRubricBtn.textContent = 'Saving…';
      const updated = { ...appData.scoringRubric, default: $rubricDefaultText.value };
      await apiFetch('/api/scoring-rubric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default: updated.default }),
      });
      appData.scoringRubric.default = updated.default;
      $saveRubricBtn.textContent = '✓ Saved';
      setTimeout(() => { $saveRubricBtn.textContent = 'Save Rubric'; }, 2000);
    } catch (err) {
      showError('Failed to save rubric: ' + err.message);
      $saveRubricBtn.textContent = 'Save Rubric';
    }
  });

  $saveRepOverrideBtn.addEventListener('click', async () => {
    const repId = $rubricRepSelect.value;
    if (!repId) { showError('Select a rep first.'); return; }
    try {
      $saveRepOverrideBtn.textContent = 'Saving…';
      const overrides = { ...(appData.scoringRubric.repOverrides || {}), [repId]: $rubricOverrideText.value };
      await apiFetch('/api/scoring-rubric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repOverrides: overrides }),
      });
      appData.scoringRubric.repOverrides = overrides;
      $saveRepOverrideBtn.textContent = '✓ Saved';
      setTimeout(() => { $saveRepOverrideBtn.textContent = 'Save Rep Override'; }, 2000);
    } catch (err) {
      showError('Failed to save override: ' + err.message);
      $saveRepOverrideBtn.textContent = 'Save Rep Override';
    }
  });

  // ─── Rep Profile Panel (slide-in) ────────────────────────────────────────────
  function openRepProfile(repId) {
    const rep = getRepById(repId);
    if (!rep) return;
    currentProfileRepId = repId;

    // Determine primary location for this rep
    const repCall = appData.calls.find(c => c.userId === repId);
    currentPanelLocId = repCall ? repCall._clientId : (appData.config.clients[0]?.locationId || null);

    // Header
    document.getElementById('rp-avatar').textContent = initials(rep.name);
    document.getElementById('rp-name').textContent = rep.name;
    document.getElementById('rp-sub').textContent = getClientName(currentPanelLocId) || '';

    // Stats row
    const repCalls = appData.calls.filter(c => c.userId === repId);
    const repWon   = appData.opportunities.filter(o =>
      (o.status || '').toLowerCase() === 'won' && getOppRepId(o) === repId
    );
    const talkSec  = repCalls.reduce((s, c) => s + getCallDuration(c), 0);
    const sold     = repWon.length;
    const rev      = repWon.reduce((s, o) => s + (o.monetaryValue > 0 ? o.monetaryValue : 0), 0);
    let rate = '—';
    if (repCalls.length > 0) {
      const raw = (sold / repCalls.length) * 100;
      if (raw <= 100) rate = raw.toFixed(1) + '%';
    }
    const aiScores = repCalls
      .map(c => appData.notesByConvId[c.conversationId || c.id]?.aiAnalysis?.score)
      .filter(s => s != null);
    const avgAi = aiScores.length
      ? (aiScores.reduce((a, b) => a + b, 0) / aiScores.length).toFixed(1)
      : '—';

    document.getElementById('rp-stats').innerHTML = `
      <div class="rp-stat"><div class="rp-stat-val">${repCalls.length}</div><div class="rp-stat-lbl">Calls</div></div>
      <div class="rp-stat"><div class="rp-stat-val">${sold}</div><div class="rp-stat-lbl">Sold</div></div>
      <div class="rp-stat"><div class="rp-stat-val">${fmt$(rev)}</div><div class="rp-stat-lbl">Revenue</div></div>
      <div class="rp-stat"><div class="rp-stat-val" style="color:${avgAi !== '—' ? '#00f5a0' : 'inherit'}">${avgAi}</div><div class="rp-stat-lbl">Avg AI</div></div>
      <div class="rp-stat"><div class="rp-stat-val">${rate}</div><div class="rp-stat-lbl">Close Rate</div></div>
      <div class="rp-stat"><div class="rp-stat-val">${fmtDurLong(talkSec)}</div><div class="rp-stat-lbl">Talk Time</div></div>
    `;

    // Open panel & switch to pipeline tab
    $repPanel.classList.add('open');
    $repPanelOverlay.classList.remove('hidden');
    switchRepTab('pipeline');
  }

  function closeRepProfile() {
    $repPanel.classList.remove('open');
    $repPanelOverlay.classList.add('hidden');
    currentProfileRepId = null;
    currentPanelLocId = null;
  }

  function switchRepTab(name) {
    document.querySelectorAll('.rp-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.rpTab === name);
    });
    document.querySelectorAll('.rp-pane').forEach(p => {
      p.classList.toggle('rp-pane-hidden', p.id !== `rp-pane-${name}`);
    });
    if (!currentProfileRepId) return;
    if      (name === 'pipeline')     renderProfilePipeline(currentProfileRepId, currentPanelLocId);
    else if (name === 'appointments') renderProfileAppointments(currentProfileRepId, currentPanelLocId);
    else if (name === 'calls')        renderProfileCalls(currentProfileRepId);
    else if (name === 'sms')          renderProfileSms(currentProfileRepId);
    else if (name === 'scores')       renderProfileScores(currentProfileRepId);
    else if (name === 'notes')        renderProfileNotes(currentProfileRepId);
  }

  document.getElementById('rep-panel-close').addEventListener('click', closeRepProfile);
  $repPanelOverlay.addEventListener('click', closeRepProfile);
  document.querySelector('.rp-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.rp-tab');
    if (btn) switchRepTab(btn.dataset.rpTab);
  });

  // ─── Pipeline Funnel ──────────────────────────────────────────────────────────
  async function renderProfilePipeline(repId, locId) {
    const pane = document.getElementById('rp-pane-pipeline');
    pane.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading pipeline…</div>';
    try {
      if (!locId) throw new Error('No location found for this rep');
      const data = await apiFetch(`/api/reps/${repId}/pipeline-stats?locationId=${locId}`);
      const { stageCounts = {}, total = 0 } = data;
      if (!total) {
        pane.innerHTML = '<div class="empty-state">No pipeline opportunities found for this rep.</div>';
        return;
      }
      const STAGE_ORDER = [
        'New Lead','Contacted','Talked/Brushed Off','Connected',
        'Call Scheduled','No Show','Pitched','Closed Won','Closed Lost',
      ];
      const stages = Object.entries(stageCounts).sort(([a], [b]) => {
        const ai = STAGE_ORDER.indexOf(a), bi = STAGE_ORDER.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return (stageCounts[b] || 0) - (stageCounts[a] || 0);
      });
      const maxCount = Math.max(...stages.map(([, c]) => c), 1);
      pane.innerHTML = `
        <div class="rp-funnel-header">${total} opportunities · Pipeline activity (assigned + following)</div>
        <div class="rp-funnel">
          ${stages.map(([name, count]) => {
            const pct = Math.round((count / maxCount) * 100);
            const cls = name.toLowerCase().includes('won') ? 'won'
              : name.toLowerCase().includes('lost') ? 'lost' : '';
            return `
              <div class="rp-funnel-row">
                <div class="rp-funnel-label">${name}</div>
                <div class="rp-funnel-bar-wrap">
                  <div class="rp-funnel-bar ${cls}" style="width:${Math.max(pct, 4)}%"></div>
                  <span class="rp-funnel-count">${count}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      pane.innerHTML = `<div class="empty-state">Could not load pipeline data.<br><small>${err.message}</small></div>`;
    }
  }

  // ─── Appointments ─────────────────────────────────────────────────────────────
  async function renderProfileAppointments(repId, locId) {
    const pane = document.getElementById('rp-pane-appointments');
    pane.innerHTML = '<div class="loading-row"><span class="spinner"></span> Loading appointments…</div>';
    try {
      if (!locId) { pane.innerHTML = '<div class="empty-state">No location found.</div>'; return; }
      const data = await apiFetch(`/api/reps/${repId}/appointments?locationId=${locId}`).catch(() => ({ events: [] }));
      const events = data.events || [];
      const scheduledOpps = appData.opportunities.filter(o => {
        const sn = (o.pipelineStageName || '').toLowerCase();
        return (sn.includes('call scheduled') || sn.includes('appointment')) && (
          o.assignedTo === repId ||
          (Array.isArray(o.followers) && o.followers.includes(repId))
        );
      });
      let html = '';
      if (events.length) {
        html += `<div class="rp-section-label">Upcoming Appointments (${events.length})</div>`;
        html += events.map(e => {
          const d = parseDate(e.startTime);
          const ds = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
          return `<div class="rp-appt-row">
            <div class="rp-appt-dot"></div>
            <div class="rp-appt-info">
              <div class="rp-appt-contact">${e.title || e.contactName || 'Appointment'}</div>
              <div class="rp-appt-sub">${ds}${e.appoinmentStatus ? ' · ' + e.appoinmentStatus : ''}</div>
            </div>
          </div>`;
        }).join('');
      } else {
        html += '<div class="empty-state">No upcoming calendar appointments.</div>';
      }
      if (scheduledOpps.length) {
        html += `<div class="rp-section-label" style="margin-top:4px">Call Scheduled in Pipeline (${scheduledOpps.length})</div>`;
        html += scheduledOpps.map(o => {
          const name = o.contact?.name || o.contactName || o.name || 'Lead';
          return `<div class="rp-appt-row">
            <div class="rp-appt-dot" style="background:#3b82f6"></div>
            <div class="rp-appt-info">
              <div class="rp-appt-contact">${name}</div>
              <div class="rp-appt-sub">${o.pipelineStageName || 'Call Scheduled'} · ${o.status || ''}</div>
            </div>
          </div>`;
        }).join('');
      }
      pane.innerHTML = html;
    } catch (err) {
      pane.innerHTML = '<div class="empty-state">Failed to load appointments.</div>';
    }
  }

  // ─── Profile Calls ────────────────────────────────────────────────────────────
  function renderProfileCalls(repId) {
    const list   = document.getElementById('rp-calls-list');
    const search = document.getElementById('rp-calls-search');
    const repCalls = [...appData.calls]
      .filter(c => c.userId === repId)
      .sort((a, b) => (parseDate(b.dateAdded) || 0) - (parseDate(a.dateAdded) || 0));

    function doRender(q) {
      const filtered = q
        ? repCalls.filter(c => (c.contactName || c.phone || '').toLowerCase().includes(q))
        : repCalls;
      list.innerHTML = filtered.length
        ? filtered.map(c => buildCallRow(c)).join('')
        : '<div class="empty-state">No calls match.</div>';
      list.querySelectorAll('.call-row').forEach(row => {
        row.addEventListener('click', e => {
          if (e.target.closest('.call-rep')) return;
          closeRepProfile();
          switchTab('calls');
          openCallDetail(row.dataset.convId, row.dataset.clientId, row);
        });
      });
    }

    search.value = '';
    search.oninput = () => doRender(search.value.trim().toLowerCase());
    if (!repCalls.length) {
      list.innerHTML = '<div class="empty-state">No calls found for this rep.</div>';
    } else {
      doRender('');
    }
  }

  // ─── Profile SMS ──────────────────────────────────────────────────────────────
  function renderProfileSms(repId) {
    const list = document.getElementById('rp-sms-list');
    const repSms = appData.smsConvos.filter(c => c.assignedTo === repId);
    if (!repSms.length) {
      list.innerHTML = '<div class="empty-state">No SMS conversations for this rep.</div>';
      return;
    }
    list.innerHTML = repSms.map(c => {
      const d  = parseDate(c.dateUpdated || c.lastMessageDate);
      const ds = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const isSold = appData.contactWonSet.has(c.contactId);
      const hasOpp = !!appData.allContactOppMap[c.contactId]?.length;
      return `
        <div class="call-row" data-conv-id="${c.id}" data-location-id="${c.locationId}">
          <div class="call-dir-icon dir-sms">💬</div>
          <div class="call-row-main">
            <div class="call-row-top">
              <span class="call-contact">${c.contactName || c.phone || 'Unknown'}</span>
              <div class="sms-badges">
                ${isSold ? '<span class="badge badge-sold">Sold</span>' : ''}
                ${!isSold && hasOpp ? '<span class="badge badge-pipeline">Pipeline</span>' : ''}
              </div>
            </div>
            <div class="call-row-sub">
              ${c.lastMessageBody ? `<span class="sms-preview">${c.lastMessageBody.slice(0,60)}…</span>` : ''}
              ${ds ? `<span>${ds}</span>` : ''}
            </div>
          </div>
          <svg class="call-chevron" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
        </div>
      `;
    }).join('');
    list.querySelectorAll('.call-row').forEach(row => {
      row.addEventListener('click', () => {
        closeRepProfile();
        switchTab('sms');
        openSmsThread(row.dataset.convId, row.dataset.locationId);
      });
    });
  }

  // ─── Profile Scores ───────────────────────────────────────────────────────────
  function renderProfileScores(repId) {
    const avgWrap = document.getElementById('rp-avg-score');
    const list    = document.getElementById('rp-scores-list');
    const repCalls = appData.calls.filter(c => c.userId === repId);
    const scored = repCalls
      .map(c => {
        const note = appData.notesByConvId[c.conversationId || c.id];
        return note?.aiAnalysis?.score != null
          ? { call: c, score: note.aiAnalysis.score, tip: note.aiAnalysis.coachingTip || '' }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) {
      avgWrap.innerHTML = '';
      list.innerHTML = '<div class="empty-state">No AI-analyzed calls for this rep yet.</div>';
      return;
    }
    const avg = (scored.reduce((s, x) => s + x.score, 0) / scored.length).toFixed(1);
    const avgColor = avg >= 8 ? '#00f5a0' : avg >= 6 ? '#f5a623' : '#ef4444';
    avgWrap.innerHTML = `
      <div class="rp-avg-score-box">
        <span class="rp-avg-val" style="color:${avgColor}">${avg}/10</span>
        <span class="rp-avg-lbl">Avg AI Score · ${scored.length} analyzed</span>
      </div>
    `;
    list.innerHTML = scored.map(x => {
      const d  = parseDate(x.call.dateAdded);
      const ds = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      const sc = x.score >= 9 ? '#00f5a0' : x.score >= 7 ? '#f5a623' : '#ef4444';
      const convId = x.call.conversationId || x.call.id;
      return `
        <div class="call-row" data-conv-id="${convId}" data-client-id="${x.call._clientId}">
          <div class="rp-score-badge" style="background:${sc}18;border:1px solid ${sc}50;color:${sc}">${x.score}</div>
          <div class="call-row-main">
            <div class="call-row-top" style="font-size:12px">${x.call.contactName || x.call.phone || 'Unknown'}</div>
            <div class="call-row-sub">
              ${ds ? `<span>${ds}</span>` : ''}
              ${x.tip ? `<span class="rp-coaching-tip">${x.tip.slice(0, 80)}…</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
    list.querySelectorAll('.call-row').forEach(row => {
      row.addEventListener('click', () => {
        closeRepProfile();
        switchTab('calls');
        openCallDetail(row.dataset.convId, row.dataset.clientId, row);
      });
    });
  }

  // ─── Profile Notes ────────────────────────────────────────────────────────────
  async function renderProfileNotes(repId) {
    const callNotesList    = document.getElementById('rp-call-notes-list');
    const generalNotesList = document.getElementById('rp-general-notes-list');
    const noteText         = document.getElementById('rp-general-note-text');
    const saveBtn          = document.getElementById('rp-save-general-note');

    // Call-level notes
    const repCalls = appData.calls.filter(c => c.userId === repId);
    const callNotes = repCalls
      .map(c => {
        const convId = c.conversationId || c.id;
        const note   = appData.notesByConvId[convId];
        return note?.note ? { call: c, note: note.note, convId } : null;
      })
      .filter(Boolean);

    if (callNotes.length) {
      callNotesList.innerHTML = `
        <div class="rp-section-label">Call Notes (${callNotes.length})</div>
        ${callNotes.map(n => {
          const d  = parseDate(n.call.dateAdded);
          const ds = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
          return `<div class="rp-note-item" style="cursor:pointer" data-conv-id="${n.convId}" data-client-id="${n.call._clientId}">
            <div class="rp-note-meta">${n.call.contactName || 'Unknown'} · ${ds}</div>
            <div class="rp-note-text">${n.note}</div>
          </div>`;
        }).join('')}
      `;
      callNotesList.querySelectorAll('.rp-note-item').forEach(item => {
        item.addEventListener('click', () => {
          closeRepProfile();
          switchTab('calls');
          openCallDetail(item.dataset.convId, item.dataset.clientId, item);
        });
      });
    } else {
      callNotesList.innerHTML = '<div class="empty-state" style="font-size:12px;padding:16px 16px 0">No call notes yet.</div>';
    }

    // General rep notes
    try {
      const data  = await apiFetch(`/api/rep-notes/${repId}`);
      const notes = data.notes || [];
      generalNotesList.innerHTML = notes.length
        ? `<div class="rp-section-label" style="margin-top:4px">General Notes</div>` +
          notes.map(n => {
            const d  = parseDate(n.savedAt);
            const ds = d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            return `<div class="rp-note-item">
              <div class="rp-note-meta">General Note · ${ds}</div>
              <div class="rp-note-text">${n.note}</div>
            </div>`;
          }).join('')
        : '';
    } catch { generalNotesList.innerHTML = ''; }

    // Save handler
    saveBtn.onclick = async () => {
      const note = noteText.value.trim();
      if (!note) return;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        await apiFetch(`/api/rep-notes/${repId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note }),
        });
        saveBtn.textContent = '✓ Saved';
        noteText.value = '';
        setTimeout(() => { saveBtn.textContent = 'Save Note'; saveBtn.disabled = false; }, 2000);
        renderProfileNotes(repId);
      } catch (err) {
        showError('Failed to save note: ' + err.message);
        saveBtn.textContent = 'Save Note';
        saveBtn.disabled = false;
      }
    };
  }

  // ─── Manager / My View Toggle ─────────────────────────────────────────────────
  function initViewToggle() {
    const stored = localStorage.getItem('myViewRepId');
    if (stored) {
      myViewRepId = stored;
      $viewModeBtn.textContent = 'My View';
      $viewModeBtn.classList.add('btn-view-active');
      $myViewRepSel.classList.remove('hidden');
      $myViewRepSel.value = stored;
    }

    $viewModeBtn.addEventListener('click', () => {
      if (myViewRepId) {
        myViewRepId = null;
        localStorage.removeItem('myViewRepId');
        $viewModeBtn.textContent = 'Manager View';
        $viewModeBtn.classList.remove('btn-view-active');
        $myViewRepSel.classList.add('hidden');
      } else {
        const firstId = $myViewRepSel.value || appData.config.reps[0]?.userId;
        if (!firstId) return;
        myViewRepId = firstId;
        localStorage.setItem('myViewRepId', myViewRepId);
        $myViewRepSel.value = myViewRepId;
        $viewModeBtn.textContent = 'My View';
        $viewModeBtn.classList.add('btn-view-active');
        $myViewRepSel.classList.remove('hidden');
      }
      renderCommandCenter();
      renderCallLog();
      renderSmsList();
      renderSpiff();
    });

    $myViewRepSel.addEventListener('change', () => {
      myViewRepId = $myViewRepSel.value || null;
      if (myViewRepId) localStorage.setItem('myViewRepId', myViewRepId);
      else localStorage.removeItem('myViewRepId');
      renderCommandCenter();
      renderCallLog();
      renderSmsList();
      renderSpiff();
    });
  }

  // ─── Tab Navigation ──────────────────────────────────────────────────────────
  function switchTab(name) {
    activeTab = name;
    $navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-section').forEach(s => {
      s.classList.toggle('active', s.id === `tab-${name}`);
      s.classList.toggle('hidden', s.id !== `tab-${name}`);
    });
  }

  $navTabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // ─── Call Filter Controls ────────────────────────────────────────────────────
  $callsSearch.addEventListener('input', () => {
    callFilters.search = $callsSearch.value;
    renderCallLog();
  });

  $callsRepSelect.addEventListener('change', () => {
    callFilters.repId = $callsRepSelect.value === 'all' ? null : $callsRepSelect.value;
    renderCallLog();
  });

  $callsClientSelect.addEventListener('change', () => {
    callFilters.clientId = $callsClientSelect.value;
    renderCallLog();
  });

  $callsDateSelect.addEventListener('change', () => {
    const val = $callsDateSelect.value;
    if (val === 'custom') {
      $customDateInputs.classList.remove('hidden');
      callFilters.fromDate = null;
      callFilters.toDate   = null;
    } else {
      $customDateInputs.classList.add('hidden');
      callFilters.days      = parseInt(val, 10);
      callFilters.fromDate  = null;
      callFilters.toDate    = null;
    }
    renderCallLog();
  });

  $callsFromDate.addEventListener('change', () => {
    callFilters.fromDate = $callsFromDate.value ? new Date($callsFromDate.value + 'T00:00:00') : null;
    renderCallLog();
  });

  $callsToDate.addEventListener('change', () => {
    callFilters.toDate = $callsToDate.value ? new Date($callsToDate.value + 'T23:59:59') : null;
    renderCallLog();
  });

  $dirTabs.addEventListener('click', e => {
    const btn = e.target.closest('.dtab');
    if (!btn) return;
    $dirTabs.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    callFilters.dir = btn.dataset.dir;
    renderCallLog();
  });

  $callsOutcomeSelect.addEventListener('change', () => {
    callFilters.outcome = $callsOutcomeSelect.value;
    renderCallLog();
  });

  $callsMinDurSelect.addEventListener('change', () => {
    callFilters.minDuration = parseInt($callsMinDurSelect.value, 10) || 0;
    renderCallLog();
  });

  $callsAiScoreSelect.addEventListener('change', () => {
    callFilters.minAiScore = parseInt($callsAiScoreSelect.value, 10) || 0;
    renderCallLog();
  });

  $callsFlaggedToggle.addEventListener('change', () => {
    callFilters.flaggedOnly = $callsFlaggedToggle.checked;
    renderCallLog();
  });

  $clearFiltersBtn.addEventListener('click', clearAllCallFilters);

  // ─── CC Filter Controls ──────────────────────────────────────────────────────
  $ccClientSelect.addEventListener('change', () => {
    ccFilters.clientId = $ccClientSelect.value;
    renderCommandCenter();
  });

  $ccLocationSelect.addEventListener('change', () => {
    ccFilters.pipelineId = $ccLocationSelect.value;
    renderCommandCenter();
  });

  $ccDateSelect.addEventListener('change', () => {
    ccFilters.days = parseInt($ccDateSelect.value, 10);
    renderCommandCenter();
  });

  $repSort.addEventListener('change', () => renderCommandCenter());
  $clientSort.addEventListener('change', () => renderCommandCenter());

  // ─── SMS Filter Controls ─────────────────────────────────────────────────────
  $smsSearch.addEventListener('input', () => {
    smsFilters.search = $smsSearch.value;
    renderSmsList();
  });

  $smsClientSelect.addEventListener('change', () => {
    smsFilters.clientId = $smsClientSelect.value;
    renderSmsList();
  });

  $smsOutcomeSelect.addEventListener('change', () => {
    smsFilters.outcome = $smsOutcomeSelect.value;
    renderSmsList();
  });

  // ─── SPIFF Controls ──────────────────────────────────────────────────────────
  $spiffWeekSelect.addEventListener('change', renderSpiff);

  // ─── Refresh ─────────────────────────────────────────────────────────────────
  $refreshBtn.addEventListener('click', () => {
    Object.keys(callsCache).forEach(k => delete callsCache[k]);
    fetchAll();
  });

  // ─── Init ────────────────────────────────────────────────────────────────────
  fetchAll();
})();
