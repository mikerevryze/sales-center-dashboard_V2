(function () {
  'use strict';

  // ─── DOM refs ───────────────────────────────────────────────────────────────
  const $locationSelect   = document.getElementById('location-select');
  const $pipelineSelect   = document.getElementById('pipeline-select');
  const $dateRangeSelect  = document.getElementById('date-range-select');
  const $manageRepsBtn    = document.getElementById('manage-reps-btn');
  const $leaderboardSort  = document.getElementById('leaderboard-sort');
  const $leaderboardList  = document.getElementById('leaderboard-list');
  const $leaderboardEmpty = document.getElementById('leaderboard-empty');
  const $callLogTitle     = document.getElementById('call-log-title');
  const $callLogList      = document.getElementById('call-log-list');
  const $callFilterTabs   = document.getElementById('call-filter-tabs');
  const $callDetailPanel  = document.getElementById('call-detail-panel');
  const $callDetailMeta   = document.getElementById('call-detail-meta');
  const $closeDetailBtn   = document.getElementById('close-detail-btn');
  const $playPauseBtn     = document.getElementById('play-pause-btn');
  const $progressContainer= document.getElementById('progress-container');
  const $progressBar      = document.getElementById('progress-bar');
  const $timeDisplay      = document.getElementById('time-display');
  const $audioEl          = document.getElementById('audio-el');
  const $transcriptText   = document.getElementById('transcript-text');
  const $repsModalOverlay = document.getElementById('reps-modal-overlay');
  const $repsModalBody    = document.getElementById('reps-modal-body');
  const $closeModalBtn    = document.getElementById('close-modal-btn');
  const $cancelRepsBtn    = document.getElementById('cancel-reps-btn');
  const $saveRepsBtn      = document.getElementById('save-reps-btn');
  const $errorBanner      = document.getElementById('error-banner');

  const $metricSold    = document.getElementById('metric-sold');
  const $metricRevenue = document.getElementById('metric-revenue');
  const $metricAppts   = document.getElementById('metric-appts');
  const $metricCalls   = document.getElementById('metric-calls');
  const $metricClose   = document.getElementById('metric-close');

  // ─── State ──────────────────────────────────────────────────────────────────
  let state = {
    locations: [],
    currentLocationId: '',
    pipelines: [],
    currentPipelineId: '',
    repsConfig: [],          // array of { id, name, email }
    repStats: [],            // computed stats per rep
    allCalls: [],            // raw conversation data for all reps
    selectedRepId: null,
    selectedRepCalls: [],
    callFilter: 'all',
    currentCallMessages: [],
    opportunities: [],
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function showError(msg) {
    $errorBanner.textContent = msg;
    $errorBanner.classList.remove('hidden');
    setTimeout(() => $errorBanner.classList.add('hidden'), 8000);
  }

  async function api(path) {
    const res = await fetch(path);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
    return data;
  }

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
    return data;
  }

  function getStartDate() {
    const days = parseInt($dateRangeSelect.value, 10);
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function formatCurrency(val) {
    return '$' + Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function getCallDirection(conv) {
    const dir = (conv.lastMessageDirection || conv.direction || '').toLowerCase();
    if (dir.includes('outbound') || dir === 'outgoing') return 'outbound';
    if (dir.includes('inbound') || dir === 'incoming') return 'inbound';
    if (conv.lastMessageType === 'TYPE_CALL' && conv.status === 'missed') return 'missed';
    return 'outbound';
  }

  function getCallOutcome(conv) {
    const tags = (conv.tags || []).map(t => t.toLowerCase());
    const status = (conv.status || '').toLowerCase();
    if (tags.includes('sold') || tags.includes('won') || tags.includes('closed')) return 'sold';
    if (tags.includes('appointment') || tags.includes('appt') || tags.includes('booked')) return 'appt';
    if (tags.includes('follow-up') || tags.includes('followup') || tags.includes('callback')) return 'followup';
    if (status === 'missed' || tags.includes('no answer') || tags.includes('noanswer')) return 'noanswer';
    return '';
  }

  function badgeHtml(outcome) {
    const labels = { sold: 'Sold', appt: 'Appt Set', followup: 'Follow-Up', noanswer: 'No Answer' };
    const classes = { sold: 'badge-sold', appt: 'badge-appt', followup: 'badge-followup', noanswer: 'badge-noanswer' };
    if (!outcome || !labels[outcome]) return '';
    return `<span class="call-badge ${classes[outcome]}">${labels[outcome]}</span>`;
  }

  // ─── API Loaders ────────────────────────────────────────────────────────────
  async function loadLocations() {
    try {
      const data = await api('/api/locations');
      state.locations = data.locations || [];
      $locationSelect.innerHTML = '';
      if (state.locations.length === 0) {
        $locationSelect.innerHTML = '<option value="">No locations found</option>';
        return;
      }
      state.locations.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc.id || loc._id;
        opt.textContent = loc.name || loc.id;
        $locationSelect.appendChild(opt);
      });
      state.currentLocationId = state.locations[0].id || state.locations[0]._id;
      await onLocationChange();
    } catch (err) {
      showError('Failed to load locations: ' + err.message);
    }
  }

  async function loadPipelines() {
    try {
      const data = await api(`/api/locations/${state.currentLocationId}/pipelines`);
      state.pipelines = data.pipelines || [];
      $pipelineSelect.innerHTML = '<option value="">All pipelines</option>';
      state.pipelines.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id || p._id;
        opt.textContent = p.name;
        $pipelineSelect.appendChild(opt);
      });
    } catch (err) {
      showError('Failed to load pipelines: ' + err.message);
    }
  }

  async function loadRepsConfig() {
    try {
      const data = await api('/api/config/reps');
      state.repsConfig = data.reps || [];
    } catch (err) {
      showError('Failed to load reps config: ' + err.message);
    }
  }

  async function loadOpportunities() {
    try {
      let url = `/api/locations/${state.currentLocationId}/opportunities`;
      if (state.currentPipelineId) url += `?pipelineId=${state.currentPipelineId}`;
      const data = await api(url);
      state.opportunities = data.opportunities || [];
    } catch (err) {
      showError('Failed to load opportunities: ' + err.message);
      state.opportunities = [];
    }
  }

  async function loadCallsForRep(userId) {
    try {
      let url = `/api/locations/${state.currentLocationId}/calls?userId=${userId}&startDate=${encodeURIComponent(getStartDate())}`;
      const data = await api(url);
      return data.conversations || [];
    } catch (err) {
      showError('Failed to load calls: ' + err.message);
      return [];
    }
  }

  async function loadAllRepData() {
    if (state.repsConfig.length === 0) {
      state.repStats = [];
      state.allCalls = [];
      renderLeaderboard();
      renderMetrics();
      return;
    }

    $leaderboardList.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';

    try {
      const [opps] = await Promise.all([
        loadOpportunities(),
      ]);

      const callResults = await Promise.all(
        state.repsConfig.map(rep => loadCallsForRep(rep.id))
      );

      state.allCalls = [];
      state.repStats = state.repsConfig.map((rep, i) => {
        const calls = callResults[i];
        state.allCalls.push(...calls.map(c => ({ ...c, _repId: rep.id })));
        return computeRepStats(rep, calls);
      });

      renderLeaderboard();
      renderMetrics();
    } catch (err) {
      showError('Failed to load rep data: ' + err.message);
    }
  }

  function computeRepStats(rep, calls) {
    const repOpps = state.opportunities.filter(o => o.assignedTo === rep.id);
    let sold = 0;
    let revenue = 0;
    let appointments = 0;

    repOpps.forEach(o => {
      const st = (o.status || '').toLowerCase();
      const stageName = (o.pipelineStageId || o.stageName || '').toLowerCase();
      if (st === 'won' || st === 'closed' || stageName.includes('won') || stageName.includes('sold')) {
        sold++;
        revenue += parseFloat(o.monetaryValue || o.value || 0);
      }
      if (stageName.includes('appointment') || stageName.includes('booked') || stageName.includes('appt')) {
        appointments++;
      }
    });

    const totalCalls = calls.length;
    const closeRate = totalCalls > 0 ? ((sold / totalCalls) * 100).toFixed(1) : '0.0';

    return {
      id: rep.id,
      name: rep.name,
      email: rep.email,
      sold,
      revenue,
      appointments,
      calls: totalCalls,
      closeRate: parseFloat(closeRate),
    };
  }

  // ─── Renderers ──────────────────────────────────────────────────────────────
  function renderMetrics() {
    const totals = state.repStats.reduce(
      (acc, r) => {
        acc.sold += r.sold;
        acc.revenue += r.revenue;
        acc.appointments += r.appointments;
        acc.calls += r.calls;
        return acc;
      },
      { sold: 0, revenue: 0, appointments: 0, calls: 0 }
    );
    const closeRate = totals.calls > 0 ? ((totals.sold / totals.calls) * 100).toFixed(1) : '0.0';

    $metricSold.textContent = totals.sold;
    $metricRevenue.textContent = formatCurrency(totals.revenue);
    $metricAppts.textContent = totals.appointments;
    $metricCalls.textContent = totals.calls;
    $metricClose.textContent = closeRate + '%';
  }

  function renderLeaderboard() {
    if (state.repStats.length === 0) {
      $leaderboardList.innerHTML = '';
      $leaderboardList.appendChild($leaderboardEmpty);
      $leaderboardEmpty.style.display = '';
      return;
    }
    $leaderboardEmpty.style.display = 'none';

    const sortKey = $leaderboardSort.value;
    const sorted = [...state.repStats].sort((a, b) => b[sortKey] - a[sortKey]);

    $leaderboardList.innerHTML = sorted.map((rep, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const active = rep.id === state.selectedRepId ? 'active' : '';
      const statLabel = {
        sold: rep.sold,
        revenue: formatCurrency(rep.revenue),
        appointments: rep.appointments,
        calls: rep.calls,
      };

      return `
        <div class="lb-row ${active}" data-rep-id="${rep.id}">
          <div class="lb-rank ${rankClass}">${rank}</div>
          <div class="lb-avatar">${getInitials(rep.name)}</div>
          <div class="lb-info">
            <div class="lb-name">${rep.name}</div>
            <div class="lb-sub">${rep.calls} calls &middot; ${rep.closeRate}% close</div>
          </div>
          <div class="lb-stat">${statLabel[sortKey]}</div>
        </div>
      `;
    }).join('');

    $leaderboardList.querySelectorAll('.lb-row').forEach(row => {
      row.addEventListener('click', () => selectRep(row.dataset.repId));
    });
  }

  function renderCallLog() {
    let calls = state.selectedRepCalls;
    if (state.callFilter !== 'all') {
      calls = calls.filter(c => {
        const dir = getCallDirection(c);
        if (state.callFilter === 'missed') return dir === 'missed' || (c.status || '').toLowerCase() === 'missed';
        return dir === state.callFilter;
      });
    }

    if (calls.length === 0) {
      $callLogList.innerHTML = '<div class="empty-state">No calls found</div>';
      return;
    }

    $callLogList.innerHTML = calls.map(c => {
      const dir = getCallDirection(c);
      const outcome = getCallOutcome(c);
      const contactName = c.contactName || c.fullName || c.phone || 'Unknown';
      return `
        <div class="call-row" data-conv-id="${c.id || c._id}">
          <div class="call-dir ${dir}"></div>
          <div class="call-info">
            <div class="call-contact">${contactName}</div>
            <div class="call-time">${formatDate(c.lastMessageDate || c.dateUpdated || c.dateAdded)}</div>
          </div>
          ${badgeHtml(outcome)}
        </div>
      `;
    }).join('');

    $callLogList.querySelectorAll('.call-row').forEach(row => {
      row.addEventListener('click', () => openCallDetail(row.dataset.convId));
    });
  }

  async function openCallDetail(conversationId) {
    $callDetailPanel.classList.remove('hidden');
    resetAudioPlayer();

    $callLogList.querySelectorAll('.call-row').forEach(r => r.classList.remove('active'));
    const activeRow = $callLogList.querySelector(`[data-conv-id="${conversationId}"]`);
    if (activeRow) activeRow.classList.add('active');

    const conv = state.selectedRepCalls.find(c => (c.id || c._id) === conversationId);
    const contactName = conv ? (conv.contactName || conv.fullName || conv.phone || 'Unknown') : 'Unknown';
    const phone = conv ? (conv.phone || conv.contactPhone || '—') : '—';
    const date = conv ? formatDate(conv.lastMessageDate || conv.dateUpdated || conv.dateAdded) : '';
    const locName = state.locations.find(l => (l.id || l._id) === state.currentLocationId)?.name || '';

    $callDetailMeta.innerHTML = `
      <span><strong>${contactName}</strong></span>
      <span>${phone}</span>
      <span>${date}</span>
      <span>${locName}</span>
    `;

    $transcriptText.textContent = 'Loading…';

    try {
      const data = await api(`/api/conversations/${conversationId}/messages`);
      state.currentCallMessages = data.messages || [];

      let recordingUrl = '';
      let transcript = '';

      for (const msg of state.currentCallMessages) {
        if (msg.meta && msg.meta.recordingUrl && !recordingUrl) {
          recordingUrl = msg.meta.recordingUrl;
        }
        if (msg.meta && msg.meta.transcriptionText && !transcript) {
          transcript = msg.meta.transcriptionText;
        }
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            if (att.url && att.url.includes('recording') && !recordingUrl) {
              recordingUrl = att.url;
            }
          }
        }
      }

      if (recordingUrl) {
        $audioEl.src = '/api/recording?url=' + encodeURIComponent(recordingUrl);
        $audioEl.load();
      } else {
        $audioEl.removeAttribute('src');
      }

      $transcriptText.textContent = transcript || 'No transcript available';
    } catch (err) {
      showError('Failed to load call detail: ' + err.message);
      $transcriptText.textContent = 'Failed to load transcript';
    }
  }

  function resetAudioPlayer() {
    $audioEl.pause();
    $audioEl.removeAttribute('src');
    $audioEl.load();
    $progressBar.style.width = '0%';
    $timeDisplay.textContent = '0:00 / 0:00';
    $playPauseBtn.innerHTML = '&#9654;';
  }

  // ─── Interactions ───────────────────────────────────────────────────────────
  async function selectRep(repId) {
    state.selectedRepId = repId;
    state.callFilter = 'all';

    $leaderboardList.querySelectorAll('.lb-row').forEach(r => {
      r.classList.toggle('active', r.dataset.repId === repId);
    });

    $callFilterTabs.querySelectorAll('.filter-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.filter === 'all');
    });

    const rep = state.repsConfig.find(r => r.id === repId);
    $callLogTitle.textContent = rep ? `${rep.name} — Calls` : 'Call Log';

    $callDetailPanel.classList.add('hidden');
    resetAudioPlayer();

    $callLogList.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';

    state.selectedRepCalls = await loadCallsForRep(repId);
    renderCallLog();
  }

  async function onLocationChange() {
    state.currentLocationId = $locationSelect.value;
    state.selectedRepId = null;
    state.selectedRepCalls = [];
    state.callFilter = 'all';

    $callLogTitle.textContent = 'Call Log';
    $callLogList.innerHTML = '<div class="empty-state">Select a rep to view their calls</div>';
    $callDetailPanel.classList.add('hidden');
    resetAudioPlayer();

    await Promise.all([loadPipelines(), loadRepsConfig()]);
    await loadAllRepData();
  }

  // ─── Manage Reps Modal ─────────────────────────────────────────────────────
  async function openRepsModal() {
    $repsModalOverlay.classList.remove('hidden');
    $repsModalBody.innerHTML = '<div class="loading-center"><span class="spinner"></span></div>';

    try {
      const data = await api(`/api/locations/${state.currentLocationId}/users`);
      const users = data.users || [];

      if (users.length === 0) {
        $repsModalBody.innerHTML = '<p>No users found for this location.</p>';
        return;
      }

      const currentIds = new Set(state.repsConfig.map(r => r.id));
      $repsModalBody.innerHTML = users.map(u => {
        const uid = u.id || u._id;
        const checked = currentIds.has(uid) ? 'checked' : '';
        const name = u.name || u.firstName + ' ' + (u.lastName || '');
        const email = u.email || '';
        return `
          <div class="user-check-row">
            <input type="checkbox" id="rep-${uid}" value="${uid}" data-name="${name}" data-email="${email}" ${checked} />
            <label for="rep-${uid}">
              <span class="user-check-name">${name}</span>
              <span class="user-check-email">${email}</span>
            </label>
          </div>
        `;
      }).join('');
    } catch (err) {
      showError('Failed to load users: ' + err.message);
      $repsModalBody.innerHTML = '<p>Failed to load users.</p>';
    }
  }

  async function saveReps() {
    const checkboxes = $repsModalBody.querySelectorAll('input[type="checkbox"]');
    const reps = [];
    checkboxes.forEach(cb => {
      if (cb.checked) {
        reps.push({
          id: cb.value,
          name: cb.dataset.name,
          email: cb.dataset.email,
        });
      }
    });

    try {
      await apiPost('/api/config/reps', { reps });
      state.repsConfig = reps;
      $repsModalOverlay.classList.add('hidden');
      await loadAllRepData();
    } catch (err) {
      showError('Failed to save reps: ' + err.message);
    }
  }

  // ─── Audio Player Logic ─────────────────────────────────────────────────────
  $playPauseBtn.addEventListener('click', () => {
    if (!$audioEl.src || $audioEl.src === window.location.href) return;
    if ($audioEl.paused) {
      $audioEl.play();
      $playPauseBtn.innerHTML = '&#9646;&#9646;';
    } else {
      $audioEl.pause();
      $playPauseBtn.innerHTML = '&#9654;';
    }
  });

  $audioEl.addEventListener('timeupdate', () => {
    if (!$audioEl.duration) return;
    const pct = ($audioEl.currentTime / $audioEl.duration) * 100;
    $progressBar.style.width = pct + '%';
    $timeDisplay.textContent = formatDuration($audioEl.currentTime) + ' / ' + formatDuration($audioEl.duration);
  });

  $audioEl.addEventListener('ended', () => {
    $playPauseBtn.innerHTML = '&#9654;';
    $progressBar.style.width = '0%';
  });

  $progressContainer.addEventListener('click', (e) => {
    if (!$audioEl.duration) return;
    const rect = $progressContainer.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    $audioEl.currentTime = pct * $audioEl.duration;
  });

  // ─── Event Listeners ───────────────────────────────────────────────────────
  $locationSelect.addEventListener('change', onLocationChange);

  $pipelineSelect.addEventListener('change', async () => {
    state.currentPipelineId = $pipelineSelect.value;
    await loadAllRepData();
  });

  $dateRangeSelect.addEventListener('change', async () => {
    await loadAllRepData();
    if (state.selectedRepId) {
      state.selectedRepCalls = await loadCallsForRep(state.selectedRepId);
      renderCallLog();
    }
  });

  $leaderboardSort.addEventListener('change', () => {
    renderLeaderboard();
  });

  $callFilterTabs.addEventListener('click', (e) => {
    if (!e.target.classList.contains('filter-tab')) return;
    state.callFilter = e.target.dataset.filter;
    $callFilterTabs.querySelectorAll('.filter-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.filter === state.callFilter);
    });
    renderCallLog();
  });

  $manageRepsBtn.addEventListener('click', openRepsModal);
  $closeModalBtn.addEventListener('click', () => $repsModalOverlay.classList.add('hidden'));
  $cancelRepsBtn.addEventListener('click', () => $repsModalOverlay.classList.add('hidden'));
  $saveRepsBtn.addEventListener('click', saveReps);
  $closeDetailBtn.addEventListener('click', () => {
    $callDetailPanel.classList.add('hidden');
    resetAudioPlayer();
    $callLogList.querySelectorAll('.call-row').forEach(r => r.classList.remove('active'));
  });

  $repsModalOverlay.addEventListener('click', (e) => {
    if (e.target === $repsModalOverlay) $repsModalOverlay.classList.add('hidden');
  });

  // ─── Init ───────────────────────────────────────────────────────────────────
  loadLocations();
})();
