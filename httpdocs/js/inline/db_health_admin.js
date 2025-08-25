(function () {
  const banner = document.getElementById('db-health-banner-admin');
  function updateBanner(d) {
    if (!banner) return;
    if (!d.degraded && (!d.lastPingMs || d.lastPingMs <= d.threshold)) {
      banner.className = 'd-none';
      return;
    }
    banner.className =
      'alert py-1 px-2 mb-2 small d-flex align-items-center gap-2 ' +
      (d.lastError ? 'alert-danger' : 'alert-warning');
    banner.innerHTML =
      '<strong>DB</strong> <span>' +
      (d.lastError
        ? 'Fehler: ' + d.lastError
        : 'Langsam (' + d.lastPingMs + 'ms, Ø ' + (d.rollingAvgMs || '?') + 'ms)') +
      '</span><span class="text-muted">slow: ' +
      d.slowQueries +
      '/' +
      d.totalQueries +
      '</span><button type="button" class="btn btn-sm btn-outline-secondary ms-auto" id="dbHealthRefreshBtnAdmin">Neu prüfen</button>';
    banner.querySelector('#dbHealthRefreshBtnAdmin').addEventListener('click', () => ping(true));
  }
  async function ping(force) {
    try {
      const r = await fetch('/admin/api/db-health' + (force ? '?force=1' : ''));
      const d = await r.json();
      if (d) updateBanner(d);
    } catch (_) {}
  }
  setInterval(ping, 20000);
})();
