const { extractJson, parseWithShape, validateShape } = require('../lib/aiParse');

describe('aiParse edge cases', () => {
  test('extractJson handles fenced code block', () => {
    const raw = 'Some intro```json\n{"a":1}\n``` trailing';
    const r = extractJson(raw);
    expect(r.json).toEqual({ a: 1 });
    expect(r.error).toBeNull();
  });
  test('extractJson salvages from surrounding prose', () => {
    const raw = 'Answer: {"x":42,"y":"ok"} Done.';
    const r = extractJson(raw);
    expect(r.json).toEqual({ x: 42, y: 'ok' });
  });
  test('parseWithShape reports missing keys', () => {
    const raw = '{"x":1}';
    const r = parseWithShape(raw, { x: 'number', y: 'string' });
    expect(r.shapeOk).toBe(false);
    expect(r.shapeErrors).toContain('missing_y');
  });
  test('validateShape type mismatch', () => {
    const v = validateShape({ a: 1, b: '2' }, { a: 'number', b: 'number' });
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('type_b');
  });
});
