/**
 * DEER MES — Auth Routes (Multi-tenant)
 * Login includes tenantSlug in JWT
 * POST /api/auth/login  — { username, password, tenantSlug }
 * POST /api/auth/register — { ... } (only company_admin or super-admin can call)
 * GET  /api/auth/me
 */
const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const { master } = require('../db/master')
const { getTenantDb } = require('../db/tenant')
const { auth, SECRET } = require('../middleware/auth')

// Rate limit login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Previše pokušaja prijave. Pokušaj ponovo za 15 minuta.' },
  standardHeaders: true,
  legacyHeaders: false,
})

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password, tenantSlug } = req.body
  if (!username || !password || !tenantSlug) {
    return res.status(400).json({ error: 'Username, password i tenantSlug su obavezni' })
  }

  try {
    // 1. Verify tenant exists and is active
    const tenant = master.get('SELECT * FROM tenants WHERE slug=? AND active=1', [tenantSlug])
    if (!tenant) {
      return res.status(401).json({ error: 'Tvrtka nije pronađena ili je neaktivna' })
    }

    // 2. Get tenant DB and find user
    const db = await getTenantDb(tenantSlug)
    const user = db.get('SELECT * FROM users WHERE username=? AND active=1', [username])
    if (!user) {
      return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' })
    }

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Pogrešno korisničko ime ili lozinka' })
    }

    // 3. Update last login
    db.prepare('UPDATE users SET last_login=datetime(\'now\') WHERE id=?').run(user.id)

    // 4. Log to master audit
    master.prepare('INSERT INTO audit_log (tenant_id,tenant_slug,user_id,username,action,entity) VALUES (?,?,?,?,?,?)').run(
      tenant.id, tenantSlug, user.id, user.username, 'LOGIN', 'auth'
    )

    // 5. Issue JWT with tenantSlug
    const token = jwt.sign({
      id: user.id,
      username: user.username,
      role: user.role,
      tenantSlug,
      tenantId: tenant.id,
    }, SECRET, { expiresIn: '8h' })

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        email: user.email,
        department: user.department,
      },
      tenant: {
        slug: tenant.slug,
        name: tenant.name,
        plan: tenant.plan,
      }
    })
  } catch (e) {
    console.error('Login error:', e.message)
    res.status(500).json({ error: 'Greška pri prijavi' })
  }
})

// GET /api/auth/me — returns current user info
router.get('/me', auth, async (req, res) => {
  try {
    const db = await getTenantDb(req.user.tenantSlug)
    const user = db.get('SELECT id,username,first_name,last_name,email,role,department,active FROM users WHERE id=?', [req.user.id])
    const tenant = master.get('SELECT slug,name,plan FROM tenants WHERE slug=?', [req.user.tenantSlug])
    res.json({ user, tenant })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /api/auth/logout — client-side token invalidation (log it)
router.post('/logout', auth, async (req, res) => {
  try {
    master.prepare('INSERT INTO audit_log (tenant_slug,user_id,username,action,entity) VALUES (?,?,?,?,?)').run(
      req.user.tenantSlug, req.user.id, req.user.username, 'LOGOUT', 'auth'
    )
  } catch {}
  res.json({ ok: true })
})

module.exports = router
