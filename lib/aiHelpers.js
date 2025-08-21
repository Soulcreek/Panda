// node-fetch v3 is ESM; dynamic import wrapper
const fetch = (...args) => import('node-fetch').then(mod => mod.default(...args));
let metrics; try { metrics = require('./metrics'); } catch(_) { metrics = null; }
const { modelFast, modelHeavy, endpointFor, safetySettings, resolveApiKey } = require('./aiConfig');
const { extractJson, parseWithShape } = require('./aiParse');
const pool = require('../db');

// Cache ai_config for 15s for key selection + limits
async function loadAiConfig(){
	if(!loadAiConfig.cache || Date.now()-loadAiConfig.cacheTime>15000){
		let cfg={ primary_key_choice:'paid', max_daily_calls:500 };
		try { const [rows]=await pool.query('SELECT primary_key_choice, max_daily_calls FROM ai_config WHERE id=1'); if(rows.length){ cfg.primary_key_choice = rows[0].primary_key_choice || cfg.primary_key_choice; cfg.max_daily_calls = rows[0].max_daily_calls || cfg.max_daily_calls; } } catch(_){ }
		loadAiConfig.cache = cfg; loadAiConfig.cacheTime=Date.now();
	}
	return loadAiConfig.cache;
}

async function callGeminiRaw({model= modelFast, system, user, json=false, temperature=0.7, maxOutputTokens=2048}){
	const aiCfg = await loadAiConfig();
	const apiKey = resolveApiKey(aiCfg.primary_key_choice);
	if(!apiKey) throw new Error('NO_API_KEY');
	const url = endpointFor(model, apiKey);
	const contents=[{role:'user', parts:[{text: (system? system+"\n\n" : '') + user}]}];
	const reqBody={ contents, safetySettings, generationConfig:{ temperature, maxOutputTokens } };
	const start=Date.now();
	const res= await fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(reqBody)});
	if(metrics){ metrics.inc('ai_calls_total'); const dur = (Date.now()-start)/1000; metrics.observe('ai_call_duration_seconds', dur); }
	if(!res.ok){ const txt=await res.text(); throw new Error('Gemini HTTP '+res.status+': '+txt.slice(0,500)); }
	const data=await res.json();
	const first = data.candidates && data.candidates[0];
	let text = first && first.content && first.content.parts && first.content.parts[0] && first.content.parts[0].text || '';
	if(json){
		const match = text.match(/```json[\s\S]*?```/i); if(match){ text = match[0].replace(/```json|```/gi,'').trim(); }
	}
	return { raw:data, text };
}

// Two-stage generation helpers
// Stage 1: Research summary
// Stage 2: Turn summary into article body
function salvageJson(text){
	if(!text) return null;
	// Extract fenced block already stripped earlier maybe
	const fence = text.match(/\{[\s\S]*\}/);
	if(fence){
		try { return JSON.parse(fence[0]); } catch(_){}
	}
	// Try remove trailing prose after last brace
	const last = text.lastIndexOf('}');
	if(last>0){
		const cand = text.slice(0,last+1);
		try { return JSON.parse(cand); } catch(_){}
	}
	return null;
}

async function loadPrompts(){
	// lightweight cache (per process) with 30s TTL
	if(!loadPrompts.cache || Date.now()-loadPrompts.cacheTime>30000){
		let prompts={};
		try {
			const [rows]=await pool.query('SELECT prompts FROM ai_config WHERE id=1');
			if(rows.length && rows[0].prompts){ try { prompts=JSON.parse(rows[0].prompts)||{}; } catch(_){ } }
		} catch(_){}
		loadPrompts.cache = prompts; loadPrompts.cacheTime=Date.now();
	}
	return loadPrompts.cache;
}

