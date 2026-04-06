import { useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/useAuthStore'
import {
  Boxes,
  Workflow,
  List,
  LogOut,
  User,
  CheckCircle,
  Webhook,
  Bot,
} from 'lucide-react'

export function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token, init, logout } = useAuthStore()

  useEffect(() => {
    // Inicializar auth al montar el layout
    const checkAuth = async () => {
      const authenticated = await init()
      if (!authenticated) {
        navigate('/login', { replace: true })
      }
    }
    checkAuth()
  }, [])

  // Si no hay token ni usuario, redirigir a login
  if (!token && !user) {
    return null
  }

  const navItems = [
    { href: '/pipelines', label: 'Pipelines', icon: Workflow },
    { href: '/jobs', label: 'Jobs', icon: List },
    { href: '/approvals', label: 'Aprobaciones', icon: CheckCircle },
    { href: '/webhooks', label: 'Webhooks', icon: Webhook },
    { href: '/agents', label: 'AI Agents', icon: Bot },
  ]

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card p-6 flex flex-col">
        <div className="mb-8">
          <Boxes className="h-8 w-8 text-accent" />
          <h1 className="mt-3 text-xl font-bold text-foreground">
            AI Engine
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Pipeline orchestration
          </p>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map((item) => {
            const active = location.pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition ${
                  active
                    ? 'bg-primary text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto pt-6 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
              <User className="h-4 w-4 text-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.full_name || 'Usuario'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
