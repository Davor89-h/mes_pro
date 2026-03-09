/**
 * DEER MES — Ollama Integration
 * Private local LLM — no data ever leaves the system
 * Falls back to existing local AI if Ollama is unavailable
 * 
 * Railway: deploy Ollama as separate service
 * OLLAMA_URL=http://ollama.railway.internal:11434
 * OLLAMA_MODEL=llama3.2:3b  (or mistral, phi3, etc.)
 */
const router = require('express').Router()
const { auth } = require('../middleware/auth')
const { tenantMiddleware } = require('../middleware/tenant')

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434'
const OLLAMA_MODEL = process.env.OLLAMA_MODEL  || 'llama3.2:3b'
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000') // 2min default

// Check if Ollama is reachable
async function ollamaHealth() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return false
    const data = await res.json()
    const models = data.models?.map(m => m.name) || []
    return { ok: true, models }
  } catch {
    return false
  }
}

// Call Ollama generate endpoint (non-streaming)
async function ollamaGenerate(prompt, systemPrompt = '') {
  const body = {
    model: OLLAMA_MODEL,
    prompt,
    system: systemPrompt,
    stream: false,
    options: {
      temperature: 0.3,     // lower = more factual
      num_predict: 800,     // max tokens in response
    }
  }

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  })

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`)
  const data = await res.json()
  return data.response || ''
}

// Call Ollama chat endpoint (supports history)
async function ollamaChat(messages, systemPrompt = '') {
  const body = {
    model: OLLAMA_MODEL,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages,
    ],
    stream: false,
    options: { temperature: 0.3, num_predict: 800 }
  }

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  })

  if (!res.ok) throw new Error(`Ollama chat error: ${res.status}`)
  const data = await res.json()
  return data.message?.content || ''
}

// GET /api/ollama/health — check Ollama status
router.get('/health', auth, async (req, res) => {
  try {
    const health = await ollamaHealth()
    res.json({
      available: !!health,
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      models: health?.models || [],
    })
  } catch (e) {
    res.json({ available: false, error: e.message })
  }
})

// POST /api/ollama/chat — chat with Ollama using tenant data as context
router.post('/chat', auth, tenantMiddleware, async (req, res) => {
  const { message, history = [] } = req.body
  if (!message) return res.status(400).json({ error: 'Poruka je obavezna' })

  const db = req.db
  const tenantName = req.tenant?.name || 'tvrtka'

  try {
    // Build context from tenant's live data
    const ctx = buildContext(db)

    const systemPrompt = `Ti si privatni AI asistent za ${tenantName} MES sustav.
Govoriš isključivo na hrvatskom jeziku. Odgovaraš kratko, precizno i korisno.
SVE podatke crpiš isključivo iz internih podataka koji su ti dani.
Nikada ne izmišljaš podatke. Ako nešto ne znaš, kažeš to jasno.

INTERNI PODACI SUSTAVA (${new Date().toLocaleDateString('hr-HR')}):
Strojevi: ${ctx.machines_summary}
Alati kritični: ${ctx.tools_critical_summary}
Radni nalozi otvoreni: ${ctx.wo_summary}
Naprave servis: ${ctx.fixtures_summary}
OEE (30d prosj.): ${ctx.oee_summary}
Nalozi održavanja: ${ctx.maintenance_summary}
Zadaci otvoreni: ${ctx.tasks_summary}
Dokumenti koji ističu: ${ctx.docs_summary}`

    const ollamaMsgs = [
      ...history.slice(-8).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message }
    ]

    const reply = await ollamaChat(ollamaMsgs, systemPrompt)

    res.json({
      reply,
      engine: 'ollama',
      model: OLLAMA_MODEL,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    // Fallback to rule-based if Ollama fails
    console.warn('Ollama chat failed, using local AI:', e.message)
    res.status(503).json({
      error: 'Ollama nije dostupan',
      detail: e.message,
      fallback_hint: 'Koristi /api/ai/chat za lokalni AI bez Ollame',
    })
  }
})

// POST /api/ollama/analyze — analyze specific topic with Ollama
router.post('/analyze', auth, tenantMiddleware, async (req, res) => {
  const { topic, data } = req.body
  if (!topic) return res.status(400).json({ error: 'Topic is required' })

  const db = req.db
  const tenantName = req.tenant?.name || 'tvrtka'

  try {
    let contextData = data || buildContext(db)

    const prompt = `Analiziraj sljedeće podatke za ${tenantName} i daj konkretne preporuke za poboljšanje.
Tema: ${topic}

Podaci:
${typeof contextData === 'string' ? contextData : JSON.stringify(contextData, null, 2)}

