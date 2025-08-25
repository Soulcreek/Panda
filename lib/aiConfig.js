// AI Configuration (static defaults + helpers for dynamic selection)
// Environment:
//   GEMINI_API_KEY / GEMINI_API_KEY_PAID / GEMINI_API_KEY_FREE (fallback chain)
//   GEMINI_MODEL (fast) / GEMINI_MODEL_HEAVY (heavy)

const config = {
  modelFast: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  modelHeavy: process.env.GEMINI_MODEL_HEAVY || 'gemini-1.5-pro',
  safetySettings: [
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' },
  ],
};

function resolveApiKey(primaryChoice) {
  const paid = process.env.GEMINI_API_KEY_PAID || process.env.GEMINI_API_KEY || '';
  const free = process.env.GEMINI_API_KEY_FREE || process.env.GEMINI_API_KEY || '';
  if (primaryChoice === 'free') {
    return free || paid || process.env.GEMINI_API_KEY || '';
  }
  // default paid
  return paid || free || process.env.GEMINI_API_KEY || '';
}

function endpointFor(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
}

module.exports = { ...config, resolveApiKey, endpointFor };
