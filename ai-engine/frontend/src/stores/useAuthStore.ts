import { create } from 'zustand'

interface User {
  id: number
  email: string
  full_name: string
  role: string
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null,
  isLoading: false,
  error: null,

  // Inicializar - verificar si hay token guardado
  init: async () => {
    // Migrar token viejo si existe
    const oldToken = localStorage.getItem('token')
    if (oldToken && !localStorage.getItem('auth_token')) {
      localStorage.setItem('auth_token', oldToken)
      localStorage.removeItem('token')
    }

    const token = localStorage.getItem('auth_token')
    if (token) {
      set({ token, isLoading: true })
      try {
        const response = await fetch('/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.ok) {
          const user = await response.json()
          set({ user, isLoading: false })
          return true
        }
      } catch {
        // Token inválido
      }
      localStorage.removeItem('auth_token')
      set({ token: null, isLoading: false })
    }
    return false
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Error al iniciar sesión' }))
        set({ isLoading: false, error: error.detail || 'Error al iniciar sesión' })
        throw new Error(error.detail)
      }

      const data = await response.json()
      const token = data.access_token

      localStorage.setItem('auth_token', token)
      set({ token, isLoading: false })

      // Obtener datos del usuario
      await get().init()
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Error al iniciar sesión' })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('auth_token')
    set({ user: null, token: null, error: null })
  },

  clearError: () => set({ error: null }),
}))
