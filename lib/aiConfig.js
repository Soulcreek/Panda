// AI Configuration for Gemini (Google Generative Language API)
// Environment:
//   GEMINI_API_KEY   -> required
//   GEMINI_MODEL     -> optional (default: gemini-1.5-flash)
//   GEMINI_MODEL_HEAVY -> optional (default: gemini-1.5-pro)
// Minimal wrapper configuration exported for helpers.

module.exports = {
	apiKey: process.env.GEMINI_API_KEY || '',
	modelFast: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
	modelHeavy: process.env.GEMINI_MODEL_HEAVY || 'gemini-1.5-pro',
	endpointFor(model){
		// v1beta generateContent endpoint
		return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
	},
	// Generic safety settings (kept permissive; adjust if needed)
	safetySettings: [
		{category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE'},
		{category: 'HARM_CATEGORY_SEXUAL', threshold: 'BLOCK_NONE'},
		{category: 'HARM_CATEGORY_DANGEROUS', threshold: 'BLOCK_NONE'},
		{category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE'}
	]
};
