document.addEventListener('DOMContentLoaded',()=>{
  const purviewLink = document.querySelector('a[href="/purview"]');
  if(!purviewLink) return;
  purviewLink.addEventListener('click', (e)=>{
    try{ navigator.sendBeacon('/api/track', JSON.stringify({ event:'nav_purview_click' })); }catch(e){ fetch('/api/track',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ event:'nav_purview_click' })}).catch(()=>{}); }
  });
});
