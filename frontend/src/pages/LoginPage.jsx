import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { C } from '../components/UI'
import LanguageSwitcher from '../components/LanguageSwitcher'
import logo from '../assets/logo.png'
import { Building2, User, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [form, setForm]         = useState({ tenantSlug:'', username:'', password:'' })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [showPass, setShowPass] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const f = (k,v) => setForm(p => ({...p,[k]:v}))

  const submit = async () => {
    if (!form.tenantSlug || !form.username || !form.password) {
      setError('Sva polja su obavezna'); return
    }
    setLoading(true); setError('')
    try {
      await login(form.username, form.password, form.tenantSlug.toLowerCase().trim())
      navigate('/')
    } catch(e) {
      setError(e.response?.data?.error || 'Greška pri prijavi')
    } finally { setLoading(false) }
  }

  const handleKey = (e) => { if (e.key === 'Enter') submit() }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', position:'relative', overflow:'hidden' }}>

      {/* LEFT brand panel */}
      <div style={{ flex:1,background:`linear-gradient(145deg,${C.surface} 0%,${C.surface2} 50%,${C.surface3} 100%)`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:60,position:'relative',overflow:'hidden' }}>
        <div style={{ position:'absolute',inset:0,opacity:.06,backgroundImage:`linear-gradient(${C.teal} 1px,transparent 1px),linear-gradient(90deg,${C.teal} 1px,transparent 1px)`,backgroundSize:'40px 40px',pointerEvents:'none' }}/>
        <div style={{ position:'absolute',top:'20%',left:'10%',width:300,height:300,borderRadius:'50%',background:`radial-gradient(circle,${C.teal}18,transparent 70%)`,pointerEvents:'none' }}/>
        <div style={{ position:'absolute',bottom:'15%',right:'5%',width:200,height:200,borderRadius:'50%',background:`radial-gradient(circle,${C.accent}14,transparent 70%)`,pointerEvents:'none' }}/>

        <div style={{ position:'relative',zIndex:1,textAlign:'center',maxWidth:400 }}>
          <div style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',width:120,height:120,borderRadius:30,background:`linear-gradient(145deg,${C.surface3},${C.surface2})`,border:`2px solid ${C.teal}44`,marginBottom:32,boxShadow:`0 0 60px ${C.teal}22,0 8px 32px rgba(0,0,0,.4)` }}>
            <img src={logo} alt="DEER" style={{ width:88,height:'auto' }}/>
          </div>
          <div style={{ fontSize:36,fontWeight:700,color:'#E8F2F0',letterSpacing:8,marginBottom:6,fontFamily:"'Chakra Petch',sans-serif",textShadow:`0 0 40px ${C.teal}44` }}>DEER</div>
          <div style={{ fontSize:13,color:C.teal,letterSpacing:4,marginBottom:28,fontFamily:"'Chakra Petch',sans-serif" }}>MES PLATFORM v3</div>
          {[
            'Potpuna izolacija podataka po tvrtki',
            'Privatni AI asistent — vaši podaci ostaju kod vas',
            'Produkcija · OEE · Alati · Naprave · DMS',
            'Multi-tenant SaaS arhitektura',
          ].map((feat,i) => (
            <div key={i} style={{ display:'flex',alignItems:'center',gap:10,marginBottom:8,textAlign:'left' }}>
              <span style={{ color:C.teal,fontSize:12 }}>▸</span>
              <span style={{ fontSize:13,color:C.muted }}>{feat}</span>
            </div>
          ))}
          <div style={{ marginTop:36,padding:'12px 20px',background:`${C.teal}0c`,border:`1px solid ${C.teal}22`,borderRadius:10,fontSize:11,color:C.muted,textAlign:'left' }}>
            <span style={{ color:C.teal,fontWeight:600 }}>DEER MES v3.0</span> · Multi-Tenant SaaS · Private AI
          </div>
        </div>
      </div>

      {/* RIGHT login panel */}
      <div style={{ width:480,background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:48,borderLeft:`1px solid ${C.border}`,position:'relative' }}>
        <div style={{ position:'absolute',top:20,right:20 }}><LanguageSwitcher/></div>

        <div style={{ width:'100%',maxWidth:380 }}>
          {/* Header */}
          <div style={{ marginBottom:32 }}>
            <div style={{ fontSize:10,color:C.muted,letterSpacing:2,marginBottom:6 }}>PRIJAVA U SUSTAV</div>
            <div style={{ fontSize:22,fontWeight:700,color:'#e8f0ee',letterSpacing:1 }}>Dobrodošli natrag</div>
            <div style={{ fontSize:12,color:C.muted2,marginTop:4 }}>Unesite podatke vaše tvrtke za pristup</div>
          </div>

          {/* Tenant slug field */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:10,color:C.muted,letterSpacing:1.5,display:'block',marginBottom:8 }}>IDENTIFIKATOR TVRTKE</label>
            <div style={{ position:'relative' }}>
              <Building2 size={15} color={C.muted} style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)' }}/>
              <input
                value={form.tenantSlug}
                onChange={e => f('tenantSlug', e.target.value)}
                onKeyDown={handleKey}
                placeholder="npr. firma-doo"
                style={{ width:'100%',boxSizing:'border-box',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px 12px 40px',color:'#e8f0ee',fontSize:13,fontFamily:"'Chakra Petch',sans-serif",outline:'none' }}
                onFocus={e => e.target.style.borderColor=C.teal}
                onBlur={e => e.target.style.borderColor=C.border}
              />
            </div>
            <div style={{ fontSize:10,color:C.muted,marginTop:4,marginLeft:2 }}>Dobili ste ovo od administratora sustava</div>
          </div>

          {/* Username */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:10,color:C.muted,letterSpacing:1.5,display:'block',marginBottom:8 }}>KORISNIČKO IME</label>
            <div style={{ position:'relative' }}>
              <User size={15} color={C.muted} style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)' }}/>
              <input
                value={form.username}
                onChange={e => f('username', e.target.value)}
                onKeyDown={handleKey}
                placeholder="korisničko_ime"
                style={{ width:'100%',boxSizing:'border-box',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 14px 12px 40px',color:'#e8f0ee',fontSize:13,fontFamily:"'Chakra Petch',sans-serif",outline:'none' }}
                onFocus={e => e.target.style.borderColor=C.teal}
                onBlur={e => e.target.style.borderColor=C.border}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom:24 }}>
            <label style={{ fontSize:10,color:C.muted,letterSpacing:1.5,display:'block',marginBottom:8 }}>LOZINKA</label>
            <div style={{ position:'relative' }}>
              <Lock size={15} color={C.muted} style={{ position:'absolute',left:14,top:'50%',transform:'translateY(-50%)' }}/>
              <input
                type={showPass ? 'text' : 'password'}
                value={form.password}
                onChange={e => f('password', e.target.value)}
                onKeyDown={handleKey}
                placeholder="••••••••"
                style={{ width:'100%',boxSizing:'border-box',background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 44px 12px 40px',color:'#e8f0ee',fontSize:13,fontFamily:"'Chakra Petch',sans-serif",outline:'none' }}
                onFocus={e => e.target.style.borderColor=C.teal}
                onBlur={e => e.target.style.borderColor=C.border}
              />
              <button onClick={()=>setShowPass(p=>!p)} style={{ position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:C.muted,padding:0 }}>
                {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:`${C.red}12`,border:`1px solid ${C.red}30`,borderRadius:8,marginBottom:20,fontSize:12,color:C.red }}>
              <AlertCircle size={14}/> {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={submit}
            disabled={loading}
            style={{ width:'100%',padding:'14px',borderRadius:10,border:'none',background:loading?C.surface2:C.teal,color:loading?C.muted:'#0d1f1c',fontSize:13,fontWeight:700,letterSpacing:1,cursor:loading?'not-allowed':'pointer',fontFamily:"'Chakra Petch',sans-serif",transition:'all .2s' }}
          >
            {loading ? 'PRIJAVLJIVANJE...' : 'PRIJAVA'}
          </button>

          <div style={{ marginTop:24,padding:'12px 16px',background:`${C.surface}`,border:`1px solid ${C.border}`,borderRadius:8,fontSize:11,color:C.muted,textAlign:'center' }}>
            Demo pristup: <span style={{ color:C.teal }}>demo-tvrtka</span> / admin / admin123
          </div>
        </div>
      </div>
    </div>
  )
}
