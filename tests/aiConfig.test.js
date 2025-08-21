const { resolveApiKey } = require('../lib/aiConfig');

describe('resolveApiKey', ()=>{
  const oldEnv = { ...process.env };
  afterEach(()=>{ process.env = { ...oldEnv }; });

  test('prefers paid when primary=paid', ()=>{
    process.env.GEMINI_API_KEY_PAID='PAID';
    process.env.GEMINI_API_KEY_FREE='FREE';
    expect(resolveApiKey('paid')).toBe('PAID');
  });
  test('prefers free when primary=free', ()=>{
    process.env.GEMINI_API_KEY_PAID='PAID';
    process.env.GEMINI_API_KEY_FREE='FREE';
    expect(resolveApiKey('free')).toBe('FREE');
  });
  test('falls back to generic key', ()=>{
    delete process.env.GEMINI_API_KEY_PAID;
    delete process.env.GEMINI_API_KEY_FREE;
    process.env.GEMINI_API_KEY='GEN';
    expect(resolveApiKey('paid')).toBe('GEN');
  });
});
