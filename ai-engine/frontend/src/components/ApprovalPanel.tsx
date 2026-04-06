import { useState, useEffect } from 'react'
import { jobsApi } from '../lib/api'
import { Check, X, Eye, ExternalLink } from 'lucide-react'

interface Approval {
  id: number
  job_id: number
  node_id: string
  status: string
  preview_data: any
  created_at: string
  approved_at: string | null
  approver_email: string | null
}

interface ApprovalPanelProps {
  onApprovalComplete?: () => void
}

export function ApprovalPanel({ onApprovalComplete }: ApprovalPanelProps) {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    loadApprovals()
    const interval = setInterval(loadApprovals, 5000) // Poll every 5s
    return () => clearInterval(interval)
  }, [])

  const loadApprovals = async () => {
    try {
      // Get all jobs with waiting_approval status
      const response = await jobsApi.list('waiting_approval')
      const jobsWithApprovals = response.data

      // Fetch approvals for each job
      const allApprovals: Approval[] = []
      for (const job of jobsWithApprovals) {
        const approvalsResponse = await jobsApi.getApprovals(job.id)
        const pendingApprovals = approvalsResponse.data.filter(
          (a: Approval) => a.status === 'pending'
        )
        allApprovals.push(...pendingApprovals.map((a: Approval) => ({ ...a, job })))
      }

      setApprovals(allApprovals)
    } catch (error) {
      console.error('Error loading approvals:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const decideApproval = async (approvalId: number, approved: boolean) => {
    setIsSubmitting(true)
    try {
      await jobsApi.decideApproval(approvalId, approved, comment || undefined)
      setComment('')
      setSelectedApproval(null)
      loadApprovals()
      onApprovalComplete?.()
    } catch (error) {
      console.error('Error deciding approval:', error)
      alert('Error al procesar la aprobación')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getPreviewContent = (approval: Approval) => {
    const previewData = approval.preview_data || {}

    // Check for image results
    for (const [key, value] of Object.entries(previewData)) {
      if (typeof value === 'object' && value !== null) {
        if (value.type === 'image' && Array.isArray(value.results)) {
          return (
            <div className="grid grid-cols-2 gap-3">
              {value.results.map((result: any, idx: number) => (
                <div key={idx} className="rounded-xl overflow-hidden border border-border">
                  {result.image_url ? (
                    <img
                      src={result.image_url}
                      alt={`Generated ${idx + 1}`}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-secondary flex items-center justify-center">
                      <p className="text-muted-foreground text-sm">Imagen no disponible</p>
                    </div>
                  )}
                  <div className="p-3 bg-card">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {result.prompt || 'Sin prompt'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        }

        if (value.type === 'video' && value.result) {
          return (
            <div className="rounded-xl overflow-hidden border border-border">
              {value.result.video_url ? (
                <video
                  src={value.result.video_url}
                  controls
                  className="w-full"
                />
              ) : (
                <div className="w-full h-48 bg-secondary flex items-center justify-center">
                  <p className="text-muted-foreground text-sm">Video no disponible</p>
                </div>
              )}
              <div className="p-3 bg-card">
                <p className="text-xs text-muted-foreground">
                  Prompt: {value.result.prompt || 'Sin prompt'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Duration: {value.result.duration}s | Aspect: {value.result.aspect_ratio}
                </p>
              </div>
            </div>
          )
        }
      }
    }

    // Fallback: show raw data
    return (
      <pre className="text-xs bg-background p-4 rounded-xl overflow-auto max-h-64">
        {JSON.stringify(previewData, null, 2)}
      </pre>
    )
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Cargando aprobaciones pendientes...
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
          Aprobaciones
        </p>
        <h1 className="mt-3 text-3xl font-black text-foreground">
          Aprobaciones Pendientes
        </h1>
        <p className="mt-2 text-muted-foreground">
          Revisa los resultados generados y aprueba o rechaza para continuar
        </p>
      </div>

      {approvals.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Check className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <p className="text-foreground font-medium">
            No hay aprobaciones pendientes
          </p>
          <p className="text-muted-foreground mt-2">
            Todos los pipelines están en marcha o completados
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {approvals.map((approval) => (
            <div
              key={approval.id}
              className="rounded-2xl border border-border bg-card p-6 transition hover:border-accent cursor-pointer"
              onClick={() => setSelectedApproval(approval)}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
                    {approval.node_id}
                  </p>
                  <h3 className="text-lg font-semibold text-foreground mt-1">
                    Job #{approval.job_id}
                  </h3>
                </div>
                <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
                  Pendiente
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span>Click para ver detalles</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approval Modal */}
      {selectedApproval && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
                    Aprobación requerida
                  </p>
                  <h3 className="text-xl font-bold text-foreground">
                    Job #{selectedApproval.job_id} - Nodo {selectedApproval.node_id}
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setSelectedApproval(null)
                    setComment('')
                  }}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-foreground mb-3">
                  Vista previa
                </h4>
                {getPreviewContent(selectedApproval)}
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Comentarios (opcional)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[100px]"
                  placeholder="Añade comentarios para el equipo..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => decideApproval(selectedApproval.id, false)}
                  disabled={isSubmitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-6 py-3 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Rechazar
                </button>
                <button
                  onClick={() => decideApproval(selectedApproval.id, true)}
                  disabled={isSubmitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:bg-secondary disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Aprobar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