Odgovori na hrvatskom jeziku. Budi konkretan, nabroji 3-5 ključnih uvida i preporuka.`

    const analysis = await ollamaGenerate(prompt)

    res.json({
      topic,
      analysis,
      engine: 'ollama',
      model: OLLAMA_MODEL,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    res.status(503).json({ error: 'Ollama nije dostupan', detail: e.message })
  }
})

// POST /api/ollama/report — generate production report
router.post('/report', auth, tenantMiddleware, async (req, res) => {
  const { period = 'today', type = 'production' } = req.body
  const db = req.db
  const tenantName = req.tenant?.name || 'tvrtka'

  try {
    const ctx = buildContext(db)

    const prompt = `Generiraj ${type} izvještaj za ${tenantName} za period: ${period}.

Interni podaci:
- Strojevi: ${ctx.machines_summary}
- Radni nalozi: ${ctx.wo_summary}
- OEE: ${ctx.oee_summary}
- Alati: ${ctx.tools_critical_summary}
- Nalozi kasne: ${ctx.overdue_summary}

Format: strukturirani izvještaj s naslovom, sažetkom, ključnim metrikama i preporukama.
Jezik: Hrvatski. Budi profesionalan i konkretan.`

    const report = await ollamaGenerate(prompt)

    res.json({
      period,
      type,
      report,
      engine: 'ollama',
      model: OLLAMA_MODEL,
      generated_at: new Date().toISOString(),
    })
  } catch (e) {
    res.status(503).json({ error: 'Ollama nije dostupan', detail: e.message })
  }
})

// GET /api/ollama/models — list available models
router.get('/models', auth, async (req, res) => {
  try {
    const health = await ollamaHealth()
    if (!health) return res.json({ models: [], available: false })
    res.json({ models: health.models, current: OLLAMA_MODEL, available: true })
  } catch (e) {
    res.status(503).json({ error: e.message })
  }
})

// ── Context builder (reads from tenant DB) ──────────────────────────────────
function buildContext(db) {
  const safe = (fn) => { try { return fn() } catch { return null } }

  const machines   = safe(() => db.all('SELECT name,status FROM machines'))                        || []
  const tools_zero = safe(() => db.all('SELECT name FROM tools WHERE current_quantity=0'))         || []
  const tools_low  = safe(() => db.all('SELECT name FROM tools WHERE current_quantity>0 AND current_quantity<=min_quantity')) || []
  const wo_open    = safe(() => db.all("SELECT work_order_id,part_name,priority,planned_end FROM work_orders WHERE status NOT IN ('completed','closed','cancelled') ORDER BY planned_end LIMIT 10")) || []
  const wo_overdue = safe(() => db.all("SELECT work_order_id,part_name FROM work_orders WHERE planned_end < date('now') AND status NOT IN ('completed','closed','cancelled')")) || []
  const fix_over   = safe(() => db.all("SELECT name FROM fixtures WHERE next_maintenance < date('now')")) || []
  const oee_avg    = safe(() => db.get("SELECT ROUND(AVG(oee),1) as avg FROM oee_records WHERE record_date >= date('now','-30 days')")) || {}
  const maint_open = safe(() => db.all("SELECT title,priority FROM maintenance_orders WHERE status!='completed' ORDER BY CASE priority WHEN 'urgent' THEN 1 ELSE 2 END LIMIT 5")) || []
  const tasks_open = safe(() => db.get("SELECT COUNT(*) as c FROM tasks WHERE status NOT IN ('completed','cancelled')"))?.c || 0
  const docs_exp   = safe(() => db.all("SELECT title FROM documents WHERE expiry_date IS NOT NULL AND expiry_date <= date('now','+30 days') AND expiry_date >= date('now')")) || []

  return {
    machines_summary:        `${machines.filter(m=>m.status==='running').length}/${machines.length} rade${machines.filter(m=>m.status==='fault').length > 0 ? `, ${machines.filter(m=>m.status==='fault').length} kvar` : ''}`,
    tools_critical_summary:  tools_zero.length > 0 ? `${tools_zero.length} bez zalihe (${tools_zero.map(t=>t.name).join(', ')})` : `${tools_low.length} ispod minimuma`,
    wo_summary:              `${wo_open.length} otvorenih${wo_overdue.length > 0 ? `, ${wo_overdue.length} kasni` : ''}`,
    fixtures_summary:        fix_over.length > 0 ? `${fix_over.length} prekoračen servis: ${fix_over.map(f=>f.name).join(', ')}` : 'svi uredni',
    oee_summary:             oee_avg?.avg ? `${oee_avg.avg}% flota` : 'nema podataka',
    maintenance_summary:     maint_open.length > 0 ? maint_open.map(m=>`${m.title}(${m.priority})`).join(', ') : 'nema otvorenih',
    tasks_summary:           `${tasks_open} otvorenih`,
    docs_summary:            docs_exp.length > 0 ? docs_exp.map(d=>d.title).join(', ') : 'nema isteklih',
    overdue_summary:         wo_overdue.length > 0 ? wo_overdue.map(w=>w.work_order_id).join(', ') : 'nema',
  }
}

module.exports = router
module.exports.ollamaHealth = ollamaHealth
