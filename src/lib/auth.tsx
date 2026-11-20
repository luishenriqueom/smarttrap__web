"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { api, clearToken, getToken, setToken } from "@/lib/api"
import type { User } from "@/lib/types"

type AuthContextValue = {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  loginDemo: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!getToken()) {
      setReady(true)
      return
    }
    api
      .me()
      .then(setUser)
      .catch(() => {
        clearToken()
        setUser(null)
      })
      .finally(() => setReady(true))
  }, [])

  async function login(email: string, password: string) {
    const result = await api.login(email, password)
    setToken(result.access_token)
    setUser(result.user)
  }

  async function loginDemo() {
    const result = await api.demo()
    setToken(result.access_token)
    setUser(result.user)
  }

  function logout() {
    clearToken()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, ready, login, loginDemo, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error("useAuth precisa estar dentro do AuthProvider")
  return value
}
