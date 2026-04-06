import { useState } from 'react'
import { usePipelineStore } from '../stores/pipelineStore'
import { X, Save } from 'lucide-react'

interface NodeConfigPanelProps {
  nodeId: string
  onClose: () => void
}

export function NodeConfigPanel({ nodeId, onClose }: NodeConfigPanelProps) {
  const { nodes, updateNode, removeNode } = usePipelineStore()
  const node = nodes.find((n) => n.id === nodeId)

  const [config, setConfig] = useState<Record<string, any>>(
    node?.data?.config || {}
  )

  if (!node) return null

  const handleSave = () => {
    updateNode(nodeId, {
      data: { ...node.data, config },
    })
    onClose()
  }

  const handleDelete = () => {
    removeNode(nodeId)
    onClose()
  }

  const renderConfigFields = () => {
    const nodeType = node.data.nodeType

    switch (nodeType) {
      case 'nano_banana_pro':
        return (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Modelo
              </label>
              <select
                value={config.model || 'nano-banana-pro'}
                onChange={(e) =>
                  setConfig({ ...config, model: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
              >
                <option value="nano-banana-pro">Nano Banana Pro</option>
                <option value="nano-banana-2">Nano Banana 2</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Prompt *
              </label>
              <textarea
                value={config.prompt || ''}
                onChange={(e) =>
                  setConfig({ ...config, prompt: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[100px]"
                placeholder="Describe la imagen que quieres generar..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Negative prompt
              </label>
              <textarea
                value={config.negative_prompt || ''}
                onChange={(e) =>
                  setConfig({ ...config, negative_prompt: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[80px]"
                placeholder="Lo que quieres evitar en la imagen..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Aspect ratio
                </label>
                <select
                  value={config.aspect_ratio || '16:9'}
                  onChange={(e) =>
                    setConfig({ ...config, aspect_ratio: e.target.value })
                  }
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                  <option value="4:3">4:3</option>
                  <option value="3:4">3:4</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Calidad
                </label>
                <select
                  value={config.image_quality || '1K'}
                  onChange={(e) =>
                    setConfig({ ...config, image_quality: e.target.value })
                  }
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="1K">1K (4 créditos)</option>
                  <option value="2K">2K (8 créditos)</option>
                  <option value="4K">4K (16 créditos)</option>
                </select>
              </div>
            </div>
            <div className="p-3 rounded-xl border border-amber-800/50 bg-amber-950/30">
              <p className="text-xs text-amber-400">
                <strong>Nota:</strong> Para usar imágenes de referencia, conecta nodos anteriores a las entradas de imagen (hasta 14 imágenes soportadas).
              </p>
            </div>
          </>
        )

      case 'gemini_image':
        return (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Prompt *
              </label>
              <textarea
                value={config.prompt || ''}
                onChange={(e) =>
                  setConfig({ ...config, prompt: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[100px]"
                placeholder="Describe la imagen que quieres generar..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Negative prompt
              </label>
              <textarea
                value={config.negative_prompt || ''}
                onChange={(e) =>
                  setConfig({ ...config, negative_prompt: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[80px]"
                placeholder="Lo que quieres evitar en la imagen..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Aspect ratio
                </label>
                <select
                  value={config.aspect_ratio || '1:1'}
                  onChange={(e) =>
                    setConfig({ ...config, aspect_ratio: e.target.value })
                  }
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="1:1">1:1 (Square)</option>
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                  <option value="4:3">4:3</option>
                  <option value="3:4">3:4</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Num images
                </label>
                <input
                  type="number"
                  min="1"
                  max="4"
                  value={config.num_images || 1}
                  onChange={(e) =>
                    setConfig({ ...config, num_images: parseInt(e.target.value) })
                  }
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </>
        )

      case 'kling_video':
        return (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Modelo
              </label>
              <select
                value={config.model || 'kling'}
                onChange={(e) =>
                  setConfig({ ...config, model: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
              >
                <option value="kling">Kling</option>
                <option value="sora2">Sora 2</option>
                <option value="wan">Wan</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Prompt *
              </label>
              <textarea
                value={config.prompt || ''}
                onChange={(e) =>
                  setConfig({ ...config, prompt: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[100px]"
                placeholder="Describe el video que quieres generar..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Duration (sec)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={config.duration || 5}
                  onChange={(e) =>
                    setConfig({ ...config, duration: parseInt(e.target.value) })
                  }
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Aspect ratio
                </label>
                <select
                  value={config.aspect_ratio || '16:9'}
                  onChange={(e) =>
                    setConfig({ ...config, aspect_ratio: e.target.value })
                  }
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                </select>
              </div>
            </div>
            <div className="p-3 rounded-xl border border-indigo-800/50 bg-indigo-950/30">
              <p className="text-xs text-indigo-400">
                <strong>Nota:</strong> Para usar imagen de referencia, conecta un nodo de imagen anterior a la entrada de imagen.
              </p>
            </div>
          </>
        )

      case 'approval':
        return (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Instruction
              </label>
              <textarea
                value={config.instruction || ''}
                onChange={(e) =>
                  setConfig({ ...config, instruction: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[80px]"
                placeholder="Instrucciones para el aprobador..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Required role
              </label>
              <select
                value={config.required_role || 'any'}
                onChange={(e) =>
                  setConfig({ ...config, required_role: e.target.value })
                }
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
              >
                <option value="any">Cualquier usuario</option>
                <option value="admin">Solo admin</option>
                <option value="creator">Solo creador</option>
              </select>
            </div>
          </>
        )

      default:
        return (
          <p className="text-sm text-muted-foreground">
            Sin configuración específica para este tipo de nodo.
          </p>
        )
    }
  }

  return (
    <div className="fixed right-0 top-0 h-screen w-96 bg-card border-l border-border shadow-2xl overflow-y-auto">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground">
              {node.data.nodeType}
            </p>
            <h3 className="text-lg font-semibold text-foreground">
              {node.data.label}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {renderConfigFields()}
      </div>

      <div className="p-6 border-t border-border flex gap-3">
        <button
          onClick={handleDelete}
          className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-destructive transition hover:bg-destructive/10"
        >
          Eliminar
        </button>
        <button
          onClick={handleSave}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition hover:bg-secondary"
        >
          <Save className="h-4 w-4" />
          Guardar
        </button>
      </div>
    </div>
  )
}
