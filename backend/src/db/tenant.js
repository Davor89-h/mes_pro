/**
 * DEER MES — Tenant Database Manager
 * Each tenant gets their own isolated SQLite database
 * Mirrors the full schema from db/index.js but per-tenant
 */
const fs = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')

const DATA_DIR = path.join(__dirname, '../../data/tenants')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

// Cache of open tenant databases
const tenantDbs = new Map()

let SQL = null

async function getSQL() {
  if (!SQL) {
    const initSqlJs = require('sql.js')
    SQL = await initSqlJs()
  }
  return SQL
}

function toObjects(result) {
  if (!result || !result.length) return []
  const { columns, values } = result[0]
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])))
}
function toObject(r) { return toObjects(r)[0] }

function makeTenantDb(sqlDb, dbPath) {
  const save = () => {
    if (!sqlDb) return
    fs.writeFileSync(dbPath, Buffer.from(sqlDb.export()))
  }

  return {
    _sqlDb: sqlDb,
    _path: dbPath,
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
    save,
  }
}

async function getTenantDb(slug) {
  if (tenantDbs.has(slug)) return tenantDbs.get(slug)

  const sql = await getSQL()
  const dbPath = path.join(DATA_DIR, `${slug}.db`)

  let sqlDb
  if (fs.existsSync(dbPath)) {
    sqlDb = new sql.Database(fs.readFileSync(dbPath))
  } else {
    sqlDb = new sql.Database()
    await initTenantSchema(sqlDb, dbPath)
  }

  const db = makeTenantDb(sqlDb, dbPath)
  tenantDbs.set(slug, db)
  return db
}

async function createTenantDb(slug, adminUsername, adminPassword, companyName) {
  const sql = await getSQL()
  const dbPath = path.join(DATA_DIR, `${slug}.db`)

  if (fs.existsSync(dbPath)) {
    throw new Error(`Tenant database already exists: ${slug}`)
  }

  const sqlDb = new sql.Database()
  await initTenantSchema(sqlDb, dbPath)
  const db = makeTenantDb(sqlDb, dbPath)
  tenantDbs.set(slug, db)

  // Seed admin user for this tenant
  const hash = bcrypt.hashSync(adminPassword, 10)
  db.prepare(`INSERT INTO users (username,password_hash,first_name,last_name,role,email)
    VALUES (?,?,?,?,?,?)`).run(
    adminUsername, hash, 'Admin', companyName, 'company_admin', ''
  )

  // Seed default roles
  seedRoles(db)

  console.log(`✅ Tenant DB created: ${slug}`)
  return dbPath
}

function seedRoles(db) {
  const roles = [
    ['admin', 'Administrator', 'Full access'],
    ['manager', 'Voditelj', 'Management access'],
    ['operator', 'Operater', 'Production floor access'],
    ['maintenance', 'Održavanje', 'Maintenance access'],
    ['quality', 'Kvaliteta', 'Quality access'],
    ['warehouse', 'Skladište', 'Warehouse access'],
  ]
  roles.forEach(([name, label, desc]) => {
    db.prepare('INSERT OR IGNORE INTO roles (name,label,description) VALUES (?,?,?)').run(name, label, desc)
  })

  const permissions = [
    ['production.view','production'],['production.edit','production'],
    ['machines.view','machines'],['machines.edit','machines'],
    ['maintenance.view','maintenance'],['maintenance.edit','maintenance'],
    ['quality.view','quality'],['quality.edit','quality'],
    ['inventory.view','inventory'],['inventory.edit','inventory'],
    ['tasks.view','tasks'],['tasks.write','tasks'],['tasks.assign','tasks'],
    ['users.manage','users'],['reports.view','reports'],
    ['dms.view','dms'],['dms.edit','dms'],
    ['sales.view','sales'],['kontroling.view','kontroling'],
  ]
  permissions.forEach(([name, module]) => {
    db.prepare('INSERT OR IGNORE INTO permissions (name,module) VALUES (?,?)').run(name, module)
  })
}

