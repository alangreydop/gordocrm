import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Layout } from '../components/Layout'
import { Webhook, Plus, Trash2, Edit, CheckCircle, XCircle, Activity } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface WebhookSubscription {
  id: number
  name: string
  description: string | null
  event_type: string
  target_url: string
  active: boolean
  created_at: string
  last_triggered_at: string | null
  success_count: number
  failure_count: number
}

const AVAILABLE_EVENTS = [
  { value: 'pipeline.created', label: 'Pipeline Creado', category: 'Pipeline' },
  { value: 'pipeline.updated', label: 'Pipeline Actualizado', category: 'Pipeline' },
  { value: 'pipeline.deleted', label: 'Pipeline Eliminado', category: 'Pipeline' },
  { value: 'job.started', label: 'Job Iniciado', category: 'Job' },
  { value: 'job.completed', label: 'Job Completado', category: 'Job' },
  { value: 'job.failed', label: 'Job Fallido', category: 'Job' },
  { value: 'job.cancelled', label: 'Job Cancelado', category: 'Job' },
  { value: 'approval.pending', label: 'Aprobación Pendiente', category: 'Aprobación' },
  { value: 'approval.approved', label: 'Aprobación Aprobada', category: 'Aprobación' },
  { value: 'approval.rejected', label: 'Aprobación Rechazada', category: 'Aprobación' },
]

export function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<WebhookSubscription | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    event_type: 'job.completed',
    target_url: '',
    secret: '',
    active: true,
  })

  useEffect(() => {
    loadWebhooks()
  }, [])

  const loadWebhooks = async () => {
    try {
      const response = await api.get('/webhooks')
      setWebhooks(response.data)
    } catch (error) {
      console.error('Error loading webhooks:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (editingWebhook) {
        await api.put(`/webhooks/${editingWebhook.id}`, formData)
      } else {
        await api.post('/webhooks', formData)
      }
      setShowModal(false)
      setEditingWebhook(null)
      setFormData({ name: '', description: '', event_type: 'job.completed', target_url: '', secret: '', active: true })
      loadWebhooks()
    } catch (error) {
      console.error('Error saving webhook:', error)
      alert('Error guardando webhook')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Seguro que quieres eliminar este webhook?')) return

    try {
      await api.delete(`/webhooks/${id}`)
      loadWebhooks()
    } catch (error) {
      console.error('Error deleting webhook:', error)
    }
  }

  const handleEdit = (webhook: WebhookSubscription) => {
    setEditingWebhook(webhook)
    setFormData({
      name: webhook.name,
      description: webhook.description || '',
      event_type: webhook.event_type,
      target_url: webhook.target_url,
      secret: '',
      active: webhook.active,
    })
    setShowModal(true)
  }

  const openNewModal = () => {
    setEditingWebhook(null)
    setFormData({ name: '', description: '', event_type: 'job.completed', target_url: '', secret: '', active: true })
    setShowModal(true)
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
              Integraciones
            </p>
            <h1 className="mt-3 text-3xl font-black text-foreground">
              Webhooks
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              Configura webhooks para recibir notificaciones en tiempo real cuando ocurran eventos en tu pipeline.
              Ideal para integrar con Slack, Discord, o sistemas externos.
            </p>
          </div>
          <button
            onClick={openNewModal}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:bg-secondary"
          >
            <Plus className="h-4 w-4" />
            Nuevo webhook
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Cargando webhooks...
          </div>
        ) : webhooks.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <Webhook className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium">
              No tienes webhooks configurados
            </p>
            <p className="text-muted-foreground mt-2">
              Crea tu primer webhook para recibir notificaciones de eventos
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="rounded-2xl border border-border bg-card p-6 transition hover:border-accent"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-foreground">
                        {webhook.name}
                      </h3>
                      {webhook.active ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/50 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                          <CheckCircle className="h-3 w-3" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800/50 bg-zinc-950/30 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                          <XCircle className="h-3 w-3" />
                          Inactivo
                        </span>
                      )}
                    </div>

                    {webhook.description && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {webhook.description}
                      </p>
                    )}

                    <div className="mt-4 flex items-center gap-6 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Activity className="h-3 w-3" />
                        <span className="font-medium">{webhook.event_type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Éxitos:</span>
                        <span className="text-emerald-400 font-medium">{webhook.success_count}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>Fallos:</span>
                        <span className="text-rose-400 font-medium">{webhook.failure_count}</span>
                      </div>
                      {webhook.last_triggered_at && (
                        <div className="flex items-center gap-2">
                          <span>Última ejecución:</span>
                          <span>
                            {format(new Date(webhook.last_triggered_at), 'd MMM yyyy HH:mm', { locale: es })}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <code className="text-xs bg-background px-2 py-1 rounded text-foreground">
                        {webhook.target_url}
                      </code>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(webhook)}
                      className="p-2 text-muted-foreground hover:text-foreground transition"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(webhook.id)}
                      className="p-2 text-muted-foreground hover:text-destructive transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold text-foreground mb-4">
              {editingWebhook ? 'Editar Webhook' : 'Nuevo Webhook'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none"
                  placeholder="Ej: Notificar Slack cuando job complete"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[80px]"
                  placeholder="Descripción opcional del propósito del webhook..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Evento *
                </label>
                <select
                  value={formData.event_type}
                  onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
                >
                  {AVAILABLE_EVENTS.map((event) => (
                    <option key={event.value} value={event.value}>
                      {event.label} ({event.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Target URL *
                </label>
                <input
                  type="url"
                  value={formData.target_url}
                  onChange={(e) => setFormData({ ...formData, target_url: e.target.value })}
                  required
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none"
                  placeholder="https://tu-servicio.com/webhook"
                />
                <p className="text-xs text-muted-foreground">
                  La URL que recibirá las notificaciones POST
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Secret (opcional)
                </label>
                <input
                  type="password"
                  value={formData.secret}
                  onChange={(e) => setFormData({ ...formData, secret: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none"
                  placeholder="Para firmar payloads con HMAC-SHA256"
                />
                <p className="text-xs text-muted-foreground">
                  Se usa para firmar los payloads. El header X-Webhook-Signature contendrá la firma.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={formData.active}
                  onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                  className="rounded border-border bg-background"
                />
                <label htmlFor="active" className="text-sm font-medium text-foreground">
                  Activo
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-secondary"
                >
                  {editingWebhook ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
