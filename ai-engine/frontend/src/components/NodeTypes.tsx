import { Handle, Position, NodeProps } from 'reactflow'
import { Image, Video, UserCheck, Type, Layers, Send } from 'lucide-react'

const nodeTypeIcons: Record<string, any> = {
  gemini_image: Image,
  nano_banana_pro: Image,
  kling_video: Video,
  approval: UserCheck,
  text_transform: Type,
  image_merge: Layers,
  output: Send,
}

const nodeTypeColors: Record<string, string> = {
  gemini_image: 'border-pink-500/50 bg-pink-500/10',
  nano_banana_pro: 'border-rose-500/50 bg-rose-500/10',
  kling_video: 'border-indigo-500/50 bg-indigo-500/10',
  approval: 'border-amber-500/50 bg-amber-500/10',
  text_transform: 'border-blue-500/50 bg-blue-500/10',
  image_merge: 'border-green-500/50 bg-green-500/10',
  output: 'border-emerald-500/50 bg-emerald-500/10',
}

function CustomNode({ id, data, selected }: NodeProps) {
  const Icon = nodeTypeIcons[data.nodeType] || Image
  const colorClass = nodeTypeColors[data.nodeType] || 'border-zinc-500/50 bg-zinc-500/10'

  return (
    <div
      className={`min-w-[200px] rounded-xl border-2 p-4 ${colorClass} ${
        selected ? 'ring-2 ring-accent' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-background flex items-center justify-center">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">
            {data.label}
          </p>
          <p className="text-xs text-muted-foreground">
            {data.nodeType}
          </p>
        </div>
      </div>

      {data.config?.prompt && (
        <p className="mt-3 text-xs text-muted-foreground line-clamp-2">
          {data.config.prompt}
        </p>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-foreground !border-0"
      />

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-foreground !border-0"
      />
    </div>
  )
}

export const NodeTypes = {
  gemini_image: CustomNode,
  nano_banana_pro: CustomNode,
  kling_video: CustomNode,
  approval: CustomNode,
  text_transform: CustomNode,
  image_merge: CustomNode,
  output: CustomNode,
}