async function initTenantSchema(sqlDb, dbPath) {
  sqlDb.run(`PRAGMA journal_mode = WAL`)

  // ── Core tables (same as existing db/index.js) ──────────────────────────
  sqlDb.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, first_name TEXT DEFAULT 'Admin',
    last_name TEXT DEFAULT '', email TEXT, role TEXT DEFAULT 'operator',
    department TEXT, active INTEGER DEFAULT 1,
    last_login TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, hall TEXT, rack TEXT, side TEXT,
    shelf TEXT, row_num TEXT, full_label TEXT UNIQUE, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id TEXT UNIQUE, name TEXT NOT NULL,
    manufacturer TEXT, type TEXT, table_size TEXT, max_load TEXT,
    location_id INTEGER, status TEXT DEFAULT 'idle', notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS fixtures (
    id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT UNIQUE, name TEXT NOT NULL,
    description TEXT, type TEXT, status TEXT DEFAULT 'available',
    material TEXT, weight REAL, dimensions TEXT, clamping_points INTEGER,
    max_force REAL, estimated_value REAL, location_id INTEGER,
    last_maintenance TEXT, next_maintenance TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, name TEXT NOT NULL,
    category TEXT, subcategory TEXT, current_quantity REAL DEFAULT 0,
    min_quantity REAL DEFAULT 0, unit TEXT DEFAULT 'kom',
    location TEXT, supplier TEXT, price REAL DEFAULT 0,
    status TEXT DEFAULT 'dostupan', notes TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS tool_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tool_id INTEGER, action TEXT,
    quantity_before REAL, quantity_after REAL, quantity_change REAL,
    note TEXT, user_id INTEGER, user_name TEXT,
    recorded_at TEXT DEFAULT (datetime('now')), created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS clamping_devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, name TEXT NOT NULL,
    type TEXT, current_quantity REAL DEFAULT 0, min_quantity REAL DEFAULT 0,
    location TEXT, status TEXT DEFAULT 'available', notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL,
    category TEXT, current_quantity REAL DEFAULT 0, min_quantity REAL DEFAULT 0,
    unit TEXT DEFAULT 'kom', location TEXT, supplier TEXT,
    price REAL DEFAULT 0, status TEXT DEFAULT 'aktivan', notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, message TEXT,
    is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT,
    action TEXT, entity_type TEXT, entity_id INTEGER, entity_name TEXT,
    old_value TEXT, new_value TEXT, ip TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS sales_partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    type TEXT DEFAULT 'customer', oib TEXT, country TEXT DEFAULT 'HR',
    address TEXT, payment_terms INTEGER DEFAULT 30,
    contact_name TEXT, contact_email TEXT, contact_phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS sales_rfqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT,
    partner_id INTEGER, customer_rfq_id TEXT, status TEXT DEFAULT 'novi',
    deadline TEXT, notes TEXT, created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS sales_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT,
    partner_id INTEGER, rfq_id INTEGER, customer_order_id TEXT,
    status TEXT DEFAULT 'potvrđena', delivery_date TEXT,
    total_value REAL DEFAULT 0, notes TEXT, name TEXT, quantity INTEGER,
    created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS sales_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT,
    order_id INTEGER, partner_id INTEGER, amount REAL, vat_rate REAL DEFAULT 25,
    total_amount REAL, currency TEXT DEFAULT 'EUR', status TEXT DEFAULT 'izdana',
    due_date TEXT, paid_at TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS quality_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, part_name TEXT,
    quantity INTEGER, good_qty INTEGER, rejected_qty INTEGER,
    inspector_id INTEGER, status TEXT DEFAULT 'na_čekanju', notes TEXT,
    checked_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS quality_inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, work_order_ref TEXT, project_name TEXT,
    type TEXT DEFAULT 'završna', inspector_id INTEGER, protocol_id INTEGER,
    result TEXT DEFAULT 'na_čekanju', notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS quality_protocols (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    version TEXT DEFAULT '1.0', project_name TEXT, measure_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'aktivan', created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS quality_instruments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT,
    serial_number TEXT, manufacturer TEXT, storage_location TEXT,
    last_calibration TEXT, next_calibration TEXT, status TEXT DEFAULT 'aktivan',
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS warehouse_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL,
    category TEXT, current_qty REAL DEFAULT 0, min_qty REAL DEFAULT 0,
    unit TEXT DEFAULT 'kom', location TEXT, supplier TEXT,
    unit_price REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS warehouse_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, movement_type TEXT,
    quantity REAL, reference TEXT, user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS wh_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, name TEXT NOT NULL,
    type TEXT DEFAULT 'raw', unit TEXT DEFAULT 'kom', min_stock REAL DEFAULT 0,
    supplier TEXT, storage_location TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS wh_warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    type TEXT DEFAULT 'main', location TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS wh_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, material_id INTEGER,
    warehouse_id INTEGER, supplier_id INTEGER,
    quantity REAL DEFAULT 0, mass_kg REAL,
    internal_batch TEXT, external_batch TEXT,
    status TEXT DEFAULT 'slobodan', received_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
    employee_code TEXT, first_name TEXT, last_name TEXT,
    department TEXT, position TEXT, employment_type TEXT DEFAULT 'full_time',
    start_date TEXT, end_date TEXT, active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER,
    date TEXT, check_in TEXT, check_out TEXT, status TEXT, notes TEXT
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER,
    leave_type TEXT, start_date TEXT, end_date TEXT,
    status TEXT DEFAULT 'pending', notes TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
    category TEXT, version TEXT DEFAULT '1.0', status TEXT DEFAULT 'draft',
    file_path TEXT, file_type TEXT, file_size INTEGER,
    description TEXT, tags TEXT, uploaded_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')), expiry_date TEXT
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS form_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, form_type TEXT, title TEXT,
    description TEXT, status TEXT DEFAULT 'draft', priority TEXT DEFAULT 'normal',
    requested_by INTEGER, assigned_to INTEGER, review_notes TEXT,
    data TEXT, notes TEXT, submitted_at TEXT, resolved_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS maintenance_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id INTEGER,
    type TEXT DEFAULT 'preventive', priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'open', title TEXT, description TEXT,
    assigned_to INTEGER, scheduled_date TEXT, completed_at TEXT,
    downtime_minutes INTEGER, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS machine_telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id INTEGER,
    temperature REAL, spindle_speed INTEGER, feed_rate REAL,
    vibration REAL, power_kw REAL, status TEXT,
    recorded_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS work_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, work_order_id TEXT UNIQUE,
    part_name TEXT NOT NULL, drawing_number TEXT, quantity INTEGER DEFAULT 1,
    quantity_done INTEGER DEFAULT 0, quantity_scrap INTEGER DEFAULT 0,
    machine_id INTEGER, operator_id INTEGER, sales_order_id INTEGER, kalkulacija_id INTEGER,
    status TEXT DEFAULT 'planned', priority TEXT DEFAULT 'normal',
    material TEXT, estimated_time_min INTEGER, actual_time_min INTEGER,
    setup_time_min INTEGER, cycle_time_sec REAL,
    planned_start TEXT, planned_end TEXT, actual_start TEXT, actual_end TEXT,
    notes TEXT, created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS production_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, work_order_id INTEGER, machine_id INTEGER,
    operator_id INTEGER, event_type TEXT, event_time TEXT,
    duration_min INTEGER, quantity_produced INTEGER, quantity_scrap INTEGER, notes TEXT
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS work_order_tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT, work_order_id INTEGER,
    tool_id INTEGER, tool_position TEXT, notes TEXT
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS tool_life (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tool_id INTEGER, work_order_id INTEGER,
    machine_id INTEGER, operator_id INTEGER, strokes_used INTEGER DEFAULT 0,
    minutes_used INTEGER DEFAULT 0, life_limit_strokes INTEGER,
    life_limit_minutes INTEGER, status TEXT DEFAULT 'ok',
    last_sharpened TEXT, next_service TEXT, notes TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS production_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, work_order_id INTEGER, cost_type TEXT,
    description TEXT, quantity REAL, unit_cost REAL, total_cost REAL,
    currency TEXT DEFAULT 'EUR', calculated_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS oee_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id INTEGER NOT NULL,
    record_date TEXT NOT NULL, shift TEXT DEFAULT 'morning',
    planned_time_min INTEGER, downtime_min INTEGER DEFAULT 0,
    downtime_reason TEXT, parts_produced INTEGER DEFAULT 0,
    parts_target INTEGER, parts_good INTEGER DEFAULT 0, parts_scrap INTEGER DEFAULT 0,
    availability REAL, performance REAL, quality REAL, oee REAL,
    notes TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS production_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT, work_order_id INTEGER, machine_id INTEGER,
    scheduled_start TEXT, scheduled_end TEXT, actual_start TEXT, actual_end TEXT,
    status TEXT DEFAULT 'planned', priority INTEGER DEFAULT 5, notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS kalkulacije (
    id INTEGER PRIMARY KEY AUTOINCREMENT, naziv TEXT, broj_nacrta TEXT,
    materijal TEXT, naziv_dijela TEXT, ident_nr TEXT, varijanta TEXT,
    data TEXT, status TEXT DEFAULT 'draft', napomena TEXT,
    kreirao_id INTEGER, created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL,
    label TEXT, description TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL,
    module TEXT, description TEXT
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, role_id INTEGER, permission_id INTEGER,
    UNIQUE(role_id, permission_id)
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS user_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, role_id INTEGER,
    granted_by INTEGER, granted_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, role_id)
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
    description TEXT, assigned_to INTEGER, assigned_by INTEGER,
    priority TEXT DEFAULT 'normal', status TEXT DEFAULT 'open',
    module TEXT, due_date TEXT, completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS task_checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, label TEXT,
    completed INTEGER DEFAULT 0, completed_at TEXT, completed_by INTEGER,
    sort_order INTEGER DEFAULT 0
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS task_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, user_id INTEGER,
    comment TEXT, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS kontroling_budzet (
    id INTEGER PRIMARY KEY AUTOINCREMENT, godina INTEGER, mjesec INTEGER,
    kategorija TEXT, opis TEXT, iznos_plan REAL DEFAULT 0, iznos_stvarni REAL DEFAULT 0,
    napomena TEXT, kreirao_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS kontroling_masinski_sat (
    id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id INTEGER,
    trosak_amortizacija REAL, trosak_struja REAL, trosak_odrzavanje REAL,
    trosak_ostalo REAL, trosak_ukupno_sat REAL, vrijedi_od TEXT,
    napomena TEXT, kreirao_id INTEGER, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS kontroling_nalog_troskovi (
    id INTEGER PRIMARY KEY AUTOINCREMENT, work_order_id INTEGER,
    kategorija TEXT, opis TEXT, kolicina REAL, jedinicna_cijena REAL,
    ukupno REAL, napomena TEXT, kreirao_id INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS kontroling_profitabilnost (
    id INTEGER PRIMARY KEY AUTOINCREMENT, partner_id INTEGER, proizvod TEXT,
    period_god INTEGER, period_mj INTEGER, prihod REAL DEFAULT 0,
    trosak_materijal REAL DEFAULT 0, trosak_rad REAL DEFAULT 0,
    trosak_rezija REAL DEFAULT 0, ukupni_trosak REAL DEFAULT 0,
    bruto_dobit REAL DEFAULT 0, marza_posto REAL DEFAULT 0,
    napomena TEXT, kreirao_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS tool_calibrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tool_id INTEGER, calibration_date TEXT,
    next_date TEXT, performed_by TEXT, result TEXT DEFAULT 'ok', notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS tool_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tool_id INTEGER, order_id TEXT,
    quantity_used REAL DEFAULT 1, operation TEXT, notes TEXT,
    used_by INTEGER, used_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS tool_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tool_id INTEGER, tool_name TEXT,
    quantity INTEGER DEFAULT 1, supplier TEXT, status TEXT DEFAULT 'naručeno',
    notes TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
  )`)

  sqlDb.run(`CREATE TABLE IF NOT EXISTS fixture_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT, fixture_id INTEGER, machine_id INTEGER,
    operator_id INTEGER, work_order TEXT, status TEXT DEFAULT 'checked_out',
    checked_out_at TEXT DEFAULT (datetime('now')), returned_at TEXT, notes TEXT
  )`)

  // Seed one default warehouse
  const wh = toObject(sqlDb.exec('SELECT COUNT(*) as c FROM wh_warehouses'))
  if (!wh?.c) {
    sqlDb.run(`INSERT INTO wh_warehouses (name,type,location) VALUES ('Glavno skladište','main','Hala A')`)
  }

  fs.writeFileSync(dbPath, Buffer.from(sqlDb.export()))
}

function evictTenantDb(slug) {
  tenantDbs.delete(slug)
}

module.exports = { getTenantDb, createTenantDb, evictTenantDb }
