/**
 * DEER MES — Tenant Middleware
 * Resolves tenant from JWT token, attaches tenant DB to req
 * Every request automatically uses the correct isolated database
 */
const { getTenantDb } = require('../db/tenant')
const { master } = require('../db/master')

// Attach tenant DB to every authenticated request
const tenantMiddleware = async (req, res, next) => {
  try {
    if (!req.user) return next() // auth middleware handles 401

    const tenantSlug = req.user.tenantSlug
    if (!tenantSlug) {
      return res.status(400).json({ error: 'No tenant in token' })
    }

    // Verify tenant is active
    const tenant = master.get('SELECT * FROM tenants WHERE slug=? AND active=1', [tenantSlug])
    if (!tenant) {
      return res.status(403).json({ error: 'Tenant not found or inactive' })
    }

    req.tenant = tenant
    req.db = await getTenantDb(tenantSlug)
    next()
  } catch (e) {
    console.error('Tenant middleware error:', e.message)
    res.status(500).json({ error: 'Tenant resolution failed' })
  }
}

module.exports = { tenantMiddleware }
