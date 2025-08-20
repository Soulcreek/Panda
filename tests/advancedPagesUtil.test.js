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
});
