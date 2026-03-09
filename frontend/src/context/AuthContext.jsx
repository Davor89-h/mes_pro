import { createContext, useContext, useState } from 'react'
import api from '../utils/api'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(() => { try { return JSON.parse(localStorage.getItem('deer_user')) } catch { return null } })
  const [tenant, setTenant] = useState(() => { try { return JSON.parse(localStorage.getItem('deer_tenant')) } catch { return null } })

  const login = async (username, password, tenantSlug) => {
    const { data } = await api.post('/auth/login', { username, password, tenantSlug })
    localStorage.setItem('deer_token', data.token)
    localStorage.setItem('deer_user', JSON.stringify(data.user))
    localStorage.setItem('deer_tenant', JSON.stringify(data.tenant))
    setUser(data.user)
    setTenant(data.tenant)
    return data
  }

  const logout = () => {
    api.post('/auth/logout').catch(() => {})
    localStorage.removeItem('deer_token')
    localStorage.removeItem('deer_user')
    localStorage.removeItem('deer_tenant')
    setUser(null)
    setTenant(null)
  }

  return (
    <Ctx.Provider value={{
      user, tenant, login, logout,
      isAdmin:    user?.role === 'company_admin',
      isVoditelj: user?.role === 'voditelj',
      canEdit:    ['company_admin','voditelj'].includes(user?.role),
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
