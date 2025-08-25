const fs = require('fs');
const path = require('path');

const cache = {};
const DEFAULT_LOCALE = 'de';
function loadLocale(locale) {
  if (cache[locale]) return cache[locale];
  try {
    const p = path.join(__dirname, 'locales', locale + '.json');
    const raw = fs.readFileSync(p, 'utf8');
    cache[locale] = JSON.parse(raw);
    return cache[locale];
  } catch (e) {
    cache[locale] = {};
    return cache[locale];
  }
}
function tFactory(locale) {
  const current = loadLocale(locale);
  const fallbackDict = locale === DEFAULT_LOCALE ? current : loadLocale(DEFAULT_LOCALE);
  return function t(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(current, key)) return current[key];
    if (Object.prototype.hasOwnProperty.call(fallbackDict, key)) return fallbackDict[key];
    return fallback || key;
  };
}
module.exports = function i18nMiddleware(req, res, next) {
  // locale order: query ?lang=xx → session → header → default 'de'
  let locale = (req.query.lang || req.session?.lang || '').toLowerCase();
  if (!locale.match(/^[a-z]{2}$/)) {
    locale = (req.headers['accept-language'] || 'de').split(',')[0].slice(0, 2).toLowerCase();
  }
  if (!locale.match(/^[a-z]{2}$/)) locale = 'de';
  req.session && (req.session.lang = locale);
  res.locals.locale = locale;
  res.locals.t = tFactory(locale);
  next();
};
