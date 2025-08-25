// Central authentication & authorization helpers
// Contract:
// - Roles: 'anonymous' < 'editor' < 'admin'.
// - 'viewer' is treated like 'anonymous' (read-only public).
// - ADMIN_ACCESS_TOKEN sets req.session.adminTokenValid and upgrades role to 'admin'.
function currentRole(req) {
  if (req.session && req.session.adminTokenValid) return 'admin';
  const sessRole = req.session && req.session.role;
  // Treat viewer exactly like anonymous (public) – no special privileges / enforcement
  if (sessRole === 'viewer') return 'anonymous';
  return (
    sessRole ||
    (req.session && (req.session.isLoggedIn || req.session.userId) ? 'editor' : 'anonymous')
  );
}
function isAuth(req, res, next) {
  const role = currentRole(req);
  if (role !== 'anonymous') return next();
  const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
  if (wantsJson && res.apiError)
    return res.apiError(401, { error: 'Not authenticated', code: 'AUTH_REQUIRED' });
  return res.redirect('/login');
}
function isAdmin(req, res, next) {
  const role = currentRole(req);
  if (role === 'admin') return next();
  return res.status(403).send('Admin benötigt');
}
function isEditor(req, res, next) {
  const role = currentRole(req);
  if (role === 'editor' || role === 'admin') return next();
  return res.redirect('/login');
}
// Generic role guard: requireRole(['admin','editor'])
function requireRole(roles) {
  return (req, res, next) => {
    const role = currentRole(req);
    if (roles.includes(role)) return next();
    if (res.apiError)
      return res.apiError(403, {
        error: 'Forbidden',
        code: 'FORBIDDEN_ROLE',
        detail: 'Role ' + role + ' not allowed',
      });
    return res.status(403).send('Forbidden');
  };
}

module.exports = { isAuth, isAdmin, isEditor, requireRole, currentRole };
