// Tag deep link (#tag:XYZ)
(function () {
  const hash = decodeURIComponent(location.hash || '');
  if (hash.startsWith('#tag:')) {
    const tag = hash.substring(5);
    if (tag && !location.pathname.startsWith('/blog/tag/')) {
      location.href = '/blog/tag/' + encodeURIComponent(tag);
    }
  }
})();
