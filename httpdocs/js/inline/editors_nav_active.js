(function () {
  try {
    const p = window.location.pathname;
    document.querySelectorAll('.editors-nav-shell .nav-link').forEach((a) => {
      if (a.getAttribute('href') === p) a.classList.add('active');
    });
  } catch (e) {}
})();
