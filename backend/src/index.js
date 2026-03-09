/**
 * DEER MES v3 — Multi-Tenant SaaS Backend
 * Architecture: Master DB (tenants) + Isolated Tenant DBs
 */
const express = require('express')
const cors = require('cors')
const path = require('path')
const rateLimit = require('express-rate-limit')

const app = express()
const PORT = process.env.PORT || 3000

// ── Global middleware ────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Global rate limiting (generous — per-route limits are stricter)
app.use('/api/', rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Previše zahtjeva. Pokušaj ponovo za minutu.' }
}))

// ── Auth + Tenant middleware imports ─────────────────────────────────────────
const { auth } = require('./middleware/auth')
const { tenantMiddleware } = require('./middleware/tenant')

// Combined middleware: auth → tenant resolve → attach req.db
const withTenant = [auth, tenantMiddleware]

// ── Public routes (no auth needed) ──────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'))
app.use('/api/superadmin',  require('./routes/superadmin'))

// ── Tenant-aware API routes ──────────────────────────────────────────────────
// Each route receives req.db = isolated tenant database
app.use('/api/users',         withTenant, require('./routes/users'))
app.use('/api/machines',      withTenant, require('./routes/machines'))
app.use('/api/maintenance',   withTenant, require('./routes/maintenance'))
app.use('/api/oee',           withTenant, require('./routes/oee'))
app.use('/api/production',    withTenant, require('./routes/production'))
app.use('/api/work-orders',   withTenant, require('./routes/work_orders'))
app.use('/api/quality',       withTenant, require('./routes/quality'))
app.use('/api/tools',         withTenant, require('./routes/tools'))
app.use('/api/tool-life',     withTenant, require('./routes/tool_life'))
app.use('/api/fixtures',      withTenant, require('./routes/fixtures'))
app.use('/api/warehouse',     withTenant, require('./routes/warehouse'))
app.use('/api/materials',     withTenant, require('./routes/materials'))
app.use('/api/clamping',      withTenant, require('./routes/clamping'))
app.use('/api/hr',            withTenant, require('./routes/hr'))
app.use('/api/dms',           withTenant, require('./routes/dms'))
app.use('/api/forms',         withTenant, require('./routes/forms'))
app.use('/api/tasks',         withTenant, require('./routes/tasks'))
app.use('/api/kalkulacije',   withTenant, require('./routes/kalkulacije'))
app.use('/api/kontroling',    withTenant, require('./routes/kontroling'))
app.use('/api/kpi',           withTenant, require('./routes/kpi'))
app.use('/api/locations',     withTenant, require('./routes/locations'))
app.use('/api/usage',         withTenant, require('./routes/usage'))
app.use('/api/dashboard',     withTenant, require('./routes/dashboard'))
app.use('/api/sales',         withTenant, require('./routes/sales'))
app.use('/api/ai',            withTenant, require('./routes/ai'))
app.use('/api/ollama',        require('./routes/ollama'))  // has own auth+tenant per route

// ── File uploads (DMS) ───────────────────────────────────────────────────────
const multer = require('multer')
const fs = require('fs')
const uploadDir = path.join(__dirname, '../data/uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantDir = path.join(uploadDir, req.user?.tenantSlug || 'default')
    if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true })
    cb(null, tenantDir)
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'))
})
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } })

app.post('/api/dms/upload', auth, tenantMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const db = req.db
  const { title, category, description, tags, expiry_date } = req.body
  const r = db.prepare(`INSERT INTO documents (title,category,version,status,file_path,file_type,file_size,description,tags,expiry_date,uploaded_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    title || req.file.originalname, category, '1.0', 'active',
    req.file.path, req.file.mimetype, req.file.size,
    description, tags, expiry_date || null, req.user.id
  )
  res.json(db.get('SELECT * FROM documents WHERE id=?', [r.lastInsertRowid]))
})

// ── Serve frontend ────────────────────────────────────────────────────────────
const distPath = path.join(__dirname, '../../frontend/dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', version: '3.0.0', mode: 'multi-tenant' }))

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message)
  res.status(500).json({ error: 'Interna greška servera' })
})

// ── Start server ──────────────────────────────────────────────────────────────
async function start() {
  try {
    // Init master DB first
    const masterDb = require('./db/master')
    await masterDb.init()
    console.log('✅ Master database initialized')

    app.listen(PORT, () => {
      console.log(`\n🦌 DEER MES v3 — Multi-Tenant SaaS`)
      console.log(`   Port: ${PORT}`)
      console.log(`   Mode: Multi-tenant (isolated DBs per tenant)`)
      console.log(`   Super Admin: POST /api/superadmin/login`)
      console.log(`   Tenant Login: POST /api/auth/login (requires tenantSlug)\n`)
    })
  } catch (e) {
    console.error('❌ Startup failed:', e.message)
    process.exit(1)
  }
}

start()
