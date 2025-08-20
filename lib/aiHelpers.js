const fetch = require('node-fetch');
const { apiKey, modelFast, modelHeavy, endpointFor, safetySettings } = require('./aiConfig');

if(!apiKey){
	console.warn('[AI] GEMINI_API_KEY is not set. AI endpoints will return 503.');
}

async function callGeminiRaw({model= modelFast, system, user, json=false, temperature=0.7, maxOutputTokens=2048}){
	if(!apiKey) throw new Error('NO_API_KEY');
	const url = endpointFor(model);
	const contents=[{role:'user', parts:[{text: (system? system+"\n\n" : '') + user}]}];
	const reqBody={ contents, safetySettings, generationConfig:{ temperature, maxOutputTokens } };
	const res= await fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(reqBody)});
	if(!res.ok){ const txt=await res.text(); throw new Error('Gemini HTTP '+res.status+': '+txt.slice(0,500)); }
	const data=await res.json();
	const first = data.candidates && data.candidates[0];
	let text = first && first.content && first.content.parts && first.content.parts[0] && first.content.parts[0].text || '';
	if(json){
		// Try extract fenced json
		const match = text.match(/```json[\s\S]*?```/i); if(match){ text = match[0].replace(/```json|```/gi,'').trim(); }
	}
	return { raw:data, text };
}

// Two-stage generation helpers
// Stage 1: Research summary
// Stage 2: Turn summary into article body
async function generateWhatsNew(){
	// Stage 1 prompt
	const stage1Sys = 'You are an analyst summarizing latest developments in data governance, Microsoft Purview, security & compliance (German).';
	const stage1User = 'Liste in 5-7 knappen Bullet-Points die wichtigsten aktuellen News (max 400 Zeichen total).';
	const s1= await callGeminiRaw({ system: stage1Sys, user: stage1User, model: modelFast, temperature:0.5 });
	const bullets = s1.text.replace(/\n+/g,'\n').trim();
	const stage2Sys = 'You are a German tech blogger. Create an original concise blog post (HTML) based on provided bullet points.';
	const stage2User = `Nutze diese Bullet Points:\n${bullets}\n\nAntwort als JSON mit Feldern: {"title_de":"...","content_de":"<p>HTML …</p>"}`;
	const s2= await callGeminiRaw({ system: stage2Sys, user: stage2User, model: modelHeavy, json:true, temperature:0.7 });
	let parsed=null; let parse_error=null;
	try{ parsed=JSON.parse(s2.text); } catch(e){ parse_error=e.message; }
	return { stage1:bullets, ...parsed, raw: s2.text, parse_error };
}

async function generateSampleArticle(){
	const sys='You are a German blog content generator.';
	const user='Erzeuge Beispiel Blogartikel als JSON {"title_de":"...","content_de":"<p>HTML…</p>"} zum Thema Microsoft Purview Grundlagen. Kurz (ca. 4 Absätze).';
	const r = await callGeminiRaw({ system:sys, user, model: modelFast, json:true, temperature:0.6 });
	let parsed=null; let parse_error=null;
	try{ parsed=JSON.parse(r.text);}catch(e){ parse_error=e.message; }
	return { ...parsed, raw:r.text, parse_error };
}

async function translateDeToEn(htmlTitle, htmlBody){
	const sys='You are a professional translator. Preserve simple HTML tags. Output JSON.';
	const user=`German Title: ${htmlTitle}\n\nGerman HTML Content:\n${htmlBody}\n\nReturn JSON {"title":"...","content":"<p>...EN...</p>"}`;
	const r = await callGeminiRaw({ system:sys, user, model: modelFast, json:true, temperature:0.3 });
	let parsed=null; let parse_error=null; try{ parsed=JSON.parse(r.text);}catch(e){ parse_error=e.message; }
	return { ...parsed, raw:r.text, parse_error };
}

async function generatePodcastMetadata(title, description){
	const sys='You are an assistant creating SEO metadata.';
	const user=`Given podcast title and description produce JSON {"seo_title":"...","seo_description":"...","meta_keywords":"kw1,kw2"}.\nTitle: ${title}\nDescription: ${description}`;
	const r= await callGeminiRaw({ system:sys, user, model: modelFast, json:true, temperature:0.5 });
	let parsed=null, parse_error=null; try{ parsed=JSON.parse(r.text);}catch(e){ parse_error=e.message; }
	return { ...parsed, raw:r.text, parse_error };
}

module.exports = { generateWhatsNew, generateSampleArticle, translateDeToEn, generatePodcastMetadata };
