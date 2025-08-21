const { renderAdvancedLayout, safeSlug } = require('../lib/advancedPagesUtil');

describe('Advanced Pages Utilities', ()=>{
  test('safeSlug generates fallback for empty', ()=>{
    const s = safeSlug('');
    expect(s.startsWith('page-')).toBe(true);
  });
  test('renderAdvancedLayout builds basic hero html', ()=>{
    const layout={ rows:[ { columns:[ { width:12, blocks:[ { type:'hero', title:'Titel', subtitle:'Sub', height:'40vh' } ] } ] } ] };
    const html = renderAdvancedLayout(layout,{});
    expect(html).toContain('ap-hero');
    expect(html).toContain('Titel');
  });
  test('podcast-link block renders link card when helper provided', ()=>{
    const layout={ rows:[ { columns:[ { width:12, blocks:[ { type:'podcast-link', podcastId:5 } ] } ] } ] };
    const html = renderAdvancedLayout(layout,{ podcasts:{ 5:{ id:5, title:'Episode 5', description:'Desc' } } });
    expect(html).toContain('ap-podcast-link');
    expect(html).toContain('Episode 5');
  });
});
