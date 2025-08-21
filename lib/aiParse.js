// aiParse.js - centralized AI response parsing & shape validation
// Provides resilient JSON extraction (handles fenced code blocks, trailing prose)
// and optional schema validation (presence of required keys, simple type checks)

function extractJson(raw){
  if(!raw || typeof raw !== 'string') return { text: raw||'', json: null, error: 'EMPTY' };
  let work = raw.trim();
  // Pull JSON fenced block if present
  const fenced = work.match(/```json[\s\S]*?```/i);
  if(fenced){ work = fenced[0].replace(/```json|```/gi,'').trim(); }
  // First direct parse attempt
  let parsed = null; let error=null;
  try { parsed = JSON.parse(work); } catch(e){ error = e.message; }
  if(parsed) return { text: work, json: parsed, error:null };
  // Salvage by locating first '{' and last '}'
  const first = work.indexOf('{');
  const last = work.lastIndexOf('}');
  if(first>=0 && last>first){ const slice = work.slice(first,last+1); try { parsed = JSON.parse(slice); return { text: slice, json: parsed, error:null }; } catch(e2){ error = e2.message; } }
  // Attempt to remove trailing markdown artifacts (common for models)
  if(/\}\s*```/.test(work)){ const cleaned = work.replace(/```.*$/s,''); try { parsed = JSON.parse(cleaned); return { text: cleaned, json: parsed, error:null }; } catch(e3){ error = e3.message; } }
  return { text: work, json: null, error: error || 'PARSE_FAILED' };
}

function validateShape(obj, shape){
  // shape: { key: 'string' | 'number' | 'object' | 'array' | 'any' }
  if(!obj || typeof obj !== 'object') return { ok:false, errors:['root_not_object'] };
  const errors=[];
  for(const [k, type] of Object.entries(shape)){
    if(!(k in obj)){ errors.push('missing_'+k); continue; }
    if(type==='any') continue;
    if(type==='array'){ if(!Array.isArray(obj[k])) errors.push('type_'+k); }
    else if(typeof obj[k] !== type) errors.push('type_'+k);
  }
  return { ok: errors.length===0, errors };
}

function parseWithShape(raw, shape){
  const base = extractJson(raw);
  if(!base.json) return { ...base, shapeOk:false, shapeErrors: base.error ? [base.error] : [] };
  const { ok, errors } = validateShape(base.json, shape||{});
  return { ...base, shapeOk: ok, shapeErrors: errors };
}

module.exports = { extractJson, parseWithShape, validateShape };
