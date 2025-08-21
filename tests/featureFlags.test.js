const pool = require('../db');

// Feature flag CRUD tests (library level)

describe('featureFlags library basic CRUD', ()=>{
  let ff;
  beforeAll(()=>{ ff = require('../lib/featureFlags'); });
  test('upsertFlag creates and listFlags returns it', async()=>{
    const site='testsite_ff';
    await ff.upsertFlag(site,'beta_mode',true,null,'Beta Mode aktiv');
    const list = await ff.listFlags(site);
    const item = list.find(f=> f.flag_key==='beta_mode');
    expect(item).toBeTruthy();
    expect(item.enabled).toBe(1);
  });
  test('deleteFlag removes flag', async()=>{
    const site='testsite_ff';
    await ff.upsertFlag(site,'temp_flag',true,null,'Temp');
    let list = await ff.listFlags(site);
    expect(list.find(f=> f.flag_key==='temp_flag')).toBeTruthy();
    await ff.deleteFlag(site,'temp_flag');
    list = await ff.listFlags(site);
    expect(list.find(f=> f.flag_key==='temp_flag')).toBeFalsy();
  });
  test('multi-tenant isolation: same flag_key differs per site', async()=>{
    const siteA='isolation_site_A';
    const siteB='isolation_site_B';
    await ff.upsertFlag(siteA,'shared_flag',true,'A','Site A Variante');
    await ff.upsertFlag(siteB,'shared_flag',false,'B','Site B Variante');
    const listA = await ff.listFlags(siteA);
    const listB = await ff.listFlags(siteB);
    const a = listA.find(f=> f.flag_key==='shared_flag');
    const b = listB.find(f=> f.flag_key==='shared_flag');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a.enabled).toBe(1);
    expect(b.enabled).toBe(0);
    expect(a.variant).toBe('A');
    expect(b.variant).toBe('B');
  });
});
