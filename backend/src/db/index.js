/**
 * DEER MES - Database module
 * Uses sql.js (pure JavaScript SQLite) - no compilation required
 * Works on Windows, Mac, Linux without Python/Visual C++
 */
const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, '../../data/deer.db')
const dataDir = path.dirname(DB_PATH)
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })

// Global sqljs instance and database
let sqlDb = null
let SQL = null

function saveToFile() {
  if (!sqlDb) return
  const data = sqlDb.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

// Convert sql.js result to array of objects
function toObjects(result) {
  if (!result || !result.length) return []
  const { columns, values } = result[0]
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])))
}

function toObject(result) {
  const rows = toObjects(result)
  return rows[0]
}

// Simple prepared statement wrapper
function makeStmt(sql) {
  return {
    run(...args) {
      // Flatten if called with array
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
      sqlDb.run(sql, params)
      const res = sqlDb.exec('SELECT last_insert_rowid() as id')
      const lastId = res[0]?.values[0][0]
      saveToFile()
      return { lastInsertRowid: lastId, changes: 1 }
    },
    get(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
      const res = sqlDb.exec(sql, params)
      return toObject(res)
    },
    all(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
      const res = sqlDb.exec(sql, params)
      return toObjects(res)
    }
  }
}

// Public DB interface (mirrors better-sqlite3 API)
const db = {
  prepare: (sql) => makeStmt(sql),
  run(sql, params = []) {
    sqlDb.run(sql, params)
    saveToFile()
  },
  get(sql, params = []) {
    const res = sqlDb.exec(sql, params)
    return toObject(res)
  },
  all(sql, params = []) {
    const res = sqlDb.exec(sql, params)
    return toObjects(res)
  },
  exec(sql) {
    sqlDb.run(sql)
    saveToFile()
  }
}

