import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import { Boxes } from 'lucide-react'

export function LoginPage() {
  const navigate = useNavigate()
  const { login, isLoading, error, clearError, init, user } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Verificar si ya está autenticado al montar
  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = await init()
      if (authenticated) {
        navigate('/pipelines')
      }
    }
    checkAuth()
  }, [])

  // Si ya está logueado, redirigir
  useEffect(() => {
    if (user) {
      navigate('/pipelines')
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await login(email, password)
      navigate('/pipelines')
    } catch {
      // Error ya está en el store
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - Marketing */}
      <div className="hidden lg:block w-1/2 border-r border-border bg-card p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(196,22,90,0.12),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(196,22,90,0.08),_transparent_38%)]" />

        <div className="relative z-10">
          <Boxes className="h-10 w-10 text-accent" />
          <h1 className="mt-6 text-4xl font-black text-foreground leading-tight">
            Orquestación de pipelines AI
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Crea flujos visuales de generación de imágenes y video
            con aprobación humana en el loop.
          </p>

          <div className="mt-12 space-y-4">
            <div className="rounded-2xl border border-border bg-background p-5">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
                Gemini API
              </p>
              <p className="mt-3 text-3xl font-black text-foreground">
                Nano Banana 2
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Generación de imágenes de alta calidad
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-5">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
                LumaLabs
              </p>
              <p className="mt-3 text-3xl font-black text-foreground">
                Dream Machine
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Video generation from text & images
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background p-5">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
                Human-in-the-loop
              </p>
              <p className="mt-3 text-3xl font-black text-foreground">
                Aprobación humana
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Control total en puntos críticos del flujo
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
              Acceso seguro
            </p>
            <h2 className="mt-3 text-3xl font-black text-foreground">
              Entrar al AI Engine
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Usa tus credenciales para acceder al panel de control.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-800/50 bg-rose-950/30 p-3 text-sm text-rose-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearError()
                }}
                required
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 transition focus:border-accent focus:outline-none"
                placeholder="tu@grandeandgordo.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-muted-foreground">
                Contraseña
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  clearError()
                }}
                required
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 transition focus:border-accent focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full inline-flex items-center justify-center rounded-full bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground transition hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="mt-6 p-4 rounded-xl border border-border bg-background/50">
            <p className="text-xs font-medium text-muted-foreground mb-2">Credenciales de prueba:</p>
            <code className="text-xs text-foreground">admin@grandeandgordo.com / admin123</code>
          </div>
        </div>
      </div>
    </div>
  )
}
