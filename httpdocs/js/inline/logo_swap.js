// Swap logo on dark-mode class change
(function () {
  function swap() {
    var el = document.getElementById('siteLogo');
    if (!el) return;
    var dark = document.documentElement.classList.contains('dark-mode');
    var ds = el.getAttribute('data-logo-dark');
    var ls = el.getAttribute('data-logo-light');
    el.src = dark && ds ? ds : ls || el.src;
  }
  swap();
  new MutationObserver(swap).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
})();
