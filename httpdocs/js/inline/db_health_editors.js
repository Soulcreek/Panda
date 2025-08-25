(function () {
  const banner = document.getElementById('db-health-banner');
  const refreshBtn = document.getElementById('dbHealthRefreshBtn');
  function updateBanner(data) {
    if (!banner) return;
    if (!data.degraded && (!data.lastPingMs || data.lastPingMs <= data.threshold)) {
      banner.className = 'd-none';
      return;
    }
    banner.className =
      'alert py-1 px-2 mb-2 small d-flex align-items-center gap-2 ' +
      (data.lastError ? 'alert-danger' : 'alert-warning');
    banner.innerHTML =
      '<strong>DB</strong> <span>' +
      (data.lastError ? 'Fehler: ' + data.lastError : 'Langsam (' + data.lastPingMs + 'ms)') +
      '</span><button type="button" class="btn btn-sm btn-outline-secondary ms-auto" id="dbHealthRefreshBtn">Neu prüfen</button>';
    banner.querySelector('#dbHealthRefreshBtn').addEventListener('click', () => ping(true));
  }
  async function ping(force) {
    try {
      const r = await fetch('/admin/api/db-health' + (force ? '?force=1' : ''), {
        headers: { Accept: 'application/json' },
      });
      const d = await r.json();
      if (d) {
        updateBanner(d);
      }
    } catch (_) {}
  }
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => ping(true));
  }
  setInterval(ping, 20000);
})();
