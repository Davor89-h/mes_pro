/**
 * DEER MES — Super Admin Routes
 * Manages tenants, creates new companies, global oversight
 * All routes require superAuth middleware
 */
const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const { master } = require('../db/master')
const { createTenantDb, getTenantDb, evictTenantDb } = require('../db/tenant')
const { superAuth, SUPER_SECRET } = require('../middleware/auth')

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 })

// POST /api/superadmin/login
router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' })
  const admin = master.get('SELECT * FROM super_admins WHERE username=? AND active=1', [username])
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }
  master.prepare('UPDATE super_admins SET last_login=datetime(\'now\') WHERE id=?').run(admin.id)
  const token = jwt.sign({ id: admin.id, username: admin.username, isSuperAdmin: true }, SUPER_SECRET, { expiresIn: '4h' })
  res.json({ token, admin: { id: admin.id, username: admin.username, email: admin.email } })
})

// ── All routes below require super admin auth ───────────────────────────────
router.use(superAuth)

// GET /api/superadmin/tenants — list all tenants
router.get('/tenants', (req, res) => {
  try {
    const tenants = master.all('SELECT * FROM tenants ORDER BY created_at DESC')
    res.json(tenants)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/superadmin/tenants/:slug — tenant details
router.get('/tenants/:slug', (req, res) => {
  try {
    const tenant = master.get('SELECT * FROM tenants WHERE slug=?', [req.params.slug])
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' })
    res.json(tenant)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/superadmin/tenants — create new tenant (new company)
router.post('/tenants', async (req, res) => {
  const { name, slug, email, plan = 'starter', adminUsername, adminPassword, maxUsers = 10, maxMachines = 20 } = req.body
  if (!name || !slug || !email || !adminUsername || !adminPassword) {
    return res.status(400).json({ error: 'name, slug, email, adminUsername, adminPassword su obavezni' })
  }
  // Validate slug
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug smije sadržavati samo mala slova, brojeve i crtice' })
  }
  const existing = master.get('SELECT id FROM tenants WHERE slug=?', [slug])
  if (existing) return res.status(409).json({ error: 'Slug već postoji' })

  try {
    const path = require('path')
    const dbPath = path.join(__dirname, '../../data/tenants', `${slug}.db`)

    // Create isolated tenant database
    await createTenantDb(slug, adminUsername, adminPassword, name)

    // Register in master
    const result = master.prepare(`INSERT INTO tenants (slug,name,email,plan,active,max_users,max_machines,db_path)
      VALUES (?,?,?,?,1,?,?,?)`).run(slug, name, email, plan, maxUsers, maxMachines, dbPath)

    master.prepare('INSERT INTO audit_log (tenant_id,tenant_slug,username,action,entity,new_value) VALUES (?,?,?,?,?,?)').run(
      result.lastInsertRowid, slug, req.superAdmin.username, 'CREATE_TENANT', 'tenant', JSON.stringify({ name, slug, plan })
    )

    res.json({
      ok: true,
      tenant: { id: result.lastInsertRowid, slug, name, email, plan },
      credentials: { username: adminUsername, note: 'Lozinka je pohranjena hashirana — zapamtite je!' }
    })
  } catch (e) {
    console.error('Create tenant error:', e)
    res.status(500).json({ error: e.message })
  }
})

// PATCH /api/superadmin/tenants/:slug — update tenant (activate/deactivate, change plan)
router.patch('/tenants/:slug', (req, res) => {
  const { active, plan, maxUsers, maxMachines, name, email } = req.body
  try {
    const tenant = master.get('SELECT * FROM tenants WHERE slug=?', [req.params.slug])
    if (!tenant) return res.status(404).json({ error: 'Not found' })

    master.prepare(`UPDATE tenants SET
      active=COALESCE(?,active), plan=COALESCE(?,plan),
      max_users=COALESCE(?,max_users), max_machines=COALESCE(?,max_machines),
      name=COALESCE(?,name), email=COALESCE(?,email),
      updated_at=datetime('now') WHERE slug=?`
    ).run(active ?? null, plan ?? null, maxUsers ?? null, maxMachines ?? null, name ?? null, email ?? null, req.params.slug)

    master.prepare('INSERT INTO audit_log (tenant_slug,username,action,entity,new_value) VALUES (?,?,?,?,?)').run(
      req.params.slug, req.superAdmin.username, 'UPDATE_TENANT', 'tenant', JSON.stringify(req.body)
    )

    if (active === 0) evictTenantDb(req.params.slug)

    res.json({ ok: true, tenant: master.get('SELECT * FROM tenants WHERE slug=?', [req.params.slug]) })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/superadmin/tenants/:slug/users — list tenant users
router.get('/tenants/:slug/users', async (req, res) => {
  try {
    const db = await getTenantDb(req.params.slug)
    const users = db.all('SELECT id,username,first_name,last_name,email,role,department,active,last_login,created_at FROM users')
    res.json(users)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/superadmin/stats — global platform stats
router.get('/stats', async (req, res) => {
  try {
    const tenants = master.all('SELECT * FROM tenants')
    const active = tenants.filter(t => t.active).length
    const recent_audit = master.all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50')
    let total_users = 0
    for (const t of tenants.filter(x => x.active)) {
      try {
        const db = await getTenantDb(t.slug)
        const cnt = db.get('SELECT COUNT(*) as c FROM users WHERE active=1')
        total_users += cnt?.c || 0
      } catch {}
    }
    res.json({
      total_tenants: tenants.length,
      active_tenants: active,
      inactive_tenants: tenants.length - active,
      total_users,
      recent_audit,
      tenants: tenants.map(t => ({ slug: t.slug, name: t.name, plan: t.plan, active: t.active, created_at: t.created_at }))
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/superadmin/audit — audit log
router.get('/audit', (req, res) => {
  const { tenant, limit = 100 } = req.query
  try {
    let rows
    if (tenant) {
      rows = master.all('SELECT * FROM audit_log WHERE tenant_slug=? ORDER BY created_at DESC LIMIT ?', [tenant, parseInt(limit)])
    } else {
      rows = master.all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', [parseInt(limit)])
    }
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
