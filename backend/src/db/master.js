/**
 * DEER MES — Master Database
 * Manages tenants, subscriptions, super-admin
 * Completely separate from tenant data
 */
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')

const DATA_DIR = path.join(__dirname, '../../data')
const MASTER_PATH = path.join(DATA_DIR, 'master.db')

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

let sqlDb = null
let SQL = null

function save() {
  if (!sqlDb) return
  fs.writeFileSync(MASTER_PATH, Buffer.from(sqlDb.export()))
}

function toObjects(result) {
  if (!result || !result.length) return []
  const { columns, values } = result[0]
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])))
}

function toObject(result) {
  return toObjects(result)[0]
}

const master = {
  prepare: (sql) => ({
    run(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
      sqlDb.run(sql, params)
      const res = sqlDb.exec('SELECT last_insert_rowid() as id')
      save()
      return { lastInsertRowid: res[0]?.values[0][0], changes: 1 }
    },
    get(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
      return toObject(sqlDb.exec(sql, params))
    },
    all(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
      return toObjects(sqlDb.exec(sql, params))
    }
  }),
  run(sql, params = []) { sqlDb.run(sql, params); save() },
  get(sql, params = []) { return toObject(sqlDb.exec(sql, params)) },
  all(sql, params = []) { return toObjects(sqlDb.exec(sql, params)) },
  exec(sql) { sqlDb.run(sql); save() },
}

async function init() {
  const initSqlJs = require('sql.js')
  SQL = await initSqlJs()

  if (fs.existsSync(MASTER_PATH)) {
    sqlDb = new SQL.Database(fs.readFileSync(MASTER_PATH))
  } else {
    sqlDb = new SQL.Database()
  }

  sqlDb.run(`CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    plan TEXT DEFAULT 'starter',
    active INTEGER DEFAULT 1,
    max_users INTEGER DEFAULT 10,
    max_machines INTEGER DEFAULT 20,
    db_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS super_admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER,
    tenant_slug TEXT,
    user_id INTEGER,
    username TEXT,
    action TEXT NOT NULL,
    entity TEXT,
    entity_id TEXT,
    old_value TEXT,
    new_value TEXT,
    ip TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS tenant_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'operator',
    token TEXT UNIQUE NOT NULL,
    used INTEGER DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  // Seed super admin if not exists
  const cnt = toObject(sqlDb.exec('SELECT COUNT(*) as c FROM super_admins'))?.c || 0
  if (cnt === 0) {
    const hash = bcrypt.hashSync('superadmin123', 10)
    sqlDb.run(
      `INSERT INTO super_admins (username, password_hash, email) VALUES (?,?,?)`,
      ['superadmin', hash, 'admin@deer-mes.com']
    )
    console.log('✅ Super admin created — superadmin/superadmin123')
  }

  save()
}

module.exports = { master, init }
