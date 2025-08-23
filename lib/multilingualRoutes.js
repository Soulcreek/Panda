// Multilingual URL middleware
// Supports both /en/page and /page?lang=en patterns
function multilingualMiddleware(req, res, next) {
  // Extract language from path prefix (e.g., /en/blog, /de/about)
  const pathMatch = req.path.match(/^\/([a-z]{2})(\/.*|$)/);
  
  if (pathMatch) {
    const [, langCode, restPath] = pathMatch;
    
    // Validate supported languages
    if (['en', 'de'].includes(langCode)) {
      // Set language and modify request path
      req.query.lang = langCode;
      req.url = (restPath || '/') + (req.url.includes('?') ? '&' + req.url.split('?')[1] : '');
      req.path = restPath || '/';
    }
  }
  
  next();
}

// Helper function for templates to generate localized URLs
function localizedUrl(path, locale, currentLocale) {
  // Remove existing language prefix
  const cleanPath = path.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/';
  
  // Add new language prefix (except for default 'de')
  if (locale && locale !== 'de') {
    return `/${locale}${cleanPath}`;
  }
  
  return cleanPath;
}

module.exports = { multilingualMiddleware, localizedUrl };
