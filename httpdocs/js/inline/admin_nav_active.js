(function () {
  try {
    const p = window.location.pathname;
    document
      .querySelectorAll('.admin-nav-shell .nav-link, .admin-nav-shell .dropdown-item')
      .forEach((a) => {
        const h = a.getAttribute('href');
        if (h && h === p) {
          a.classList.add('active');
          const dd = a.closest('.dropdown');
          if (dd) {
            const t = dd.querySelector('.dropdown-toggle');
            if (t) t.classList.add('active');
          }
        }
      });
  } catch (e) {}
})();
