import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { pipelinesApi } from '../lib/api'
import { Workflow, Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface Pipeline {
  id: number
  name: string
  description: string | null
  version: string
  is_active: boolean
  requires_approval: boolean
  node_count: number
  created_at: string
}

export function PipelineList() {
  const navigate = useNavigate()
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newPipelineName, setNewPipelineName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    loadPipelines()
  }, [])

  const loadPipelines = async () => {
    try {
      const response = await pipelinesApi.list()
      setPipelines(response.data)
    } catch (error) {
      console.error('Error loading pipelines:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const createPipeline = async () => {
    if (!newPipelineName.trim()) return

    setIsCreating(true)
    setCreateError('')

    try {
      const response = await pipelinesApi.create({ name: newPipelineName })
      setNewPipelineName('')
      setShowCreateModal(false)
      navigate(`/pipelines/${response.data.id}`)
    } catch (error: any) {
      console.error('Error creating pipeline:', error)
      setCreateError(error.response?.data?.detail || 'Error al crear pipeline')
    } finally {
      setIsCreating(false)
    }
  }

  const deletePipeline = async (id: number) => {
    if (!confirm('¿Seguro que quieres eliminar este pipeline?')) return

    try {
      await pipelinesApi.delete(id)
      loadPipelines()
    } catch (error) {
      console.error('Error deleting pipeline:', error)
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
            Pipelines
          </p>
          <h1 className="mt-3 text-3xl font-black text-foreground">
            Tus pipelines
          </h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:bg-secondary"
        >
          <Plus className="h-4 w-4" />
          Nuevo pipeline
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Cargando pipelines...
        </div>
      ) : pipelines.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Workflow className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium">
            No tienes pipelines creados
          </p>
          <p className="text-muted-foreground mt-2">
            Crea tu primer pipeline para empezar a generar contenido con AI
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pipelines.map((pipeline) => (
            <div
              key={pipeline.id}
              className="group rounded-2xl border border-border bg-card p-6 transition hover:border-accent"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {pipeline.name}
                  </h3>
                  {pipeline.description && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {pipeline.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    deletePipeline(pipeline.id)
                  }}
                  className="text-muted-foreground hover:text-destructive transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Workflow className="h-3 w-3" />
                  {pipeline.node_count} nodos
                </span>
                <span>v{pipeline.version}</span>
              </div>

              <div className="mt-4 flex items-center justify-between">
                {pipeline.requires_approval && (
                  <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] font-medium text-accent">
                    Requiere aprobación
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {format(new Date(pipeline.created_at), 'd MMM yyyy', { locale: es })}
                </span>
              </div>

              <Link
                to={`/pipelines/${pipeline.id}`}
                className="mt-4 block text-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent hover:text-accent"
              >
                Editar pipeline
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6">
            <h3 className="text-xl font-bold text-foreground mb-4">
              Nuevo pipeline
            </h3>

            {createError && (
              <div className="mb-4 rounded-xl border border-rose-800/50 bg-rose-950/30 p-3 text-sm text-rose-400">
                {createError}
              </div>
            )}

            <input
              type="text"
              value={newPipelineName}
              onChange={(e) => {
                setNewPipelineName(e.target.value)
                setCreateError('')
              }}
              placeholder="Nombre del pipeline"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && createPipeline()}
            />
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setNewPipelineName('')
                  setCreateError('')
                }}
                disabled={isCreating}
                className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition hover:bg-secondary disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={createPipeline}
                disabled={isCreating || !newPipelineName.trim()}
                className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
