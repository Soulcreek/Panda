document.addEventListener('DOMContentLoaded', () => {
  const row = document.getElementById('kpiRow');
  fetch('/api/public/purview')
    .then((r) => r.json())
    .then((j) => {
      const data = j.data || {};
      const counts = data.counts || { posts: 0, podcasts: 0, media: 0 };
      const cards = [
        { title: 'Posts', value: counts.posts },
        { title: 'Podcasts', value: counts.podcasts },
        { title: 'Media items', value: counts.media },
      ];
      cards.forEach((c) => {
        const col = document.createElement('div');
        col.className = 'col-12 col-md-4';
        col.innerHTML = `<div class="card p-3 h-100"><div class="h5">${c.title}</div><div class="display-6">${c.value}</div></div>`;
        row.appendChild(col);
      });
    })
    .catch((e) => {
      row.innerHTML = '<div class="text-danger">Unable to load Purview aggregates.</div>';
      console.error(e);
    });
});
