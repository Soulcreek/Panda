// Bootstrapping previously inline (theme + CSRF helper)
(function () {
  try {
    var attr = document.documentElement.getAttribute('data-user-prefs');
    window.__USER_PREFS = attr ? JSON.parse(decodeURIComponent(attr)) : null;
    // Theme precedence: localStorage (explicit) > server userPrefs; default = light (ignore system preference)
    var theme = null;
    try {
      var ls = localStorage.getItem('pp_theme');
      if (ls && (ls === 'dark' || ls === 'light')) theme = ls; // ignore 'system'
    } catch (e) {
      /* ignore */
    }
    if (!theme) {
      var up =
        window.__USER_PREFS && window.__USER_PREFS.theme ? String(window.__USER_PREFS.theme) : '';
      if (up === 'dark' || up === 'light') theme = up; // ignore 'system' here too
    }
    if (!theme) theme = 'light';
    // Always enforce computed theme (do not early-return if class present)
    var has = document.documentElement.classList.contains('dark-mode');
    if (theme === 'dark' && !has) document.documentElement.classList.add('dark-mode');
    if (theme !== 'dark' && has) document.documentElement.classList.remove('dark-mode');
  } catch (e) {}
})();
(function () {
  var meta = document.querySelector('meta[name="csrf-token"]');
  window.CSRF_TOKEN = meta ? meta.getAttribute('content') : '';
  document.addEventListener('DOMContentLoaded', function () {
    try {
      if (!window.CSRF_TOKEN) return;
      document.querySelectorAll('form[method="post" i]').forEach(function (f) {
        if (f.querySelector('input[name="_csrf"]')) return;
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = '_csrf';
        input.value = window.CSRF_TOKEN;
        f.appendChild(input);
      });
      if (!window.__csrfFetchPatched) {
        const _origFetch = window.fetch;
        window.fetch = function (url, opts) {
          opts = opts || {};
          opts.headers = opts.headers || {};
          const method = (opts.method || 'GET').toUpperCase();
          if (
            window.CSRF_TOKEN &&
            method !== 'GET' &&
            method !== 'HEAD' &&
            !('CSRF-Token' in opts.headers) &&
            !(
              'x-csrf-token' in
              Object.keys(opts.headers).reduce((a, k) => {
                a[k.toLowerCase()] = opts.headers[k];
                return a;
              }, {})
            )
          ) {
            opts.headers['CSRF-Token'] = window.CSRF_TOKEN;
          }
          return _origFetch(url, opts);
        };
        window.__csrfFetchPatched = true;
      }
    } catch (e) {
      console.warn('CSRF Auto Inject Fehler', e);
    }
  });
})();
