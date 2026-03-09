import { useState, useEffect } from 'react'
import { C, Btn, Loading } from '../components/UI'
import { Shield, Plus, Building2, Users, Activity, CheckCircle, XCircle, RefreshCw, Eye, Settings } from 'lucide-react'

const SA_KEY = 'deer_super_token'

export default function SuperAdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem(SA_KEY))
  return token
    ? <Dashboard token={token} onLogout={() => { localStorage.removeItem(SA_KEY); setToken(null) }}/>
    : <SALogin onLogin={t => { localStorage.setItem(SA_KEY, t); setToken(t) }}/>
}

// ── Login ─────────────────────────────────────────────────────────────────────
function SALogin({ onLogin }) {
  const [form, setForm] = useState({ username:'', password:'' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/superadmin/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(form)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      onLogin(d.token)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center' }}>
      <div style={{ width:360,background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:40 }}>
        <div style={{ textAlign:'center',marginBottom:32 }}>
          <div style={{ width:56,height:56,borderRadius:16,background:`${C.red}15`,border:`1px solid ${C.red}30`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px' }}>
            <Shield size={24} color={C.red}/>
          </div>
          <div style={{ fontSize:18,fontWeight:700,color:'#e8f0ee',letterSpacing:1 }}>SUPER ADMIN</div>
          <div style={{ fontSize:11,color:C.muted,marginTop:4 }}>Upravljanje svim tenantima</div>
        </div>
        {['username','password'].map(k => (
          <div key={k} style={{ marginBottom:14 }}>
            <input
              type={k==='password'?'password':'text'}
              placeholder={k==='username'?'Username':'Lozinka'}
              value={form[k]} onChange={e => setForm(p=>({...p,[k]:e.target.value}))}
              onKeyDown={e => e.key==='Enter' && submit()}
              style={{ width:'100%',boxSizing:'border-box',background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:'11px 14px',color:'#e8f0ee',fontSize:13,outline:'none' }}
            />
          </div>
        ))}
        {error && <div style={{ color:C.red,fontSize:12,marginBottom:12 }}>{error}</div>}
        <button onClick={submit} disabled={loading} style={{ width:'100%',padding:'12px',background:C.red,color:'#fff',border:'none',borderRadius:8,fontWeight:700,fontSize:13,cursor:'pointer' }}>
          {loading ? 'Prijava...' : 'PRIJAVA'}
        </button>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ token, onLogout }) {
  const [stats, setStats]       = useState(null)
  const [tenants, setTenants]   = useState([])
  const [tab, setTab]           = useState('tenants')
  const [loading, setLoading]   = useState(true)
  const [showNew, setShowNew]   = useState(false)

  const hdr = { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' }

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/superadmin/stats', { headers: hdr })
      if (r.status === 401) { onLogout(); return }
      const d = await r.json()
      setStats(d)
      setTenants(d.tenants || [])
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <Loading/>

  return (
    <div style={{ minHeight:'100vh',background:C.bg,padding:32 }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',gap:16,marginBottom:28 }}>
        <div style={{ width:44,height:44,borderRadius:12,background:`${C.red}15`,border:`1px solid ${C.red}30`,display:'flex',alignItems:'center',justifyContent:'center' }}>
          <Shield size={22} color={C.red}/>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:10,color:C.muted,letterSpacing:2 }}>DEER MES v3 · SUPER ADMIN</div>
          <div style={{ fontSize:18,fontWeight:700,color:'#e8f0ee',letterSpacing:1 }}>Upravljanje Platformom</div>
        </div>
        <Btn v="ghost" sm onClick={load}><RefreshCw size={14} style={{ marginRight:6 }}/>Osvježi</Btn>
        <Btn v="ghost" sm onClick={onLogout}>Odjava</Btn>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24 }}>
        {[
          { label:'Ukupno tvrtki', value:stats?.total_tenants||0, color:C.teal, icon:<Building2 size={14}/> },
          { label:'Aktivnih', value:stats?.active_tenants||0, color:'#4ADE80', icon:<CheckCircle size={14}/> },
          { label:'Neaktivnih', value:stats?.inactive_tenants||0, color:C.orange, icon:<XCircle size={14}/> },
          { label:'Ukupno korisnika', value:stats?.total_users||0, color:C.accent, icon:<Users size={14}/> },
        ].map((kpi,i) => (
          <div key={i} style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:'18px 20px',position:'relative',overflow:'hidden' }}>
            <div style={{ position:'absolute',top:0,left:0,right:0,height:2,background:kpi.color }}/>
            <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:6,color:kpi.color }}>{kpi.icon}<span style={{ fontSize:10,color:C.muted,letterSpacing:1 }}>{kpi.label.toUpperCase()}</span></div>
            <div style={{ fontSize:30,fontWeight:700,color:kpi.color }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex',gap:8,marginBottom:20 }}>
        {['tenants','audit'].map(t => (
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 18px',borderRadius:8,border:'none',background:tab===t?C.teal:C.surface2,color:tab===t?'#0d1f1c':C.muted,fontSize:12,fontWeight:600,cursor:'pointer',letterSpacing:.5 }}>
            {t==='tenants'?'TVRTKE':'AUDIT LOG'}
          </button>
        ))}
        <div style={{ flex:1 }}/>
        {tab==='tenants' && <Btn v="teal" sm onClick={()=>setShowNew(true)}><Plus size={14} style={{ marginRight:6 }}/>Nova tvrtka</Btn>}
      </div>

      {tab==='tenants' && <TenantsTable tenants={tenants} token={token} onRefresh={load}/>}
      {tab==='audit'   && <AuditTable rows={stats?.recent_audit||[]}/>}

      {showNew && <NewTenantModal token={token} onClose={()=>setShowNew(false)} onDone={()=>{setShowNew(false);load()}}/>}
    </div>
  )
}

// ── Tenants table ─────────────────────────────────────────────────────────────
function TenantsTable({ tenants, token, onRefresh }) {
  const hdr = { Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }

  const toggle = async (slug, active) => {
    await fetch(`/api/superadmin/tenants/${slug}`, {
      method:'PATCH', headers:hdr, body:JSON.stringify({ active: active?0:1 })
    })
    onRefresh()
  }

  if (!tenants.length) return (
    <div style={{ textAlign:'center',padding:60,color:C.muted,background:C.surface,borderRadius:14,border:`1px solid ${C.border}` }}>
      Nema registriranih tvrtki. Klikni "Nova tvrtka" za početak.
    </div>
  )

  return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,overflow:'hidden' }}>
      <table style={{ width:'100%',borderCollapse:'collapse' }}>
        <thead>
          <tr style={{ background:C.surface2 }}>
            {['Tvrtka','Slug','Plan','Korisnici','Strojevi','Status','Kreirano','Akcije'].map(h => (
              <th key={h} style={{ padding:'10px 16px',textAlign:'left',fontSize:9,color:C.muted,letterSpacing:1.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tenants.map(t => (
            <tr key={t.slug} style={{ borderTop:`1px solid ${C.border}44` }}>
              <td style={{ padding:'12px 16px',fontSize:13,fontWeight:600,color:'#e8f0ee' }}>{t.name}</td>
              <td style={{ padding:'12px 16px' }}><span style={{ fontSize:11,color:C.teal,fontFamily:'monospace',background:`${C.teal}10`,padding:'2px 8px',borderRadius:4 }}>{t.slug}</span></td>
              <td style={{ padding:'12px 16px',fontSize:12,color:C.muted,textTransform:'uppercase' }}>{t.plan}</td>
              <td style={{ padding:'12px 16px',fontSize:12,color:C.gray }}>{t.max_users}</td>
              <td style={{ padding:'12px 16px',fontSize:12,color:C.gray }}>{t.max_machines}</td>
              <td style={{ padding:'12px 16px' }}>
                <span style={{ fontSize:10,padding:'3px 8px',borderRadius:20,background:t.active?'#4ADE8015':'#f8717115',color:t.active?'#4ADE80':C.red,border:`1px solid ${t.active?'#4ADE8030':'#f8717130'}` }}>
                  {t.active?'AKTIVAN':'NEAKTIVAN'}
                </span>
              </td>
              <td style={{ padding:'12px 16px',fontSize:11,color:C.muted }}>{t.created_at?.slice(0,10)}</td>
              <td style={{ padding:'12px 16px' }}>
                <button onClick={()=>toggle(t.slug,t.active)} style={{ padding:'5px 12px',borderRadius:6,border:`1px solid ${C.border}`,background:'transparent',color:t.active?C.orange:'#4ADE80',fontSize:11,cursor:'pointer' }}>
                  {t.active?'Deaktiviraj':'Aktiviraj'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── New tenant modal ──────────────────────────────────────────────────────────
function NewTenantModal({ token, onClose, onDone }) {
  const [form, setForm] = useState({ name:'', slug:'', email:'', plan:'starter', adminUsername:'admin', adminPassword:'', maxUsers:10, maxMachines:20 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const f = (k,v) => setForm(p=>({...p,[k]:v}))

  // Auto-generate slug from name
  const handleName = (v) => {
    f('name', v)
    if (!form.slug || form.slug === form.name.toLowerCase().replace(/[^a-z0-9]/g,'-')) {
      f('slug', v.toLowerCase().replace(/[^a-z0-9]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''))
    }
  }

  const submit = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/superadmin/tenants', {
        method:'POST',
        headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' },
        body: JSON.stringify(form)
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setResult(d)
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000 }}>
      <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:36,width:500,maxHeight:'90vh',overflowY:'auto' }}>
        <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:28 }}>
          <Building2 size={20} color={C.teal}/>
          <div style={{ fontSize:16,fontWeight:700,color:'#e8f0ee' }}>Nova tvrtka</div>
          <div style={{ flex:1 }}/>
          <button onClick={onClose} style={{ background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:18 }}>✕</button>
        </div>

        {result ? (
          <div>
            <div style={{ padding:20,background:`${'#4ADE80'}10`,border:`1px solid ${'#4ADE80'}30`,borderRadius:12,marginBottom:20 }}>
              <div style={{ color:'#4ADE80',fontWeight:700,marginBottom:8 }}>✅ Tvrtka kreirana!</div>
              <div style={{ fontSize:12,color:C.gray }}>Tenant slug: <span style={{ color:C.teal,fontFamily:'monospace' }}>{result.tenant?.slug}</span></div>
              <div style={{ fontSize:12,color:C.gray,marginTop:4 }}>Admin: <span style={{ color:C.teal }}>{result.credentials?.username}</span></div>
              <div style={{ fontSize:11,color:C.orange,marginTop:8 }}>⚠️ {result.credentials?.note}</div>
            </div>
            <Btn v="teal" onClick={onDone}>Gotovo</Btn>
          </div>
        ) : (
          <>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14 }}>
              {[
                { k:'name', label:'Naziv tvrtke', full:true, onChange: handleName },
                { k:'slug', label:'Slug (identifikator)' },
                { k:'email', label:'Email kontakt' },
                { k:'plan', label:'Plan', type:'select', opts:['starter','pro','enterprise'] },
                { k:'adminUsername', label:'Admin korisničko ime' },
                { k:'adminPassword', label:'Admin lozinka', type:'password' },
                { k:'maxUsers', label:'Max korisnika', type:'number' },
                { k:'maxMachines', label:'Max strojeva', type:'number' },
              ].map(field => (
                <div key={field.k} style={{ gridColumn: field.full?'1/-1':'auto' }}>
                  <label style={{ fontSize:10,color:C.muted,letterSpacing:1,display:'block',marginBottom:6 }}>{field.label.toUpperCase()}</label>
                  {field.type==='select' ? (
                    <select value={form[field.k]} onChange={e=>f(field.k,e.target.value)}
                      style={{ width:'100%',background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:'#e8f0ee',fontSize:13,outline:'none' }}>
                      {field.opts.map(o=><option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input type={field.type||'text'} value={form[field.k]}
                      onChange={e => (field.onChange||((v)=>f(field.k,v)))(e.target.value)}
                      style={{ width:'100%',boxSizing:'border-box',background:C.surface2,border:`1px solid ${C.border}`,borderRadius:8,padding:'9px 12px',color:'#e8f0ee',fontSize:13,outline:'none' }}
                    />
                  )}
                </div>
              ))}
            </div>
            {error && <div style={{ color:C.red,fontSize:12,marginBottom:14 }}>{error}</div>}
            <div style={{ display:'flex',gap:10 }}>
              <Btn v="ghost" onClick={onClose}>Odustani</Btn>
              <Btn v="teal" onClick={submit} disabled={loading}>{loading?'Kreiranje...':'Kreiraj tvrtku'}</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Audit log table ────────────────────────────────────────────────────────────
function AuditTable({ rows }) {
  if (!rows.length) return <div style={{ padding:40,textAlign:'center',color:C.muted }}>Nema audit zapisa</div>
  return (
    <div style={{ background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,overflow:'hidden' }}>
      <table style={{ width:'100%',borderCollapse:'collapse' }}>
        <thead><tr style={{ background:C.surface2 }}>
          {['Tenant','Korisnik','Akcija','Entitet','Timestamp'].map(h=>(
            <th key={h} style={{ padding:'10px 16px',textAlign:'left',fontSize:9,color:C.muted,letterSpacing:1.5 }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {rows.map((r,i) => (
            <tr key={i} style={{ borderTop:`1px solid ${C.border}44` }}>
              <td style={{ padding:'10px 16px',fontSize:11,color:C.teal,fontFamily:'monospace' }}>{r.tenant_slug||'—'}</td>
              <td style={{ padding:'10px 16px',fontSize:12,color:C.gray }}>{r.username||'—'}</td>
              <td style={{ padding:'10px 16px',fontSize:11,fontWeight:600,color:'#e8f0ee' }}>{r.action}</td>
              <td style={{ padding:'10px 16px',fontSize:11,color:C.muted }}>{r.entity||'—'}</td>
              <td style={{ padding:'10px 16px',fontSize:10,color:C.muted,fontFamily:'monospace' }}>{r.created_at?.slice(0,19)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
