import { useEffect, useState } from 'react'
import { jobsApi } from '../lib/api'
import { Play, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Job {
  id: number
  pipeline_id: number
  name: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

const statusIcons: Record<string, any> = {
  pending: Clock,
  queued: Clock,
  running: Play,
  waiting_approval: AlertCircle,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: XCircle,
}

const statusColors: Record<string, string> = {
  pending: 'border-zinc-500/50 bg-zinc-500/10 text-zinc-400',
  queued: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
  running: 'border-purple-500/50 bg-purple-500/10 text-purple-400',
  waiting_approval: 'border-amber-500/50 bg-amber-500/10 text-amber-400',
  completed: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400',
  failed: 'border-rose-500/50 bg-rose-500/10 text-rose-400',
  cancelled: 'border-zinc-500/50 bg-zinc-500/10 text-zinc-400',
}

export function JobsList() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadJobs()
  }, [statusFilter])

  const loadJobs = async () => {
    setIsLoading(true)
    try {
      const response = await jobsApi.list(statusFilter !== 'all' ? statusFilter : undefined)
      setJobs(response.data)
    } catch (error) {
      console.error('Error loading jobs:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const cancelJob = async (jobId: number) => {
    if (!confirm('¿Cancelar este job?')) return

    try {
      await jobsApi.cancel(jobId)
      loadJobs()
    } catch (error) {
      console.error('Error cancelling job:', error)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
            Jobs
          </p>
          <h1 className="mt-3 text-3xl font-black text-foreground">
            Ejecuciones
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm text-foreground focus:border-accent focus:outline-none"
          >
            <option value="all">Todos</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Cargando jobs...
        </div>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium">
            No hay ejecuciones
          </p>
          <p className="text-muted-foreground mt-2">
            Ejecuta un pipeline para ver su progreso aquí
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const Icon = statusIcons[job.status] || Clock
            const colorClass = statusColors[job.status] || statusColors.pending

            return (
              <div
                key={job.id}
                className="rounded-2xl border border-border bg-card p-6 transition hover:border-accent/50"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-foreground">
                        {job.name}
                      </h3>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${colorClass}`}
                      >
                        <Icon className="h-3 w-3" />
                        {job.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-6 text-sm">
                      <div>
                        <p className="text-muted-foreground">Creado</p>
                        <p className="text-foreground font-medium">
                          {format(new Date(job.created_at), 'd MMM yyyy HH:mm', { locale: es })}
                        </p>
                      </div>
                      {job.started_at && (
                        <div>
                          <p className="text-muted-foreground">Iniciado</p>
                          <p className="text-foreground font-medium">
                            {format(new Date(job.started_at), 'd MMM yyyy HH:mm', { locale: es })}
                          </p>
                        </div>
                      )}
                      {job.completed_at && (
                        <div>
                          <p className="text-muted-foreground">Completado</p>
                          <p className="text-foreground font-medium">
                            {format(new Date(job.completed_at), 'd MMM yyyy HH:mm', { locale: es })}
                          </p>
                        </div>
                      )}
                    </div>

                    {job.error_message && (
                      <div className="mt-4 rounded-xl border border-rose-800/50 bg-rose-950/30 p-3 text-sm text-rose-400">
                        {job.error_message}
                      </div>
                    )}
                  </div>

                  {(job.status === 'pending' || job.status === 'running' || job.status === 'queued') && (
                    <button
                      onClick={() => cancelJob(job.id)}
                      className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
