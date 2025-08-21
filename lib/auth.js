// Central authentication helpers for admin/editor routes
function isAuth(req, res, next) {
  if (req.session && (req.session.isLoggedIn || req.session.userId || req.session.adminTokenValid)) return next();
  const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
  if (wantsJson && res.apiError) return res.apiError(401, { error: 'Not authenticated', code: 'AUTH_REQUIRED' });
  return res.redirect('/login');
}
module.exports = { isAuth };
