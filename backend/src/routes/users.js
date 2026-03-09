const router = require('express').Router()
const bcrypt = require('bcryptjs')
const db = require('../db')
const { auth, checkPermission } = require('../middleware/auth')

router.use(auth)

// ── GET all users ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const users = db.all(`
    SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.role, u.active, u.created_at,
      GROUP_CONCAT(r.name, ',') as roles_list,
      GROUP_CONCAT(r.label, ',') as roles_labels
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    GROUP BY u.id
    ORDER BY u.first_name
  `)
  res.json(users.map(u => ({
    ...u,
    roles: u.roles_list ? u.roles_list.split(',') : [],
    roles_labels: u.roles_labels ? u.roles_labels.split(',') : []
  })))
})

// ── GET single user with permissions ─────────────────────────────────────
router.get('/:id', (req, res) => {
  const user = db.get('SELECT id, username, first_name, last_name, email, role, active, created_at FROM users WHERE id=?', [req.params.id])
  if (!user) return res.status(404).json({ error: 'Not found' })
  user.roles = db.all('SELECT r.* FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?', [req.params.id])
  user.permissions = db.all(`
    SELECT DISTINCT p.name, p.module, p.description
    FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN user_roles ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = ?
    ORDER BY p.module, p.name
  `, [req.params.id])
  res.json(user)
})

// ── POST create user ─────────────────────────────────────────────────────
router.post('/', checkPermission('users.manage'), (req, res) => {
  const { username, password, first_name, last_name, email, role } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' })
  try {
    const hash = bcrypt.hashSync(password, 10)
    const result = db.prepare('INSERT INTO users (username,password_hash,first_name,last_name,email,role) VALUES (?,?,?,?,?,?)').run(username, hash, first_name||username, last_name||'', email||'', role||'operator')
    res.json(db.get('SELECT id,username,first_name,last_name,email,role,active FROM users WHERE id=?', [result.lastInsertRowid]))
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' })
    res.status(500).json({ error: e.message })
  }
})

// ── PUT update user ───────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
  const { first_name, last_name, email, role, active } = req.body
  db.prepare('UPDATE users SET first_name=?,last_name=?,email=?,role=?,active=? WHERE id=?').run(first_name, last_name, email, role, active?1:0, req.params.id)
  res.json(db.get('SELECT id,username,first_name,last_name,email,role,active FROM users WHERE id=?', [req.params.id]))
})

// ── PATCH password ────────────────────────────────────────────────────────
router.patch('/:id/password', (req, res) => {
  const { password } = req.body
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password too short (min 4)' })
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(password, 10), req.params.id)
  res.json({ ok: true })
})

// ── DELETE / deactivate user ──────────────────────────────────────────────
router.delete('/:id', checkPermission('users.manage'), (req, res) => {
  if (req.user.id == req.params.id) return res.status(400).json({ error: 'Cannot deactivate yourself' })
  db.prepare('UPDATE users SET active=0 WHERE id=?').run(req.params.id)
  res.json({ ok: true })
})

// ── GET all roles ─────────────────────────────────────────────────────────
router.get('/roles/all', (req, res) => {
  const roles = db.all('SELECT * FROM roles ORDER BY name')
  roles.forEach(r => {
    r.permissions = db.all(`SELECT p.name, p.module FROM permissions p JOIN role_permissions rp ON rp.permission_id=p.id WHERE rp.role_id=?`, [r.id])
  })
  res.json(roles)
})

// ── POST assign role to user ──────────────────────────────────────────────
router.post('/:id/roles', checkPermission('users.manage'), (req, res) => {
  try {
    const { role_id } = req.body
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id,role_id,granted_by) VALUES (?,?,?)').run(req.params.id, role_id, req.user.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── DELETE remove role from user ──────────────────────────────────────────
router.delete('/:id/roles/:roleId', checkPermission('users.manage'), (req, res) => {
  db.run('DELETE FROM user_roles WHERE user_id=? AND role_id=?', [req.params.id, req.params.roleId])
  res.json({ ok: true })
})

// ── GET all permissions ────────────────────────────────────────────────────
router.get('/permissions/all', (req, res) => {
  res.json(db.all('SELECT * FROM permissions ORDER BY module, name'))
})

// ── GET my permissions ────────────────────────────────────────────────────
router.get('/permissions/my', (req, res) => {
  if (req.user?.role === 'company_admin') {
    return res.json(db.all('SELECT name FROM permissions').map(p => p.name))
  }
  const perms = db.all(`
    SELECT DISTINCT p.name FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    JOIN user_roles ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = ?
  `, [req.user.id])
  res.json(perms.map(p => p.name))
})

module.exports = router
