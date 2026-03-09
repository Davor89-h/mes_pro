import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  TrendingUp, TrendingDown, DollarSign, BarChart2, PieChart,
  Plus, Edit2, Trash2, X, Save, Download, RefreshCw,
  Target, Activity, Cpu, FileText, ChevronDown, ChevronUp
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart as RPieChart, Pie, Cell
} from 'recharts'
import api from '../utils/api'

const EUR = v => `€ ${(v || 0).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const PCT = v => `${(v || 0).toFixed(1)} %`
const MJ = ['', 'Sij', 'Velj', 'Ožu', 'Tra', 'Svi', 'Lip', 'Srp', 'Kol', 'Ruj', 'Lis', 'Stu', 'Pro']
const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6']

const BUDZET_KAT = ['Materijal', 'Rad', 'Režija', 'Stroj', 'Alati', 'Transport', 'Ostalo']
const NALOG_KAT = ['Materijal', 'Strojni sat', 'Rad operatera', 'Alati', 'Kooperacija', 'Ostalo']

function KPICard({ label, value, sub, color = 'indigo', icon: Icon, trend }) {
  const colors = {
    indigo: 'bg-indigo-900/40 border-indigo-700 text-indigo-300',
    green: 'bg-green-900/40 border-green-700 text-green-300',
    yellow: 'bg-yellow-900/40 border-yellow-700 text-yellow-300',
    red: 'bg-red-900/40 border-red-700 text-red-300',
    blue: 'bg-blue-900/40 border-blue-700 text-blue-300',
  }
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</span>
        {Icon && <Icon size={16} className="opacity-60" />}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60">{sub}</div>}
      {trend !== undefined && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend >= 0 ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}
          {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X size={20}/></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Input({ label, type = 'text', value, onChange, options }) {
  const cls = "w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
  return (
    <div className="flex flex-col gap-1">
      <label className="text-gray-400 text-xs font-medium">{label}</label>
      {options ? (
        <select className={cls} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">— odaberi —</option>
          {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
        </select>
      ) : (
        <input type={type} className={cls} value={value} onChange={e => onChange(e.target.value)} />
      )}
    </div>
  )
}

// ─── TAB: PREGLED ──────────────────────────────────────────────────────────
function TabPregled({ godina }) {
  const [summary, setSummary] = useState(null)
  const [trend, setTrend] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [s, t] = await Promise.all([
      api.get(`/kontroling/summary?godina=${godina}`),
      api.get(`/kontroling/trend?godina=${godina}`)
    ])
    setSummary(s.data)
    setTrend(t.data.map(r => ({ ...r, mj: MJ[r.mj] || r.mj })))
    setLoading(false)
  }, [godina])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-gray-400 p-8 text-center">Učitavanje...</div>
  if (!summary) return null

  const { kpi, budzet, strojniSat } = summary

  const budzetChart = budzet.map(b => ({
    name: b.kategorija,
    Plan: +(b.plan || 0).toFixed(2),
    Stvarni: +(b.stvarni || 0).toFixed(2),
  }))

  const strojPie = strojniSat.filter(s => s.trosak_ukupno_sat > 0).slice(0, 6).map((s, i) => ({
    name: s.name || `Stroj ${i+1}`,
    value: +(s.trosak_ukupno_sat || 0).toFixed(2),
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Prihod" value={EUR(kpi.prihod)} icon={DollarSign} color="green"/>
        <KPICard label="Bruto dobit" value={EUR(kpi.dobit)} icon={TrendingUp} color={kpi.dobit >= 0 ? 'green' : 'red'}/>
        <KPICard label="Avg. marža" value={PCT(kpi.avgMarza)} icon={Activity} color={kpi.avgMarza >= 20 ? 'green' : kpi.avgMarza >= 10 ? 'yellow' : 'red'}/>
        <KPICard label="Varijanca bud." value={EUR(kpi.varijanca)} sub={`Plan: ${EUR(kpi.totalPlan)}`} icon={Target} color={kpi.varijanca >= 0 ? 'green' : 'red'}/>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Trend prihoda */}
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <div className="text-white font-semibold mb-3 text-sm">Trend prihoda / troška / dobiti ({godina})</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
              <XAxis dataKey="mj" tick={{ fill: '#9ca3af', fontSize: 11 }}/>
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }}/>
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}/>
              <Legend/>
              <Line type="monotone" dataKey="prihod" stroke="#22c55e" strokeWidth={2} dot={false} name="Prihod"/>
              <Line type="monotone" dataKey="trosak" stroke="#ef4444" strokeWidth={2} dot={false} name="Trošak"/>
              <Line type="monotone" dataKey="dobit" stroke="#6366f1" strokeWidth={2} dot={false} name="Dobit"/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Budžet vs stvarni */}
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <div className="text-white font-semibold mb-3 text-sm">Budžet vs. Stvarni troškovi po kategoriji</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={budzetChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }}/>
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }}/>
              <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}/>
              <Legend/>
              <Bar dataKey="Plan" fill="#6366f1" radius={[4,4,0,0]}/>
              <Bar dataKey="Stvarni" fill="#22c55e" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Strojni sat pie */}
      {strojPie.length > 0 && (
        <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
          <div className="text-white font-semibold mb-3 text-sm">Trošak/sat po stroju (€)</div>
          <div className="flex items-center gap-6">
            <ResponsiveContainer width="40%" height={180}>
              <RPieChart>
                <Pie data={strojPie} cx="50%" cy="50%" outerRadius={70} dataKey="value" nameKey="name">
                  {strojPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}/>
              </RPieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {strojPie.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }}/>
                  <span className="text-gray-300">{s.name}</span>
                  <span className="text-white font-semibold ml-auto pl-4">{EUR(s.value)}/h</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── TAB: BUDŽET ──────────────────────────────────────────────────────────
function TabBudzet({ godina }) {
  const [rows, setRows] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [search, setSearch] = useState('')

  const load = useCallback(() => api.get('/kontroling/budzet').then(r => setRows(r.data)), [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (modal === 'new') await api.post('/kontroling/budzet', form)
    else await api.put(`/kontroling/budzet/${form.id}`, form)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Obrisati unos?')) { await api.delete(`/kontroling/budzet/${id}`); load() } }

  const filtered = rows.filter(r =>
    (!search || r.kategorija?.toLowerCase().includes(search.toLowerCase()) || r.opis?.toLowerCase().includes(search.toLowerCase()))
  )

  const exportCSV = () => {
    const h = ['Godina', 'Mj', 'Kategorija', 'Opis', 'Plan (€)', 'Stvarni (€)', 'Razlika (€)']
    const d = filtered.map(r => [r.godina, r.mjesec, r.kategorija, r.opis, r.iznos_plan, r.iznos_stvarni, (r.iznos_plan - r.iznos_stvarni).toFixed(2)])
    const csv = [h, ...d].map(row => row.join(';')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `budzet_${godina}.csv`; a.click()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input placeholder="Pretraži..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm w-56 focus:outline-none focus:border-indigo-500"/>
        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
          <Download size={14}/> Export CSV
        </button>
        <button onClick={() => { setForm({ godina, mjesec: new Date().getMonth()+1, kategorija: '', iznos_plan: 0, iznos_stvarni: 0 }); setModal('new') }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm ml-auto">
          <Plus size={14}/> Dodaj budžet
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm text-gray-300">
          <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
            <tr>
              {['God.', 'Mj', 'Kategorija', 'Opis', 'Plan (€)', 'Stvarni (€)', 'Razlika', 'Kreirao', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {filtered.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Nema podataka</td></tr>}
            {filtered.map(r => {
              const razlika = (r.iznos_plan || 0) - (r.iznos_stvarni || 0)
              return (
                <tr key={r.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">{r.godina}</td>
                  <td className="px-4 py-3">{MJ[r.mjesec]}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-indigo-900/50 text-indigo-300 rounded text-xs">{r.kategorija}</span></td>
                  <td className="px-4 py-3 max-w-xs truncate">{r.opis || '—'}</td>
                  <td className="px-4 py-3 font-mono">{EUR(r.iznos_plan)}</td>
                  <td className="px-4 py-3 font-mono">{EUR(r.iznos_stvarni)}</td>
                  <td className={`px-4 py-3 font-mono font-semibold ${razlika >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {razlika >= 0 ? '+' : ''}{EUR(razlika)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.kreirao_ime || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => { setForm({ ...r }); setModal('edit') }} className="text-gray-400 hover:text-indigo-400"><Edit2 size={14}/></button>
                      <button onClick={() => del(r.id)} className="text-gray-400 hover:text-red-400"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Novi budžet' : 'Uredi budžet'} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Godina" type="number" value={form.godina || ''} onChange={v => setForm(f => ({ ...f, godina: +v }))}/>
              <Input label="Mjesec" value={form.mjesec || ''} onChange={v => setForm(f => ({ ...f, mjesec: +v }))}
                options={MJ.slice(1).map((m, i) => ({ value: i+1, label: m }))}/>
            </div>
            <Input label="Kategorija" value={form.kategorija || ''} onChange={v => setForm(f => ({ ...f, kategorija: v }))}
              options={BUDZET_KAT}/>
            <Input label="Opis" value={form.opis || ''} onChange={v => setForm(f => ({ ...f, opis: v }))}/>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Iznos plan (€)" type="number" value={form.iznos_plan || ''} onChange={v => setForm(f => ({ ...f, iznos_plan: +v }))}/>
              <Input label="Iznos stvarni (€)" type="number" value={form.iznos_stvarni || ''} onChange={v => setForm(f => ({ ...f, iznos_stvarni: +v }))}/>
            </div>
            <Input label="Napomena" value={form.napomena || ''} onChange={v => setForm(f => ({ ...f, napomena: v }))}/>
            <div className="flex gap-3 pt-2">
              <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm flex-1 justify-center">
                <Save size={14}/> Spremi
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Odustani</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── TAB: TROŠKOVI STROJA ─────────────────────────────────────────────────
function TabStrojniTroskovi() {
  const [rows, setRows] = useState([])
  const [machines, setMachines] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})

  const load = useCallback(async () => {
    const [r, m] = await Promise.all([api.get('/kontroling/strojni-troskovi'), api.get('/machines')])
    setRows(r.data); setMachines(m.data)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    const payload = { ...form, 'trošak_amortizacija': +form.am||0, 'trošak_struja': +form.el||0, 'trošak_odrzavanje': +form.od||0, 'trošak_ostalo': +form.os||0 }
    if (modal === 'new') await api.post('/kontroling/strojni-troskovi', payload)
    else await api.put(`/kontroling/strojni-troskovi/${form.id}`, payload)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Obrisati?')) { await api.delete(`/kontroling/strojni-troskovi/${id}`); load() } }

  const exportCSV = () => {
    const h = ['Stroj', 'Amortizacija', 'Struja', 'Održavanje', 'Ostalo', 'Ukupno/sat', 'Vrijedi od']
    const d = rows.map(r => [r.stroj_naziv, r.trosak_amortizacija, r.trosak_struja, r.trosak_odrzavanje, r.trosak_ostalo, r.trosak_ukupno_sat, r.vrijedi_od])
    const csv = [h, ...d].map(row => row.join(';')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'strojni_troskovi.csv'; a.click()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
          <Download size={14}/> Export CSV
        </button>
        <button onClick={() => { setForm({ vrijedi_od: new Date().toISOString().slice(0,10) }); setModal('new') }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm ml-auto">
          <Plus size={14}/> Dodaj troška/sat
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm text-gray-300">
          <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
            <tr>
              {['Stroj', 'Amortizacija', 'Struja', 'Održavanje', 'Ostalo', 'Ukupno/sat', 'Vrijedi od', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Nema podataka</td></tr>}
            {rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium text-white">{r.stroj_naziv || '—'}</td>
                <td className="px-4 py-3 font-mono">{EUR(r.trosak_amortizacija)}</td>
                <td className="px-4 py-3 font-mono">{EUR(r.trosak_struja)}</td>
                <td className="px-4 py-3 font-mono">{EUR(r.trosak_odrzavanje)}</td>
                <td className="px-4 py-3 font-mono">{EUR(r.trosak_ostalo)}</td>
                <td className="px-4 py-3 font-mono font-bold text-indigo-300">{EUR(r.trosak_ukupno_sat)}/h</td>
                <td className="px-4 py-3 text-xs text-gray-400">{r.vrijedi_od}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => { setForm({ ...r, am: r.trosak_amortizacija, el: r.trosak_struja, od: r.trosak_odrzavanje, os: r.trosak_ostalo }); setModal('edit') }} className="text-gray-400 hover:text-indigo-400"><Edit2 size={14}/></button>
                    <button onClick={() => del(r.id)} className="text-gray-400 hover:text-red-400"><Trash2 size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Novi trošak stroja/sat' : 'Uredi trošak stroja/sat'} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <Input label="Stroj" value={form.machine_id || ''} onChange={v => setForm(f => ({ ...f, machine_id: +v }))}
              options={machines.map(m => ({ value: m.id, label: m.name }))}/>
            <Input label="Vrijedi od" type="date" value={form.vrijedi_od || ''} onChange={v => setForm(f => ({ ...f, vrijedi_od: v }))}/>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Amortizacija (€/h)" type="number" value={form.am || ''} onChange={v => setForm(f => ({ ...f, am: v }))}/>
              <Input label="Struja (€/h)" type="number" value={form.el || ''} onChange={v => setForm(f => ({ ...f, el: v }))}/>
              <Input label="Održavanje (€/h)" type="number" value={form.od || ''} onChange={v => setForm(f => ({ ...f, od: v }))}/>
              <Input label="Ostalo (€/h)" type="number" value={form.os || ''} onChange={v => setForm(f => ({ ...f, os: v }))}/>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <span className="text-gray-400 text-sm">Ukupno: </span>
              <span className="text-indigo-300 font-bold">{EUR((+form.am||0)+(+form.el||0)+(+form.od||0)+(+form.os||0))}/h</span>
            </div>
            <Input label="Napomena" value={form.napomena || ''} onChange={v => setForm(f => ({ ...f, napomena: v }))}/>
            <div className="flex gap-3 pt-2">
              <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm flex-1 justify-center">
                <Save size={14}/> Spremi
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Odustani</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── TAB: TROŠKOVI NALOGA ─────────────────────────────────────────────────
function TabNalogTroskovi() {
  const [rows, setRows] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const [r, w] = await Promise.all([api.get('/kontroling/nalog-troskovi'), api.get('/work-orders')])
    setRows(r.data); setWorkOrders(w.data)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (modal === 'new') await api.post('/kontroling/nalog-troskovi', form)
    else await api.put(`/kontroling/nalog-troskovi/${form.id}`, form)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Obrisati?')) { await api.delete(`/kontroling/nalog-troskovi/${id}`); load() } }

  const filtered = rows.filter(r =>
    !search || r.nalog_broj?.toLowerCase().includes(search.toLowerCase()) ||
    r.part_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.kategorija?.toLowerCase().includes(search.toLowerCase())
  )

  const exportCSV = () => {
    const h = ['Nalog', 'Dio', 'Kategorija', 'Opis', 'Kol', 'Jed. cijena', 'Ukupno']
    const d = filtered.map(r => [r.nalog_broj, r.part_name, r.kategorija, r.opis, r.kolicina, r.jedinicna_cijena, r.ukupno])
    const csv = [h, ...d].map(row => row.join(';')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'nalog_troskovi.csv'; a.click()
  }

  // Group by work order
  const byNalog = {}
  filtered.forEach(r => {
    const key = r.nalog_broj || r.work_order_id
    if (!byNalog[key]) byNalog[key] = { nalog: r.nalog_broj, part: r.part_name, items: [], total: 0 }
    byNalog[key].items.push(r)
    byNalog[key].total += r.ukupno || 0
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input placeholder="Pretraži nalog, dio..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm w-56 focus:outline-none focus:border-indigo-500"/>
        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
          <Download size={14}/> Export CSV
        </button>
        <button onClick={() => { setForm({ kolicina: 1, jedinicna_cijena: 0 }); setModal('new') }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm ml-auto">
          <Plus size={14}/> Dodaj trošak
        </button>
      </div>

      {Object.values(byNalog).length === 0 && (
        <div className="text-center text-gray-500 py-12">Nema podataka. Dodajte troškove radnih naloga.</div>
      )}

      {Object.values(byNalog).map(group => (
        <NalogGroup key={group.nalog} group={group} onEdit={r => { setForm(r); setModal('edit') }} onDel={del}/>
      ))}

      {modal && (
        <Modal title={modal === 'new' ? 'Novi trošak naloga' : 'Uredi trošak naloga'} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <Input label="Radni nalog" value={form.work_order_id || ''} onChange={v => setForm(f => ({ ...f, work_order_id: +v }))}
              options={workOrders.map(w => ({ value: w.id, label: `${w.work_order_id} — ${w.part_name}` }))}/>
            <Input label="Kategorija" value={form.kategorija || ''} onChange={v => setForm(f => ({ ...f, kategorija: v }))}
              options={NALOG_KAT}/>
            <Input label="Opis" value={form.opis || ''} onChange={v => setForm(f => ({ ...f, opis: v }))}/>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Količina" type="number" value={form.kolicina || ''} onChange={v => setForm(f => ({ ...f, kolicina: +v }))}/>
              <Input label="Jed. cijena (€)" type="number" value={form.jedinicna_cijena || ''} onChange={v => setForm(f => ({ ...f, jedinicna_cijena: +v }))}/>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-center">
              <span className="text-gray-400 text-sm">Ukupno: </span>
              <span className="text-indigo-300 font-bold">{EUR((+form.kolicina||1) * (+form.jedinicna_cijena||0))}</span>
            </div>
            <Input label="Napomena" value={form.napomena || ''} onChange={v => setForm(f => ({ ...f, napomena: v }))}/>
            <div className="flex gap-3 pt-2">
              <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm flex-1 justify-center">
                <Save size={14}/> Spremi
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Odustani</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function NalogGroup({ group, onEdit, onDel }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-800/80 hover:bg-gray-800 text-left">
        <div className="flex items-center gap-3">
          <FileText size={15} className="text-indigo-400"/>
          <span className="text-white font-semibold text-sm">{group.nalog}</span>
          <span className="text-gray-400 text-sm">{group.part}</span>
          <span className="text-xs text-gray-500">{group.items.length} stavki</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-indigo-300 font-bold text-sm">{EUR(group.total)}</span>
          {open ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
        </div>
      </button>
      {open && (
        <table className="w-full text-sm text-gray-300">
          <thead className="bg-gray-900/60 text-gray-500 text-xs uppercase">
            <tr>
              {['Kategorija', 'Opis', 'Kol', 'Jed. cijena', 'Ukupno', ''].map(h => (
                <th key={h} className="px-4 py-2 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/30">
            {group.items.map(r => (
              <tr key={r.id} className="hover:bg-gray-800/30">
                <td className="px-4 py-2"><span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">{r.kategorija}</span></td>
                <td className="px-4 py-2">{r.opis || '—'}</td>
                <td className="px-4 py-2">{r.kolicina}</td>
                <td className="px-4 py-2 font-mono">{EUR(r.jedinicna_cijena)}</td>
                <td className="px-4 py-2 font-mono font-semibold text-white">{EUR(r.ukupno)}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    <button onClick={() => onEdit(r)} className="text-gray-500 hover:text-indigo-400"><Edit2 size={13}/></button>
                    <button onClick={() => onDel(r.id)} className="text-gray-500 hover:text-red-400"><Trash2 size={13}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─── TAB: PROFITABILNOST ──────────────────────────────────────────────────
function TabProfitabilnost({ godina }) {
  const [rows, setRows] = useState([])
  const [partners, setPartners] = useState([])
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([api.get('/kontroling/profitabilnost'), api.get('/sales/partners')])
    setRows(r.data); setPartners(p.data)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    const payload = { ...form, 'trošak_materijal': +form.mat||0, 'trošak_rad': +form.rad||0, 'trošak_rezija': +form.rez||0 }
    if (modal === 'new') await api.post('/kontroling/profitabilnost', payload)
    else await api.put(`/kontroling/profitabilnost/${form.id}`, payload)
    setModal(null); load()
  }
  const del = async (id) => { if (confirm('Obrisati?')) { await api.delete(`/kontroling/profitabilnost/${id}`); load() } }

  const filtered = rows.filter(r =>
    !search || r.proizvod?.toLowerCase().includes(search.toLowerCase()) ||
    r.partner_naziv?.toLowerCase().includes(search.toLowerCase())
  )

  const exportCSV = () => {
    const h = ['Proizvod', 'Partner', 'Period', 'Prihod', 'Mat.', 'Rad', 'Režija', 'Ukupni troš.', 'Dobit', 'Marža%']
    const d = filtered.map(r => [r.proizvod, r.partner_naziv||'—', `${r.period_god}/${MJ[r.period_mj]}`, r.prihod, r.trosak_materijal, r.trosak_rad, r.trosak_rezija, r.ukupni_trosak, r.bruto_dobit, r.marza_posto?.toFixed(1)])
    const csv = [h, ...d].map(row => row.join(';')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `profitabilnost_${godina}.csv`; a.click()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input placeholder="Pretraži proizvod, partner..." value={search} onChange={e => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm w-64 focus:outline-none focus:border-indigo-500"/>
        <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
          <Download size={14}/> Export CSV
        </button>
        <button onClick={() => { setForm({ period_god: godina, period_mj: new Date().getMonth()+1, prihod: 0, mat: 0, rad: 0, rez: 0 }); setModal('new') }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm ml-auto">
          <Plus size={14}/> Dodaj unos
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-700">
        <table className="w-full text-sm text-gray-300">
          <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
            <tr>
              {['Proizvod', 'Partner', 'Period', 'Prihod', 'Ukupni troš.', 'Bruto dobit', 'Marža', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700/50">
            {filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">Nema podataka</td></tr>}
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-gray-800/50">
                <td className="px-4 py-3 font-medium text-white">{r.proizvod}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{r.partner_naziv || '—'}</td>
                <td className="px-4 py-3 text-xs">{r.period_god}/{MJ[r.period_mj]}</td>
                <td className="px-4 py-3 font-mono">{EUR(r.prihod)}</td>
                <td className="px-4 py-3 font-mono">{EUR(r.ukupni_trosak)}</td>
                <td className={`px-4 py-3 font-mono font-semibold ${r.bruto_dobit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {EUR(r.bruto_dobit)}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    r.marza_posto >= 20 ? 'bg-green-900/50 text-green-300' :
                    r.marza_posto >= 10 ? 'bg-yellow-900/50 text-yellow-300' :
                    'bg-red-900/50 text-red-300'
                  }`}>{PCT(r.marza_posto)}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => { setForm({ ...r, mat: r.trosak_materijal, rad: r.trosak_rad, rez: r.trosak_rezija }); setModal('edit') }} className="text-gray-400 hover:text-indigo-400"><Edit2 size={14}/></button>
                    <button onClick={() => del(r.id)} className="text-gray-400 hover:text-red-400"><Trash2 size={14}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Novi unos profitabilnosti' : 'Uredi unos'} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <Input label="Proizvod / naziv dijela" value={form.proizvod || ''} onChange={v => setForm(f => ({ ...f, proizvod: v }))}/>
            <Input label="Partner / kupac" value={form.partner_id || ''} onChange={v => setForm(f => ({ ...f, partner_id: +v }))}
              options={[{ value: '', label: '— bez partnera —' }, ...partners.map(p => ({ value: p.id, label: p.name }))]}/>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Godina" type="number" value={form.period_god || ''} onChange={v => setForm(f => ({ ...f, period_god: +v }))}/>
              <Input label="Mjesec" value={form.period_mj || ''} onChange={v => setForm(f => ({ ...f, period_mj: +v }))}
                options={MJ.slice(1).map((m, i) => ({ value: i+1, label: m }))}/>
            </div>
            <Input label="Prihod (€)" type="number" value={form.prihod || ''} onChange={v => setForm(f => ({ ...f, prihod: +v }))}/>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Materijal (€)" type="number" value={form.mat || ''} onChange={v => setForm(f => ({ ...f, mat: v }))}/>
              <Input label="Rad (€)" type="number" value={form.rad || ''} onChange={v => setForm(f => ({ ...f, rad: v }))}/>
              <Input label="Režija (€)" type="number" value={form.rez || ''} onChange={v => setForm(f => ({ ...f, rez: v }))}/>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 flex justify-between text-sm">
              <span className="text-gray-400">Ukupni trošak: <span className="text-red-300 font-bold">{EUR((+form.mat||0)+(+form.rad||0)+(+form.rez||0))}</span></span>
              <span className="text-gray-400">Dobit: <span className={`font-bold ${(+form.prihod - (+form.mat||0)-(+form.rad||0)-(+form.rez||0)) >= 0 ? 'text-green-300' : 'text-red-300'}`}>{EUR(+form.prihod - (+form.mat||0)-(+form.rad||0)-(+form.rez||0))}</span></span>
            </div>
            <Input label="Napomena" value={form.napomena || ''} onChange={v => setForm(f => ({ ...f, napomena: v }))}/>
            <div className="flex gap-3 pt-2">
              <button onClick={save} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm flex-1 justify-center">
                <Save size={14}/> Spremi
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Odustani</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────
export default function KontrolingPage() {
  const [tab, setTab] = useState('pregled')
  const [godina, setGodina] = useState(new Date().getFullYear())

  const TABS = [
    { id: 'pregled', label: 'Pregled', icon: BarChart2 },
    { id: 'budzet', label: 'Budžet', icon: Target },
    { id: 'strojni', label: 'Troš. stroja/sat', icon: Cpu },
    { id: 'nalog', label: 'Troš. naloga', icon: FileText },
    { id: 'profitabilnost', label: 'Profitabilnost', icon: TrendingUp },
  ]

  return (
    <div className="flex flex-col gap-5 p-1">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Kontroling</h1>
          <p className="text-gray-400 text-sm mt-0.5">Troškovi · Budžet · Profitabilnost · Troškovi stroja</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-sm">Godina:</label>
          <select value={godina} onChange={e => setGodina(+e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
            {[2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800/50 p-1 rounded-xl border border-gray-700 w-fit flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}>
            <Icon size={14}/> {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'pregled' && <TabPregled godina={godina}/>}
      {tab === 'budzet' && <TabBudzet godina={godina}/>}
      {tab === 'strojni' && <TabStrojniTroskovi/>}
      {tab === 'nalog' && <TabNalogTroskovi/>}
      {tab === 'profitabilnost' && <TabProfitabilnost godina={godina}/>}
    </div>
  )
}