async function generateWhatsNew(){
	// Stage 1 prompt
	const prompts = await loadPrompts();
	const baseResearch = prompts.whats_new_research || 'Liste in 5-7 knappen Bullet-Points die wichtigsten aktuellen News (max 400 Zeichen total).';
	const stage1Sys = 'You are an analyst summarizing latest developments in data governance, Microsoft Purview, security & compliance (German).';
	const stage1User = baseResearch;
	const s1= await callGeminiRaw({ system: stage1Sys, user: stage1User, model: modelFast, temperature:0.5 });
	const bullets = s1.text.replace(/\n+/g,'\n').trim();
	const stage2Sys = 'You are a German tech blogger. Create an original concise blog post (HTML) based on provided bullet points.';
	const stage2User = `Nutze diese Bullet Points:\n${bullets}\n\nAntwort als JSON mit Feldern: {"title_de":"...","content_de":"<p>HTML …</p>"}`;
	const s2= await callGeminiRaw({ system: stage2Sys, user: stage2User, model: modelHeavy, json:true, temperature:0.7 });
	const parsed = parseWithShape(s2.text, { title_de:'string', content_de:'string' });
	return { stage1:bullets, title_de: parsed.json? parsed.json.title_de: undefined, content_de: parsed.json? parsed.json.content_de: undefined, raw: s2.text, parse_error: !parsed.shapeOk? (parsed.shapeErrors.join(',') || parsed.error): null };
}

async function generateSampleArticle(){
	const prompts = await loadPrompts();
	const custom = prompts.blog_sample || 'Erzeuge Beispiel Blogartikel als JSON {"title_de":"...","content_de":"<p>HTML…</p>"} zum Thema Microsoft Purview Grundlagen. Kurz (ca. 4 Absätze).';
	const sys='You are a German blog content generator.';
	const user=custom;
	const r = await callGeminiRaw({ system:sys, user, model: modelFast, json:true, temperature:0.6 });
	const parsed = parseWithShape(r.text,{ title_de:'string', content_de:'string' });
	return { title_de: parsed.json? parsed.json.title_de: undefined, content_de: parsed.json? parsed.json.content_de: undefined, raw:r.text, parse_error: !parsed.shapeOk? (parsed.shapeErrors.join(',')||parsed.error): null };
}

async function translateDeToEn(htmlTitle, htmlBody){
	const prompts = await loadPrompts();
	const base = prompts.translate || 'Translate preserving simple HTML tags.';
	const sys='You are a professional translator. Preserve simple HTML tags. Output JSON.';
	const user=`${base}\n\nGerman Title: ${htmlTitle}\n\nGerman HTML Content:\n${htmlBody}\n\nReturn JSON {"title":"...","content":"<p>...EN...</p>"}`;
	const r = await callGeminiRaw({ system:sys, user, model: modelFast, json:true, temperature:0.3 });
	const parsed = parseWithShape(r.text,{ title:'string', content:'string' });
	// Title/content may also arrive as title_en/content_en
	const j = parsed.json || {};
	const title = j.title || j.title_en || j.title_de;
	const content = j.content || j.content_en || j.content_de;
	return { title, content, raw:r.text, parse_error: !parsed.shapeOk? (parsed.shapeErrors.join(',')||parsed.error): null };
}

async function generatePodcastMetadata(title, description){
	const sys='You are an assistant creating SEO metadata.';
	const user=`Given podcast title and description produce JSON {"seo_title":"...","seo_description":"...","meta_keywords":"kw1,kw2"}.\nTitle: ${title}\nDescription: ${description}`;
	const r= await callGeminiRaw({ system:sys, user, model: modelFast, json:true, temperature:0.5 });
	const parsed = parseWithShape(r.text,{ seo_title:'string', seo_description:'string', meta_keywords:'string' });
	const j = parsed.json || {};
	return { seo_title:j.seo_title, seo_description:j.seo_description, meta_keywords:j.meta_keywords, raw:r.text, parse_error: !parsed.shapeOk? (parsed.shapeErrors.join(',')||parsed.error): null };
}

module.exports = { generateWhatsNew, generateSampleArticle, translateDeToEn, generatePodcastMetadata };