async function init() {
  const initSqlJs = require('sql.js')
  SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH)
    sqlDb = new SQL.Database(buf)
  } else {
    sqlDb = new SQL.Database()
  }

  // Create all tables
  sqlDb.run(`PRAGMA journal_mode = WAL`)
  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, first_name TEXT DEFAULT 'Admin',
      last_name TEXT DEFAULT '', email TEXT, role TEXT DEFAULT 'operator',
      active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, hall TEXT, rack TEXT, side TEXT,
      shelf TEXT, row_num TEXT, full_label TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id TEXT UNIQUE, name TEXT NOT NULL,
      manufacturer TEXT, type TEXT, table_size TEXT, max_load TEXT,
      location_id INTEGER, status TEXT DEFAULT 'idle', notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS fixtures (
      id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT UNIQUE, name TEXT NOT NULL,
      description TEXT, type TEXT DEFAULT 'manual', status TEXT DEFAULT 'active',
      material TEXT, weight REAL, dimensions TEXT, clamping_points INTEGER,
      max_force REAL, estimated_value REAL, location_id INTEGER,
      last_maintenance TEXT, next_maintenance TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS fixture_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fixture_id INTEGER NOT NULL,
      machine_id INTEGER, operator_id INTEGER, work_order TEXT,
      status TEXT DEFAULT 'in_machine', checked_out_at TEXT DEFAULT (datetime('now')),
      returned_at TEXT, notes TEXT
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, name TEXT NOT NULL,
      category TEXT, subcategory TEXT, current_quantity INTEGER DEFAULT 0,
      min_quantity INTEGER DEFAULT 0, unit TEXT DEFAULT 'kom',
      location TEXT, supplier TEXT, price REAL, status TEXT DEFAULT 'Dostupan',
      notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS tool_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tool_id INTEGER NOT NULL, action TEXT,
      quantity_before INTEGER, quantity_after INTEGER, quantity_change INTEGER,
      note TEXT, user_id INTEGER, user_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS clamping_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, name TEXT NOT NULL,
      type TEXT, current_quantity INTEGER DEFAULT 0, min_quantity INTEGER DEFAULT 0,
      location TEXT, status TEXT DEFAULT 'Dostupan', notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL,
      category TEXT, current_quantity REAL DEFAULT 0, min_quantity REAL DEFAULT 0,
      unit TEXT DEFAULT 'kg', location TEXT, supplier TEXT, price REAL,
      status TEXT DEFAULT 'Dostupan', notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT DEFAULT 'warning',
      message TEXT NOT NULL, is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT,
      action TEXT, entity_type TEXT, entity_id INTEGER, entity_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS sales_partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      type TEXT DEFAULT 'customer', oib TEXT, country TEXT DEFAULT 'Hrvatska',
      address TEXT, payment_terms INTEGER DEFAULT 30,
      contact_name TEXT, contact_email TEXT, contact_phone TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS sales_rfqs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, partner_id INTEGER,
      customer_rfq_id TEXT, status TEXT DEFAULT 'novo', deadline TEXT,
      notes TEXT, created_by INTEGER, created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS sales_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, internal_id TEXT, partner_id INTEGER,
      rfq_id INTEGER, customer_order_id TEXT, status TEXT DEFAULT 'nova',
      delivery_date TEXT, total_value REAL, notes TEXT, created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS sales_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_number TEXT, order_id INTEGER,
      partner_id INTEGER, amount REAL, vat_rate REAL DEFAULT 25, total_amount REAL,
      currency TEXT DEFAULT 'EUR', status TEXT DEFAULT 'nacrt',
      due_date TEXT, paid_at TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS quality_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, part_name TEXT,
      quantity INTEGER DEFAULT 0, good_qty INTEGER DEFAULT 0,
      rejected_qty INTEGER DEFAULT 0, inspector_id INTEGER,
      status TEXT DEFAULT 'na_cekanju', notes TEXT,
      checked_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS warehouse_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL,
      category TEXT, current_qty REAL DEFAULT 0, min_qty REAL DEFAULT 0,
      unit TEXT DEFAULT 'kom', location TEXT, supplier TEXT, unit_price REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS warehouse_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL,
      movement_type TEXT, quantity REAL, reference TEXT, user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, employee_code TEXT,
      first_name TEXT, last_name TEXT, department TEXT, position TEXT,
      employment_type TEXT DEFAULT 'full_time', start_date TEXT, end_date TEXT,
      active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER, date TEXT,
      check_in TEXT, check_out TEXT, status TEXT DEFAULT 'present', notes TEXT
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS leave_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER,
      leave_type TEXT DEFAULT 'annual', start_date TEXT, end_date TEXT,
      status TEXT DEFAULT 'pending', notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT,
      version TEXT DEFAULT '1.0', status TEXT DEFAULT 'draft',
      file_path TEXT, file_type TEXT, file_size INTEGER,
      description TEXT, tags TEXT, uploaded_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS form_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, form_type TEXT NOT NULL, title TEXT,
      status TEXT DEFAULT 'pending', priority TEXT DEFAULT 'normal',
      requested_by INTEGER, assigned_to INTEGER, data TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), resolved_at TEXT
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS maintenance_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id INTEGER,
      type TEXT DEFAULT 'preventive', priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'open', title TEXT, description TEXT,
      assigned_to INTEGER, scheduled_date TEXT, completed_at TEXT,
      downtime_minutes INTEGER, notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)
  sqlDb.run(`CREATE TABLE IF NOT EXISTS machine_telemetry (
      id INTEGER PRIMARY KEY AUTOINCREMENT, machine_id INTEGER,
      temperature REAL, spindle_speed REAL, feed_rate REAL,
      vibration REAL, power_kw REAL, status TEXT DEFAULT 'running',
      recorded_at TEXT DEFAULT (datetime('now'))
    )`)

  // ── MES v2 NEW TABLES ──────────────────────────────

  // Work Orders — production manufacturing orders
  sqlDb.run(`CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id TEXT UNIQUE NOT NULL,
      part_name TEXT NOT NULL,
      drawing_number TEXT,
      quantity INTEGER DEFAULT 1,
      quantity_done INTEGER DEFAULT 0,
      quantity_scrap INTEGER DEFAULT 0,
      machine_id INTEGER,
      operator_id INTEGER,
      sales_order_id INTEGER,
      kalkulacija_id INTEGER,
      status TEXT DEFAULT 'draft',
      priority TEXT DEFAULT 'normal',
      material TEXT,
      estimated_time_min INTEGER DEFAULT 0,
      actual_time_min INTEGER DEFAULT 0,
      setup_time_min INTEGER DEFAULT 0,
      cycle_time_sec REAL DEFAULT 0,
      planned_start TEXT,
      planned_end TEXT,
      actual_start TEXT,
      actual_end TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`)

  // Production Logs — time tracking per work order
  sqlDb.run(`CREATE TABLE IF NOT EXISTS production_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      machine_id INTEGER,
      operator_id INTEGER,
      event_type TEXT NOT NULL,
      event_time TEXT DEFAULT (datetime('now')),
      duration_min REAL DEFAULT 0,
      quantity_produced INTEGER DEFAULT 0,
      quantity_scrap INTEGER DEFAULT 0,
      notes TEXT
    )`)

  // Work Order Tool List — which tools are assigned to a work order
  sqlDb.run(`CREATE TABLE IF NOT EXISTS work_order_tools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      tool_id INTEGER NOT NULL,
      tool_position INTEGER DEFAULT 1,
      notes TEXT
    )`)

  // Tool Life Tracking — per-tool usage counter
  sqlDb.run(`CREATE TABLE IF NOT EXISTS tool_life (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_id INTEGER NOT NULL,
      work_order_id INTEGER,
      machine_id INTEGER,
      operator_id INTEGER,
      strokes_used INTEGER DEFAULT 0,
      minutes_used REAL DEFAULT 0,
      life_limit_strokes INTEGER DEFAULT 0,
      life_limit_minutes REAL DEFAULT 0,
      status TEXT DEFAULT 'ok',
      last_sharpened TEXT,
      next_service TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`)

  // Production Costs — per work order cost breakdown
  sqlDb.run(`CREATE TABLE IF NOT EXISTS production_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      cost_type TEXT NOT NULL,
      description TEXT,
      quantity REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      currency TEXT DEFAULT 'EUR',
      calculated_at TEXT DEFAULT (datetime('now'))
    )`)

  // OEE Records — daily machine efficiency snapshots
  sqlDb.run(`CREATE TABLE IF NOT EXISTS oee_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id INTEGER NOT NULL,
      record_date TEXT NOT NULL,
      shift TEXT DEFAULT 'A',
      planned_time_min INTEGER DEFAULT 480,
      downtime_min INTEGER DEFAULT 0,
      downtime_reason TEXT,
      parts_produced INTEGER DEFAULT 0,
      parts_target INTEGER DEFAULT 0,
      parts_good INTEGER DEFAULT 0,
      parts_scrap INTEGER DEFAULT 0,
      availability REAL DEFAULT 0,
      performance REAL DEFAULT 0,
      quality REAL DEFAULT 0,
      oee REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)

  // Production Schedule — planning board
  sqlDb.run(`CREATE TABLE IF NOT EXISTS production_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      machine_id INTEGER NOT NULL,
      scheduled_start TEXT NOT NULL,
      scheduled_end TEXT NOT NULL,
      actual_start TEXT,
      actual_end TEXT,
      status TEXT DEFAULT 'planned',
      priority INTEGER DEFAULT 50,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`)

  // ── END MES v2 TABLES ───────────────────────────────

  sqlDb.run(`CREATE TABLE IF NOT EXISTS kalkulacije (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      naziv TEXT NOT NULL,
      broj_nacrta TEXT,
      materijal TEXT,
      naziv_dijela TEXT,
      ident_nr TEXT,
      varijanta TEXT DEFAULT '50',
      data TEXT DEFAULT '{}',
      status TEXT DEFAULT 'draft',
      napomena TEXT,
      kreirao_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`)

  // Seed if empty
  const userCount = toObject(sqlDb.exec('SELECT COUNT(*) as c FROM users'))?.c || 0
  if (userCount === 0) {
    const bcrypt = require('bcryptjs')
    const adminHash = bcrypt.hashSync('admin123', 10)
    const opHash = bcrypt.hashSync('operator123', 10)
    sqlDb.run(`INSERT INTO users (username,password_hash,first_name,last_name,role) VALUES (?,?,?,?,?)`,
      ['admin', adminHash, 'Admin', 'Korisnik', 'company_admin'])
    sqlDb.run(`INSERT INTO users (username,password_hash,first_name,last_name,role) VALUES (?,?,?,?,?)`,
      ['operator', opHash, 'Ivan', 'Kovač', 'operator'])
    sqlDb.run(`INSERT INTO locations (hall,rack,full_label) VALUES (?,?,?)`, ['H1','R01','H1-R01'])
    sqlDb.run(`INSERT INTO locations (hall,rack,full_label) VALUES (?,?,?)`, ['H1','R02','H1-R02'])
    sqlDb.run(`INSERT INTO locations (hall,rack,full_label) VALUES (?,?,?)`, ['H2','R01','H2-R01'])
    sqlDb.run(`INSERT INTO machines (machine_id,name,manufacturer,type,status) VALUES (?,?,?,?,?)`,
      ['STR-001','DMU 50','DMG MORI','CNC 5-osni','running'])
    sqlDb.run(`INSERT INTO machines (machine_id,name,manufacturer,type,status) VALUES (?,?,?,?,?)`,
      ['STR-002','CTX beta 800','DMG MORI','CNC Tokarilica','idle'])
    sqlDb.run(`INSERT INTO machines (machine_id,name,manufacturer,type,status) VALUES (?,?,?,?,?)`,
      ['STR-003','Mazak INTEGREX','Mazak','CNC Multitasking','running'])
    sqlDb.run(`INSERT INTO fixtures (internal_id,name,type,status,estimated_value) VALUES (?,?,?,?,?)`,
      ['NP-001','Stezna naprava A1','hydraulic','active',2500])
    sqlDb.run(`INSERT INTO fixtures (internal_id,name,type,status,estimated_value) VALUES (?,?,?,?,?)`,
      ['NP-002','Naprava za tokarenje B2','pneumatic','in_production',1800])
    sqlDb.run(`INSERT INTO fixtures (internal_id,name,type,status,estimated_value) VALUES (?,?,?,?,?)`,
      ['NP-003','Modularna naprava C1','manual','active',900])
    sqlDb.run(`INSERT INTO tools (name,category,current_quantity,min_quantity,unit) VALUES (?,?,?,?,?)`,
      ['Glodalo Ø20 HSS','Glodala',4,4,'kom'])
    sqlDb.run(`INSERT INTO tools (name,category,current_quantity,min_quantity,unit,status) VALUES (?,?,?,?,?,?)`,
      ['Svrdlo Ø8 HSS-Co','Svrdla',6,8,'kom','Niske zalihe'])
    sqlDb.run(`INSERT INTO tools (name,category,current_quantity,min_quantity,unit) VALUES (?,?,?,?,?)`,
      ['Tokarni nož CNMG','Tokarni noževi',12,5,'kom'])
    sqlDb.run(`INSERT INTO sales_partners (name,type,country) VALUES (?,?,?)`,
      ['Livar d.o.o.','customer','Hrvatska'])
    sqlDb.run(`INSERT INTO sales_partners (name,type,country) VALUES (?,?,?)`,
      ['Đuro Đaković','customer','Hrvatska'])
    sqlDb.run(`INSERT INTO sales_partners (name,type,country) VALUES (?,?,?)`,
      ['Sandvik Coromant','supplier','Švedska'])
    sqlDb.run(`INSERT INTO alerts (type,message) VALUES (?,?)`,
      ['warning','Svrdlo Ø8 — niske zalihe: 6/8'])
    sqlDb.run(`INSERT INTO alerts (type,message) VALUES (?,?)`,
      ['info','Planirani preventivni servis za STR-001 za 3 dana'])
    sqlDb.run(`INSERT INTO employees (employee_code,first_name,last_name,department,position) VALUES (?,?,?,?,?)`,
      ['EMP-001','Ivan','Kovač','Produkcija','CNC operater'])
    sqlDb.run(`INSERT INTO employees (employee_code,first_name,last_name,department,position) VALUES (?,?,?,?,?)`,
      ['EMP-002','Marija','Horvat','Kvaliteta','QS inženjer'])
    sqlDb.run(`INSERT INTO warehouse_items (code,name,category,current_qty,min_qty,unit) VALUES (?,?,?,?,?,?)`,
      ['MAT-001','Aluminij EN AW-2024','Sirovine',150,50,'kg'])
    sqlDb.run(`INSERT INTO warehouse_items (code,name,category,current_qty,min_qty,unit) VALUES (?,?,?,?,?,?)`,
      ['MAT-002','Čelik 42CrMo4','Sirovine',80,100,'kg'])

    // MES v2 — Work Orders seed
    sqlDb.run(`INSERT INTO work_orders (work_order_id,part_name,drawing_number,quantity,machine_id,operator_id,status,priority,material,estimated_time_min,cycle_time_sec,planned_start,planned_end,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['WO-2025-001','Nosač osi X','DWG-100016',20,1,2,'in_progress','high','Nehrđajući čelik 1.4404',480,45.0,new Date().toISOString().split('T')[0],new Date(Date.now()+3*86400000).toISOString().split('T')[0],1])
    sqlDb.run(`INSERT INTO work_orders (work_order_id,part_name,drawing_number,quantity,machine_id,operator_id,status,priority,material,estimated_time_min,cycle_time_sec,planned_start,planned_end,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['WO-2025-002','Kućište pumpe','DWG-200048',5,2,2,'planned','normal','Aluminij EN AW-2024',720,360.0,new Date(Date.now()+2*86400000).toISOString().split('T')[0],new Date(Date.now()+7*86400000).toISOString().split('T')[0],1])
    sqlDb.run(`INSERT INTO work_orders (work_order_id,part_name,drawing_number,quantity,machine_id,operator_id,status,priority,material,estimated_time_min,cycle_time_sec,planned_start,planned_end,quantity_done,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ['WO-2025-003','Osovina B14','DWG-300012',50,3,2,'completed','normal','Čelik 42CrMo4',240,18.0,new Date(Date.now()-5*86400000).toISOString().split('T')[0],new Date(Date.now()-1*86400000).toISOString().split('T')[0],50,1])

    // MES v2 — Tool Life seed
    const toolIds = sqlDb.exec('SELECT id FROM tools LIMIT 3')
    if (toolIds[0]?.values?.length) {
      const [t1,t2,t3] = toolIds[0].values
      sqlDb.run(`INSERT INTO tool_life (tool_id,strokes_used,minutes_used,life_limit_strokes,life_limit_minutes,status) VALUES (?,?,?,?,?,?)`,
        [t1[0], 1240, 62, 2000, 100, 'ok'])
      sqlDb.run(`INSERT INTO tool_life (tool_id,strokes_used,minutes_used,life_limit_strokes,life_limit_minutes,status) VALUES (?,?,?,?,?,?)`,
        [t2[0], 1850, 92, 2000, 100, 'warning'])
      if (t3) sqlDb.run(`INSERT INTO tool_life (tool_id,strokes_used,minutes_used,life_limit_strokes,life_limit_minutes,status) VALUES (?,?,?,?,?,?)`,
        [t3[0], 320, 16, 2000, 100, 'ok'])
    }

    // MES v2 — OEE records seed (last 7 days)
    const machineIds = sqlDb.exec('SELECT id FROM machines LIMIT 3')
    if (machineIds[0]?.values?.length) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(Date.now() - i*86400000).toISOString().split('T')[0]
        machineIds[0].values.forEach(([mid]) => {
          const avail = 0.82 + Math.random()*0.15
          const perf  = 0.75 + Math.random()*0.20
          const qual  = 0.93 + Math.random()*0.06
          const oee   = avail*perf*qual
          const pp    = Math.round(480 * perf * (avail))
          sqlDb.run(`INSERT INTO oee_records (machine_id,record_date,shift,planned_time_min,downtime_min,parts_produced,parts_target,parts_good,parts_scrap,availability,performance,quality,oee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [mid,d,'A',480,Math.round((1-avail)*480),pp,Math.round(480*perf),Math.round(pp*qual),Math.round(pp*(1-qual)),
             Math.round(avail*100)/100,Math.round(perf*100)/100,Math.round(qual*100)/100,Math.round(oee*100)/100])
        })
      }
    }

    saveToFile()
    console.log('✅ Demo data seeded — admin/admin123, operator/operator123')
  } else {
    console.log('✅ Database loaded')
  }

  return db
}

db.init = init
module.exports = db
