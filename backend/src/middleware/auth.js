/**
 * DEER MES — Auth Middleware (Multi-tenant)
 * JWT tokens now include tenantSlug for tenant resolution
 */
const jwt = require('jsonwebtoken')
const SECRET = process.env.JWT_SECRET || 'deer-mes-secret-key-2024'
const SUPER_SECRET = process.env.SUPER_JWT_SECRET || 'deer-super-admin-secret-2024'

// Standard auth — verifies JWT, attaches user + tenantSlug to req
const auth = (req, res, next) => {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'No token' })
  const token = header.replace('Bearer ', '')
  try {
    req.user = jwt.verify(token, SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Super admin auth — separate secret, no tenant
const superAuth = (req, res, next) => {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'No token' })
  const token = header.replace('Bearer ', '')
  try {
    const decoded = jwt.verify(token, SUPER_SECRET)
    if (!decoded.isSuperAdmin) return res.status(403).json({ error: 'Not super admin' })
    req.superAdmin = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Invalid super admin token' })
  }
}

// RBAC — checks permission against tenant DB (set by tenantMiddleware)
const checkPermission = (permission) => (req, res, next) => {
  if (req.user?.role === 'company_admin') return next()
  try {
    const db = req.db
    if (!db) return next() // fallback if no tenant db attached yet
    const hasPermission = db.get(`
      SELECT 1 as ok FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ? AND p.name = ? LIMIT 1
    `, [req.user.id, permission])
    if (!hasPermission) return res.status(403).json({ error: `Forbidden — required: ${permission}` })
    next()
  } catch (e) {
    console.warn('RBAC check skipped:', e.message)
    next()
  }
}

const requireRole = (...roles) => (req, res, next) => {
  if (roles.includes(req.user?.role)) return next()
  return res.status(403).json({ error: 'Insufficient role' })
}

module.exports = { auth, superAuth, checkPermission, requireRole, SECRET, SUPER_SECRET }
