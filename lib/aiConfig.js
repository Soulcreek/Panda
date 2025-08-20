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
	// Updated safety settings (Gemini v1beta expects specific enum names)
	safetySettings: [
		{category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE'},
		{category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE'},
		{category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE'},
		{category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE'},
		{category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE'}
	]
};
