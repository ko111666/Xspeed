/* ===========================================================
   Xspeed — dashboard controller (v1.5.3)
   Fully compatible with plain‑text subscription links
   (Info Configs + TLS), no Non‑TLS, no Clean IP.
   =========================================================== */
(() => {
  let currentInbounds = [];
  let lastHourly = [];

  // ---------------- guard: must be logged in ----------------
  XSPEED.api('/api/me').then(me => {
    if (!me.logged_in) { window.location.href = '/login'; return; }
    document.getElementById('appVersion').textContent = me.app_version || '';
    document.getElementById('otaCurrent').textContent = (me.settings && me.settings.app_version) || me.app_version;
    if (me.settings) {
      document.getElementById('settingPublicDomain').value = me.settings.public_domain || '';
      document.getElementById('settingKeepAlive').checked = me.settings.keep_alive !== false;
      document.getElementById('settingFingerprint').value = me.settings.default_fingerprint || 'chrome';
      document.getElementById('settingAlpn').value = me.settings.default_alpn || 'http/1.1';
      document.getElementById('settingSniOverride').value = me.settings.sni_override || '';
      document.getElementById('settingFragmentEnabled').checked = me.settings.fragment_enabled !== false;
      document.getElementById('settingFragmentPackets').value = me.settings.fragment_packets || 'tlshello';
      document.getElementById('settingFragmentLength').value = me.settings.fragment_length || '10-30';
      document.getElementById('settingFragmentInterval').value = me.settings.fragment_interval || '10-20';
    }
  }).catch(() => { window.location.href = '/login'; });

  document.getElementById('settingSound').checked = XSPEED.isSoundEnabled();

  // ---------------- nav / view switching ----------------
  const views = document.querySelectorAll('.view');
  const navItems = document.querySelectorAll('.nav-item[data-view]');
  const viewTitle = document.getElementById('viewTitle');
  const titleKeys = { dashboard: 'nav_dashboard', inbounds: 'nav_inbounds', traffic: 'nav_traffic', security: 'nav_security', settings: 'nav_settings' };

  function showView(name) {
    views.forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    navItems.forEach(n => n.classList.toggle('active', n.dataset.view === name));
    viewTitle.setAttribute('data-i18n', titleKeys[name]);
    viewTitle.textContent = XSPEED.t(titleKeys[name]);
    if (name === 'inbounds') loadInbounds();
    if (name === 'traffic') loadInbounds();
    closeSidebarMobile();
    XSPEED.playSfx('open', 0.3);
  }
  navItems.forEach(item => item.addEventListener('click', () => showView(item.dataset.view)));

  // ---------------- mobile sidebar ----------------
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  document.getElementById('menuToggle').addEventListener('click', () => {
    const opening = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', opening);
    backdrop.classList.toggle('open', opening);
    document.body.classList.toggle('sidebar-locked', opening);
  });
  backdrop.addEventListener('click', closeSidebarMobile);
  function closeSidebarMobile() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    document.body.classList.remove('sidebar-locked');
  }

  // ---------------- lang / theme ----------------
  document.querySelectorAll('.lang-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      XSPEED.setLang(btn.dataset.lang);
      viewTitle.textContent = XSPEED.t(viewTitle.getAttribute('data-i18n'));
      XSPEED.playSfx('toggle', 0.3);
    });
  });
  document.getElementById('themeToggle').addEventListener('click', () => {
    XSPEED.setTheme(XSPEED.getTheme() === 'dark' ? 'light' : 'dark');
    XSPEED.playSfx('toggle', 0.3);
    renderTrafficChart(document.getElementById('trafficChart'), lastHourly);
  });
  document.getElementById('soundToggle').addEventListener('click', () => {
    const next = !XSPEED.isSoundEnabled();
    XSPEED.setSoundEnabled(next);
    document.getElementById('settingSound').checked = next;
    if (next) XSPEED.playSfx('click');
  });

  // ---------------- logout ----------------
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await XSPEED.api('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  // ---------------- modal helpers ----------------
  function openModal(id) {
    document.getElementById(id).classList.add('open');
    XSPEED.playSfx('open', 0.4);
  }
  function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    XSPEED.playSfx('close', 0.4);
  }
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', (e) => { if (e.target === ov) closeModal(ov.id); });
  });

  // ---------------- dashboard stats polling ----------------
  async function refreshStats() {
    try {
      const s = await XSPEED.api('/stats');
      document.getElementById('statCpu').textContent = s.cpu_percent.toFixed(1) + '%';
      document.getElementById('barCpu').style.width = Math.min(100, s.cpu_percent) + '%';
      document.getElementById('statMem').textContent = s.mem_percent.toFixed(1) + '%';
      document.getElementById('barMem').style.width = Math.min(100, s.mem_percent) + '%';
      document.getElementById('statUptime').textContent = XSPEED.fmtDuration(s.uptime_seconds);
      const loc = s.location || {};
      document.getElementById('statLocation').textContent = `${loc.flag || ''} ${loc.city || '?'}`;
      document.getElementById('statTotalTraffic').textContent = XSPEED.fmtBytes((s.total_up || 0) + (s.total_down || 0));
      document.getElementById('statUp').textContent = XSPEED.fmtBytes(s.total_up || 0);
      document.getElementById('statDown').textContent = XSPEED.fmtBytes(s.total_down || 0);
      document.getElementById('statActiveConn').textContent = s.active_connections || 0;
      document.getElementById('statInboundCount').textContent = s.inbounds_count || 0;
      document.getElementById('navInboundCount').textContent = s.inbounds_count || 0;
      document.getElementById('trafficUp').textContent = XSPEED.fmtBytes(s.total_up || 0);
      document.getElementById('trafficDown').textContent = XSPEED.fmtBytes(s.total_down || 0);
      lastHourly = s.hourly || [];
      renderTrafficChart(document.getElementById('trafficChart'), lastHourly);
    } catch (e) { /* ignore transient errors */ }
  }
  refreshStats();
  setInterval(refreshStats, 8000);
  window.addEventListener('resize', () => renderTrafficChart(document.getElementById('trafficChart'), lastHourly));

  // ---------------- OTA ----------------
  let otaLatestKnown = null;

  document.getElementById('otaCheckBtn').addEventListener('click', async () => {
    const btn = document.getElementById('otaCheckBtn');
    const updateBtn = document.getElementById('otaUpdateBtn');
    const hint = document.getElementById('otaUpdateHint');
    XSPEED.setLoading(btn, true);
    try {
      const r = await XSPEED.api('/api/ota/check');
      const el = document.getElementById('otaResult');
      if (r.update_available) {
        el.innerHTML = `<span style="color:var(--gold-300)">${XSPEED.t('dash_ota_available')} <b>${r.latest}</b></span> — <a href="${r.url}" target="_blank" style="color:var(--azure); text-decoration:underline;">GitHub</a>`;
        XSPEED.toast(XSPEED.t('dash_ota_available') + ' ' + r.latest, 'info');
        otaLatestKnown = r.latest;
        updateBtn.style.display = '';
        hint.style.display = '';
      } else {
        el.innerHTML = `<span style="color:var(--emerald)">${XSPEED.t('dash_ota_uptodate')}</span>`;
        XSPEED.toast(XSPEED.t('dash_ota_uptodate'), 'success');
        otaLatestKnown = null;
        updateBtn.style.display = 'none';
        hint.style.display = 'none';
      }
    } catch (e) {
      XSPEED.toast(e.detail || 'error', 'error');
    } finally {
      XSPEED.setLoading(btn, false);
    }
  });

  document.getElementById('otaUpdateBtn').addEventListener('click', async () => {
    const msg = XSPEED.t('dash_ota_update_confirm').replace('{version}', otaLatestKnown || '');
    if (!confirm(msg)) return;

    const updateBtn = document.getElementById('otaUpdateBtn');
    const checkBtn = document.getElementById('otaCheckBtn');
    const el = document.getElementById('otaResult');
    XSPEED.setLoading(updateBtn, true);
    checkBtn.disabled = true;

    try {
      const r = await XSPEED.api('/api/ota/update', { method: 'POST' });
      if (r.ok) {
        el.innerHTML = `<span style="color:var(--gold-300)">${XSPEED.t('dash_ota_updating')}</span>`;
        XSPEED.toast(XSPEED.t('dash_ota_updating'), 'info', 8000);
        waitForRestartThenReload();
      } else {
        el.innerHTML = `<span style="color:var(--emerald)">${XSPEED.t('dash_ota_uptodate')}</span>`;
        XSPEED.toast(XSPEED.t('dash_ota_uptodate'), 'success');
        XSPEED.setLoading(updateBtn, false);
        checkBtn.disabled = false;
      }
    } catch (e) {
      XSPEED.toast(e.detail || 'error', 'error');
      XSPEED.setLoading(updateBtn, false);
      checkBtn.disabled = false;
    }
  });

  function waitForRestartThenReload() {
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/health', { cache: 'no-store' });
        if (res.ok) {
          clearInterval(poll);
          XSPEED.toast(XSPEED.t('dash_ota_done'), 'success', 3000);
          setTimeout(() => window.location.reload(), 1200);
        }
      } catch (e) {
        // still down / restarting — keep polling
      }
      if (attempts > 60) {
        clearInterval(poll);
        XSPEED.toast(XSPEED.t('dash_ota_timeout'), 'error', 8000);
      }
    }, 3000);
  }

  document.getElementById('quickAddBtn').addEventListener('click', () => { showView('inbounds'); openInboundModal(); });

  // ---------------- inbounds ----------------
  const fpKeyMap = { chrome: 'fp_chrome', ios: 'fp_ios', firefox: 'fp_firefox', edge: 'fp_edge', random: 'fp_random' };

  async function loadInbounds() {
    try {
      const r = await XSPEED.api('/api/inbounds');
      currentInbounds = r.inbounds || [];
      renderInboundsTable();
      renderTrafficTable();
      document.getElementById('navInboundCount').textContent = currentInbounds.length;
    } catch (e) { XSPEED.toast(e.detail || 'error', 'error'); }
  }

  function renderInboundsTable(filter = '') {
    const tbody = document.getElementById('inboundsTableBody');
    const empty = document.getElementById('inboundsEmpty');
    const rows = currentInbounds.filter(ib => !filter || ib.name.toLowerCase().includes(filter.toLowerCase()));
    tbody.innerHTML = '';
    empty.style.display = rows.length ? 'none' : 'block';

    rows.forEach(ib => {
      const st = ib.status;
      const tr = document.createElement('tr');
      const statusPill = st.live_enabled
        ? `<span class="pill pill-on"><span class="pill-dot"></span>${XSPEED.t('active')}</span>`
        : `<span class="pill pill-off"><span class="pill-dot"></span>${st.expired ? XSPEED.t('expired') : XSPEED.t('inactive')}</span>`;
      const quotaTxt = ib.quota_gb > 0
        ? `${XSPEED.fmtBytes(st.used)} ${XSPEED.t('inb_used_of')} ${ib.quota_gb} GB`
        : `${XSPEED.fmtBytes(st.used)} / ${XSPEED.t('unlimited')}`;
      const pct = ib.quota_gb > 0 ? Math.min(100, (st.used / st.quota_bytes) * 100) : (st.used > 0 ? 8 : 0);
      const expireTxt = ib.expire_at
        ? `${st.days_left} ${XSPEED.t('inb_days_left')}`
        : XSPEED.t('inb_no_expire');
      tr.innerHTML = `
        <td data-label="${XSPEED.t('inb_name')}"><b>${escapeHtml(ib.name)}</b><div class="small muted">${ib.note ? escapeHtml(ib.note) : ''}</div></td>
        <td data-label="${XSPEED.t('inb_status')}">${statusPill}</td>
        <td data-label="${XSPEED.t('inb_usage')}" style="min-width:160px;">
          <div class="small">${quotaTxt}</div>
          <div class="bar progress-gold" style="margin-top:4px;"><span style="width:${pct}%"></span></div>
        </td>
        <td data-label="${XSPEED.t('inb_expire')}">${expireTxt}</td>
        <td data-label="${XSPEED.t('inb_max_conn')}">${st.active_connections}${ib.max_connections ? ' / ' + ib.max_connections : ''} <span class="small muted">${XSPEED.t('inb_active_devices')}</span></td>
        <td data-label="${XSPEED.t('inb_actions')}">
          <div class="row-actions">
            <button class="icon-btn btn-sm" data-action="links" data-uid="${ib.uid}" title="${XSPEED.t('inb_links')}"><svg width="15" height="15"><use href="#icon-qr"/></svg></button>
            <button class="icon-btn btn-sm" data-action="edit" data-uid="${ib.uid}" title="${XSPEED.t('edit')}"><svg width="15" height="15"><use href="#icon-edit"/></svg></button>
            <button class="icon-btn btn-sm" data-action="reset" data-uid="${ib.uid}" title="${XSPEED.t('inb_reset_usage')}"><svg width="15" height="15"><use href="#icon-refresh"/></svg></button>
            <button class="icon-btn btn-sm" data-action="regen" data-uid="${ib.uid}" title="${XSPEED.t('inb_regenerate')}"><svg width="15" height="15"><use href="#icon-key"/></svg></button>
            <button class="icon-btn btn-sm" data-action="delete" data-uid="${ib.uid}" title="${XSPEED.t('delete')}" style="color:var(--crimson)"><svg width="15" height="15"><use href="#icon-trash"/></svg></button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleInboundAction(btn.dataset.action, btn.dataset.uid));
    });
  }

  function renderTrafficTable() {
    const tbody = document.getElementById('trafficTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    currentInbounds.forEach(ib => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td data-label="${XSPEED.t('inb_name')}"><b>${escapeHtml(ib.name)}</b></td>
        <td data-label="${XSPEED.t('dash_upload')}">${XSPEED.fmtBytes(ib.used_up || 0)}</td>
        <td data-label="${XSPEED.t('dash_download')}">${XSPEED.fmtBytes(ib.used_down || 0)}</td>
        <td data-label="${XSPEED.t('inb_usage')}">${XSPEED.fmtBytes((ib.used_up || 0) + (ib.used_down || 0))}</td>`;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('inboundSearch').addEventListener('input', (e) => renderInboundsTable(e.target.value));

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function openInboundModal(ib = null) {
    document.getElementById('inboundModalTitle').textContent = ib ? XSPEED.t('edit') : XSPEED.t('inb_add');
    document.getElementById('inboundUid').value = ib ? ib.uid : '';
    document.getElementById('fName').value = ib ? ib.name : '';
    document.getElementById('fQuota').value = ib ? (ib.quota_gb || '') : '';
    document.getElementById('fExpire').value = ib ? (ib.expire_days || '') : '';
    document.getElementById('fMaxConn').value = ib ? (ib.max_connections || '') : '';
    document.getElementById('fMaxReq').value = ib ? (ib.max_requests || '') : '';
    document.getElementById('fFingerprint').value = ib ? (ib.fp || 'chrome') : 'chrome';
    document.getElementById('fStrictIp').checked = ib ? !!ib.strict_single_ip : false;
    document.getElementById('fNote').value = ib ? (ib.note || '') : '';
    openModal('inboundModal');
  }

  document.getElementById('addInboundBtn').addEventListener('click', () => openInboundModal());

  document.getElementById('inboundSaveBtn').addEventListener('click', async () => {
    const uid = document.getElementById('inboundUid').value;
    const payload = {
      name: document.getElementById('fName').value.trim() || 'User',
      quota_gb: parseFloat(document.getElementById('fQuota').value || 0),
      expire_days: parseInt(document.getElementById('fExpire').value || 0),
      max_connections: parseInt(document.getElementById('fMaxConn').value || 0),
      max_requests: parseInt(document.getElementById('fMaxReq').value || 0),
      fp: document.getElementById('fFingerprint').value,
      strict_single_ip: document.getElementById('fStrictIp').checked,
      note: document.getElementById('fNote').value.trim(),
    };
    const btn = document.getElementById('inboundSaveBtn');
    XSPEED.setLoading(btn, true);
    try {
      if (uid) {
        await XSPEED.api(`/api/inbounds/${uid}`, { method: 'PATCH', body: payload });
        XSPEED.toast(XSPEED.t('inb_updated'), 'success');
      } else {
        await XSPEED.api('/api/inbounds', { method: 'POST', body: payload });
        XSPEED.toast(XSPEED.t('inb_created'), 'success');
      }
      closeModal('inboundModal');
      loadInbounds();
    } catch (e) {
      XSPEED.toast(e.detail || 'error', 'error');
    } finally {
      XSPEED.setLoading(btn, false);
    }
  });

  async function handleInboundAction(action, uid) {
    const ib = currentInbounds.find(x => x.uid === uid);
    if (!ib) return;
    if (action === 'edit') return openInboundModal(ib);
    if (action === 'links') return showLinksModal(uid);
    if (action === 'reset') {
      try {
        await XSPEED.api(`/api/inbounds/${uid}/reset-usage`, { method: 'POST' });
        XSPEED.toast(XSPEED.t('inb_reset_done'), 'success');
        loadInbounds();
      } catch (e) { XSPEED.toast(e.detail || 'error', 'error'); }
      return;
    }
    if (action === 'regen') {
      if (!confirm(XSPEED.t('inb_regenerate_confirm'))) return;
      try {
        await XSPEED.api(`/api/inbounds/${uid}/regenerate`, { method: 'POST' });
        XSPEED.toast(XSPEED.t('inb_regenerated'), 'success');
        loadInbounds();
      } catch (e) { XSPEED.toast(e.detail || 'error', 'error'); }
      return;
    }
    if (action === 'delete') {
      if (!confirm(XSPEED.t('inb_delete_confirm'))) return;
      try {
        await XSPEED.api(`/api/inbounds/${uid}`, { method: 'DELETE' });
        XSPEED.toast(XSPEED.t('inb_deleted'), 'success');
        loadInbounds();
      } catch (e) { XSPEED.toast(e.detail || 'error', 'error'); }
      return;
    }
  }

  // ============ LINKS MODAL (v1.4.1) ============
  async function showLinksModal(uid) {
    try {
      const r = await XSPEED.api(`/api/inbounds/${uid}/links`);
      
      // نمایش لینک TLS
      document.getElementById('linkTls').textContent = r.links.tls || '';
      
      // لینک اشتراک (با پروتکل https)
      document.getElementById('linkSub').textContent = r.sub_url || '';
      
      // لینک وضعیت
      document.getElementById('linkStatus').textContent = r.status_url || '';
      
      // لینک JSON
      document.getElementById('linkSubJson').textContent = r.sub_json_url || '';

      // لینک DoH
      const elDoh = document.getElementById('linkDoh');
      if (elDoh) elDoh.textContent = r.doh_url || '';
      
      // QR Code
      document.getElementById('qrImg').src = `/api/inbounds/${uid}/qr?t=${Date.now()}`;
      
      openModal('linksModal');
    } catch (e) { 
      XSPEED.toast(e.detail || 'error', 'error'); 
    }
  }

  // ---------------- copy functionality ----------------
  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
      XSPEED.toast(XSPEED.t('copied'), 'success', 1600);
      XSPEED.playSfx('click', 0.4);
    }).catch(() => XSPEED.toast('error', 'error'));
  }

  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.copy;
      const el = document.getElementById(targetId);
      if (el) copyText(el.textContent);
    });
  });

  // ---------------- حذف کامل بخش Clean IP ----------------
  // تمام توابع مربوط به Clean IP حذف شدند: 
  // loadAddresses, renderAddressesTable, addAddressBtn, fetchCleanIpBtn, addressSaveBtn

  // ---------------- security ----------------
  document.getElementById('securityForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const old_password = document.getElementById('oldPassword').value;
    const new_username = document.getElementById('newUsername').value.trim();
    const new_password = document.getElementById('newPassword').value;
    const new_password2 = document.getElementById('newPassword2').value;
    if (new_password && new_password !== new_password2) {
      XSPEED.toast(XSPEED.t('setup_mismatch'), 'error');
      XSPEED.shake(document.getElementById('securityForm'));
      return;
    }
    const btn = document.getElementById('securityBtn');
    XSPEED.setLoading(btn, true);
    try {
      await XSPEED.api('/api/change-password', { method: 'POST', body: { old_password, new_username, new_password } });
      XSPEED.toast(XSPEED.t('sec_updated'), 'success');
      document.getElementById('securityForm').reset();
    } catch (e) {
      let msg = e.detail;
      if (msg === 'wrong-old-password') msg = XSPEED.t('sec_wrong_old');
      XSPEED.toast(msg || 'error', 'error');
      XSPEED.shake(document.getElementById('securityForm'));
    } finally {
      XSPEED.setLoading(btn, false);
    }
  });

  // ---------------- settings ----------------
  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const payload = {
      public_domain: document.getElementById('settingPublicDomain').value.trim(),
      keep_alive: document.getElementById('settingKeepAlive').checked,
    };
    XSPEED.setSoundEnabled(document.getElementById('settingSound').checked);
    const btn = document.getElementById('saveSettingsBtn');
    XSPEED.setLoading(btn, true);
    try {
      await XSPEED.api('/api/settings', { method: 'POST', body: payload });
      XSPEED.toast(XSPEED.t('settings_saved'), 'success');
    } catch (e) {
      XSPEED.toast(e.detail || 'error', 'error');
    } finally {
      XSPEED.setLoading(btn, false);
    }
  });

  // ---------------- advanced config settings ----------------
  document.getElementById('saveAdvancedBtn').addEventListener('click', async () => {
    const payload = {
      default_fingerprint: document.getElementById('settingFingerprint').value,
      default_alpn: document.getElementById('settingAlpn').value,
      sni_override: document.getElementById('settingSniOverride').value.trim(),
      fragment_enabled: document.getElementById('settingFragmentEnabled').checked,
      fragment_packets: document.getElementById('settingFragmentPackets').value.trim() || 'tlshello',
      fragment_length: document.getElementById('settingFragmentLength').value.trim() || '10-30',
      fragment_interval: document.getElementById('settingFragmentInterval').value.trim() || '10-20',
    };
    const btn = document.getElementById('saveAdvancedBtn');
    XSPEED.setLoading(btn, true);
    try {
      await XSPEED.api('/api/settings', { method: 'POST', body: payload });
      XSPEED.toast(XSPEED.t('settings_saved'), 'success');
    } catch (e) {
      XSPEED.toast(e.detail || 'error', 'error');
    } finally {
      XSPEED.setLoading(btn, false);
    }
  });

  document.getElementById('settingFragmentEnabled').addEventListener('change', (e) => {
    document.getElementById('fragmentFields').style.opacity = e.target.checked ? '1' : '.45';
    document.getElementById('fragmentFields').style.pointerEvents = e.target.checked ? 'auto' : 'none';
  });

  // ---------------- initial load ----------------
  loadInbounds();
})();
