// Slug utilities extracted from editors/posts route for reuse & testing
// Generates a URL friendly slug base (no uniqueness / DB checks)
function baseSlug(str) {
  return (
    (str || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 190) || 'post'
  );
}

module.exports = { baseSlug };
