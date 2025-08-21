const { baseSlug } = require('../lib/slug');

describe('baseSlug', ()=>{
  test('strips special characters and collapses dashes', ()=>{
    expect(baseSlug('Hello!!! World---Test')).toBe('hello-world-test');
  });
  test('fallback to post when empty', ()=>{
    expect(baseSlug('   ')).toBe('post');
  });
  test('length capped to 190', ()=>{
    const long = 'a'.repeat(300);
    expect(baseSlug(long).length).toBe(190);
  });
});
