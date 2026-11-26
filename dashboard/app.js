(function() {
  const radar = window.RADAR;
  if (!radar) {
    document.body.innerHTML = '<div style="padding:2rem;color:#f43f5e;font-family:sans-serif;">Error: window.RADAR data not loaded.</div>';
    return;
  }

  // State
  let currentSort = { column: 'rank', asc: true };
  let searchTerm = '';
  let selectedCategory = '';
  let selectedChain = '';
  let watchlistOnly = false;
  let currentView = 'board';
  let currentSlug = '';

  const watchlistSet = new Set(radar.watchlist || []);

  // Formatters
  function fmtUSD(val) {
    if (val === null || val === undefined || !Number.isFinite(val)) return '—';
    return '$' + Math.round(val).toLocaleString('en-US');
  }

  function fmtPct(val) {
    if (val === null || val === undefined || !Number.isFinite(val)) return '—';
    const num = Number(val);
    const cls = num > 0 ? 'pos' : num < 0 ? 'neg' : '';
    const prefix = num > 0 ? '+' : '';
    return `<span class="${cls}">${prefix}${num.toFixed(1)}%</span>`;
  }

  // Populate Header Metrics
  function initHeader() {
    const el = document.getElementById('headerMetrics');
    el.innerHTML = `
      <div class="metric-pill"><span class="metric-label">Snapshot</span><span class="metric-value">${radar.as_of}</span></div>
      <div class="metric-pill"><span class="metric-label">Watchlist</span><span class="metric-value">${radar.watchlist_size}</span></div>
      <div class="metric-pill"><span class="metric-label">Board Rows</span><span class="metric-value">${radar.board_size}</span></div>
      <div class="metric-pill"><span class="metric-label">Early Rows</span><span class="metric-value">${radar.early_size}</span></div>
      <div class="metric-pill"><span class="metric-label">Live Tokens</span><span class="metric-value">${radar.live_size}</span></div>
    `;

    const modelEl = document.getElementById('modelVersion');
    if (modelEl) modelEl.textContent = radar.model_version;

    // Populate Categories
    const categories = Array.from(new Set(radar.rows.map(r => r.category).filter(Boolean))).sort();
    const catSelect = document.getElementById('categoryFilter');
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect.appendChild(opt);
    });

    // Populate Chains
    const chains = Array.from(new Set(radar.rows.flatMap(r => r.chains || []).filter(Boolean))).sort();
    const chainSelect = document.getElementById('chainFilter');
    chains.forEach(chain => {
      const opt = document.createElement('option');
      opt.value = chain;
      opt.textContent = chain;
      chainSelect.appendChild(opt);
    });
  }

  // Sync state to URL search parameters
  function syncUrl() {
    const params = new URLSearchParams();
    if (currentView === 'detail' && currentSlug) {
      params.set('view', 'detail');
      params.set('slug', currentSlug);
    } else if (currentView === 'live') {
      params.set('view', 'live');
    } else if (currentView === 'methodology') {
      params.set('view', 'methodology');
    } else {
      if (selectedCategory || selectedChain || searchTerm || watchlistOnly) {
        params.set('view', 'filtered');
      } else {
        params.set('view', 'board');
      }
    }
    if (selectedCategory) params.set('category', selectedCategory);
    if (selectedChain) params.set('chain', selectedChain);
    if (searchTerm) params.set('q', searchTerm);
    if (watchlistOnly) params.set('watchlist', '1');

    const searchStr = params.toString();
    const newRelativePathQuery = window.location.pathname + (searchStr ? '?' + searchStr : '');
    window.history.replaceState(null, '', newRelativePathQuery);
  }

  // Parse Initial URL Query Params
  function parseInitialParams() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') || 'board';
    const slug = params.get('slug');
    const category = params.get('category');
    const chain = params.get('chain');
    const q = params.get('q');
    const wl = params.get('watchlist');

    if (category) {
      selectedCategory = category;
      const catEl = document.getElementById('categoryFilter');
      if (catEl) catEl.value = category;
    }
    if (chain) {
      selectedChain = chain;
      const chainEl = document.getElementById('chainFilter');
      if (chainEl) chainEl.value = chain;
    }
    if (q) {
      searchTerm = q;
      const searchEl = document.getElementById('searchInput');
      if (searchEl) searchEl.value = q;
    }
    if (wl === '1') {
      watchlistOnly = true;
      const wlEl = document.getElementById('watchlistOnly');
      if (wlEl) wlEl.checked = true;
    }

    if (view === 'detail' && slug) {
      showDetail(slug);
    } else if (view === 'live') {
      switchView('live');
    } else if (view === 'methodology') {
      switchView('methodology');
    } else {
      switchView('board');
    }
  }

  function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
    });
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    if (viewName === 'board' || viewName === 'filtered') {
      document.getElementById('boardView').classList.add('active');
      renderBoard();
    } else if (viewName === 'live') {
      document.getElementById('liveView').classList.add('active');
      renderLive();
    } else if (viewName === 'methodology') {
      document.getElementById('methodologyView').classList.add('active');
    }
    syncUrl();
  }

  function renderBoard() {
    const tbody = document.getElementById('boardTbody');
    const filteredCount = document.getElementById('filteredCount');

    let rows = radar.rows.filter(r => {
      if (watchlistOnly && !watchlistSet.has(r.slug)) return false;
      if (selectedCategory && r.category !== selectedCategory) return false;
      if (selectedChain && (!r.chains || !r.chains.includes(selectedChain))) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesName = r.name.toLowerCase().includes(term);
        const matchesSlug = r.slug.toLowerCase().includes(term);
        if (!matchesName && !matchesSlug) return false;
      }
      return true;
    });

    filteredCount.textContent = `Showing ${rows.length} of ${radar.rows.length} protocols`;

    // Sort
    rows.sort((a, b) => {
      let va = a[currentSort.column];
      let vb = b[currentSort.column];
      if (va === null || va === undefined) va = currentSort.asc ? Infinity : -Infinity;
      if (vb === null || vb === undefined) vb = currentSort.asc ? Infinity : -Infinity;
      if (typeof va === 'string') {
        return currentSort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return currentSort.asc ? va - vb : vb - va;
    });

    tbody.innerHTML = '';
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:var(--text-muted);">No matching protocols found.</td></tr>';
      return;
    }

    rows.forEach(r => {
      const tr = document.createElement('tr');
      const isWatchlist = watchlistSet.has(r.slug);
      tr.innerHTML = `
        <td><strong>#${r.rank}</strong></td>
        <td>
          <div style="font-weight:600;color:var(--text-primary);">${r.name}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);">${r.slug} ${isWatchlist ? '<span class="tag" style="color:var(--teal);border-color:var(--teal)">Watchlist</span>' : ''}</div>
        </td>
        <td><span class="tag">${r.category || 'Other'}</span></td>
        <td class="num">${fmtUSD(r.tvl_usd)}</td>
        <td class="num">${fmtPct(r.change_7d)}</td>
        <td class="num val-implied">${fmtUSD(r.implied_value_usd)}</td>
        <td class="num">${r.age_days !== null ? r.age_days + 'd' : '365d'}</td>
        <td><button class="btn-detail" data-slug="${r.slug}">Plan &amp; Math</button></td>
      `;
      tr.addEventListener('click', (e) => {
        showDetail(r.slug);
      });
      tbody.appendChild(tr);
    });
  }

  function showDetail(slug) {
    const fullRow = (radar.board || []).find(r => r.slug === slug);
    if (!fullRow) {
      switchView('board');
      return;
    }

    currentView = 'detail';
    currentSlug = slug;

    document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.view-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById('detailView').classList.add('active');

    const detailTitle = document.getElementById('detailTitle');
    const detailSubtitle = document.getElementById('detailSubtitle');
    const detailContainer = document.getElementById('detailContainer');

    const isWatchlist = watchlistSet.has(fullRow.slug);
    detailTitle.innerHTML = `${fullRow.name} <span class="tag" style="vertical-align:middle;font-size:0.85rem;color:var(--teal);">Rank #${fullRow.rank}</span> ${isWatchlist ? '<span class="tag" style="vertical-align:middle;font-size:0.85rem;border-color:var(--teal);color:var(--teal)">Watchlist</span>' : ''}`;
    detailSubtitle.textContent = `Slug: ${fullRow.slug} • Category: ${fullRow.category || 'Uncategorized'} • Chains: ${fullRow.chains.join(', ') || 'Ethereum'} • Listed: ${fullRow.listed_at || 'Unknown'}`;

    const m = fullRow.model;
    const tvlFmt = fmtUSD(fullRow.tvl_usd);
    const impliedFmt = fmtUSD(fullRow.implied_value_usd);
    const baseFmt = fmtUSD(m.base_value_usd);

    detailContainer.innerHTML = `
      <div class="detail-grid">
        <div class="panel">
          <h3>radar-2 Valuation Breakdown</h3>
          <div class="formula-highlight">
            implied = max(1, round(TVL &times; catMult &times; growthMult &times; maturityMult &times; chainMult))<br>
            implied = max(1, round(${tvlFmt} &times; ${m.base_multiple} &times; ${m.growth_multiplier} &times; ${m.maturity_multiplier} &times; ${m.chain_multiplier}))<br>
            implied = ${impliedFmt}
          </div>
          <div class="calc-row"><span class="calc-label">Implied Value (USD)</span><span class="calc-val val-implied" style="font-size:1.15rem;">${impliedFmt}</span></div>
          <div class="calc-row"><span class="calc-label">Total Value Locked (TVL)</span><span class="calc-val">${tvlFmt}</span></div>
          <div class="calc-row"><span class="calc-label">Category Multiple</span><span class="calc-val">${m.base_multiple} (${fullRow.category || 'Other'})</span></div>
          <div class="calc-row"><span class="calc-label">Base Value (TVL &times; Multiple)</span><span class="calc-val">${baseFmt}</span></div>
          <div class="calc-row"><span class="calc-label">7-Day TVL Growth</span><span class="calc-val">${fmtPct(fullRow.change_7d)}</span></div>
          <div class="calc-row"><span class="calc-label">Growth Multiplier</span><span class="calc-val">${m.growth_multiplier}x (clamped: ${m.growth_pct.toFixed(1)}%)</span></div>
          <div class="calc-row"><span class="calc-label">Protocol Age</span><span class="calc-val">${fullRow.age_days !== null ? fullRow.age_days + ' days' : 'Unknown (365d default)'}</span></div>
          <div class="calc-row"><span class="calc-label">Maturity Multiplier</span><span class="calc-val">${m.maturity_multiplier}x</span></div>
          <div class="calc-row"><span class="calc-label">Chain Breadth Multiplier</span><span class="calc-val">${m.chain_multiplier}x (${fullRow.chains.length} chains)</span></div>
          <div class="calc-row"><span class="calc-label">Token Status</span><span class="calc-val">${fullRow.token_status}</span></div>
        </div>

        <div class="panel">
          <h3>Actionable 6-Step Farming Plan</h3>
          <ul class="steps-list">
            ${fullRow.farm_steps.map((step, idx) => `
              <li class="step-box">
                <strong>Step ${idx + 1}</strong>
                <div class="step-action">${step}</div>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    `;

    syncUrl();
  }

  function renderLive() {
    const tbody = document.getElementById('liveTbody');
    tbody.innerHTML = '';
    radar.live.forEach(l => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${l.name}</strong><br><small style="color:var(--text-muted);font-family:var(--font-mono);">${l.slug}</small></td>
        <td><span class="tag">${l.category || 'Other'}</span></td>
        <td><small style="color:var(--text-secondary);">${l.chains.join(', ') || 'Ethereum'}</small></td>
        <td class="num">${fmtUSD(l.tvl_usd)}</td>
        <td class="num val-mcap">${fmtUSD(l.mcap_usd)}</td>
        <td class="num">${fmtPct(l.change_7d)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Event Listeners
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      switchView(view);
    });
  });

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim();
      renderBoard();
      syncUrl();
    });
  }

  const categoryFilter = document.getElementById('categoryFilter');
  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      selectedCategory = e.target.value;
      renderBoard();
      syncUrl();
    });
  }

  const chainFilter = document.getElementById('chainFilter');
  if (chainFilter) {
    chainFilter.addEventListener('change', (e) => {
      selectedChain = e.target.value;
      renderBoard();
      syncUrl();
    });
  }

  const watchlistOnlyCb = document.getElementById('watchlistOnly');
  if (watchlistOnlyCb) {
    watchlistOnlyCb.addEventListener('change', (e) => {
      watchlistOnly = e.target.checked;
      renderBoard();
      syncUrl();
    });
  }

  const backBtn = document.getElementById('backBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      switchView('board');
    });
  }

  // Sort Handlers
  document.querySelectorAll('#boardTable th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (currentSort.column === col) {
        currentSort.asc = !currentSort.asc;
      } else {
        currentSort.column = col;
        currentSort.asc = col === 'name' || col === 'category' ? true : false;
      }
      renderBoard();
    });
  });

  initHeader();
  parseInitialParams();
})();
