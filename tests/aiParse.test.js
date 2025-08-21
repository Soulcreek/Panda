const { extractJson, parseWithShape } = require('../lib/aiParse');

describe('aiParse', ()=>{
  test('extracts fenced json', ()=>{
    const raw = 'Intro text```json\n{"a":1,"b":"x"}\n```tail';
    const r = extractJson(raw);
    expect(r.json).toEqual({a:1,b:'x'});
    expect(r.error).toBeNull();
  });
  test('shape validation fails missing key', ()=>{
    const raw = '{"title":"Hello"}';
    const r = parseWithShape(raw, { title:'string', content:'string'});
    expect(r.shapeOk).toBe(false);
    expect(r.shapeErrors).toContain('missing_content');
  });
  test('salvages inner json braces', ()=>{
    const raw = 'Noise {"x":2} trailing';
    const r = extractJson(raw);
    expect(r.json).toEqual({x:2});
  });
  test('returns error for empty', ()=>{
    const r = extractJson('');
    expect(r.json).toBeNull();
    expect(r.error).toBeTruthy();
  });
  test('fails shape type mismatch', ()=>{
    const raw = '{"a":"str"}';
    const r = parseWithShape(raw, { a:'number'});
    expect(r.shapeOk).toBe(false);
    expect(r.shapeErrors).toContain('type_a');
  });
});
