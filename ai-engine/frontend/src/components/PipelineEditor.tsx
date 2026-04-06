import { useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  MarkerType,
  Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { pipelinesApi } from '../lib/api'
import { usePipelineStore } from '../stores/pipelineStore'
import { Save, Play, Settings, X } from 'lucide-react'
import { NodeConfigPanel } from './NodeConfigPanel'
import { NodeTypes } from './NodeTypes'

export function PipelineEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const {
    nodes,
    edges,
    selectedNode,
    nodeTypes: availableNodeTypes,
    setNodes,
    setEdges,
    addNode: addNodeToStore,
    addEdge: addEdgeToStore,
    setSelectedNode,
    loadNodeTypes,
    clear,
  } = usePipelineStore()

  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState(nodes)
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState(edges)

  useEffect(() => {
    loadNodeTypes()
    if (id) {
      loadPipeline(id)
    }
    return () => clear()
  }, [id])

  const loadPipeline = async (pipelineId: string) => {
    try {
      const response = await pipelinesApi.get(parseInt(pipelineId))
      const graphConfig = response.data.graph_config

      if (graphConfig.nodes) {
        setNodes(graphConfig.nodes)
        setFlowNodes(graphConfig.nodes)
      }
      if (graphConfig.edges) {
        setEdges(graphConfig.edges)
        setFlowEdges(graphConfig.edges)
      }
    } catch (error) {
      console.error('Error loading pipeline:', error)
    }
  }

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `${params.source}-${params.target}`,
        type: 'default',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: 'hsl(var(--muted-foreground))', strokeWidth: 2 },
      }
      setFlowEdges((eds) => addEdge(newEdge, eds))
      addEdgeToStore(newEdge)
    },
    [setFlowEdges, addEdgeToStore]
  )

  const addNode = (nodeType: string) => {
    const nodeDef = availableNodeTypes.find((t) => t.type === nodeType)
    if (!nodeDef) return

    const newNode: Node = {
      id: `${nodeType}-${Date.now()}`,
      type: nodeType,
      position: { x: 400, y: 300 },
      data: {
        nodeType,
        label: nodeDef.name,
        config: {},
      },
      style: {
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 12,
        color: 'hsl(var(--foreground))',
        minWidth: 200,
      },
    }

    setFlowNodes((nds) => [...nds, newNode])
    addNodeToStore(newNode)
    setSelectedNode(newNode.id)
  }

  const savePipeline = async () => {
    if (!id) return

    try {
      await pipelinesApi.update(parseInt(id), {
        graph_config: { nodes: flowNodes, edges: flowEdges },
      })
      alert('Pipeline guardado correctamente')
    } catch (error) {
      console.error('Error saving pipeline:', error)
      alert('Error guardando pipeline')
    }
  }

  const runPipeline = async () => {
    if (!id) return

    const name = prompt('Nombre del job:')
    if (!name) return

    try {
      // TODO: Implementar ejecución
      alert('Pipeline encolado para ejecución')
    } catch (error) {
      console.error('Error running pipeline:', error)
      alert('Error ejecutando pipeline')
    }
  }

  return (
    <div className="h-screen w-screen">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => setSelectedNode(node.id)}
        onPaneClick={() => setSelectedNode(null)}
        nodeTypes={NodeTypes}
        fitView
        className="bg-background"
      >
        <Panel position="top-left" className="flex items-center gap-2">
          <button
            onClick={() => navigate('/pipelines')}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            onClick={savePipeline}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-secondary"
          >
            <Save className="h-4 w-4" />
            Guardar
          </button>
          <button
            onClick={runPipeline}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground transition hover:opacity-90"
          >
            <Play className="h-4 w-4" />
            Ejecutar
          </button>
        </Panel>

        <Panel position="top-right" className="flex flex-col gap-2">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-muted-foreground mb-3">
              Añadir nodo
            </p>
            <div className="space-y-2">
              {availableNodeTypes.map((nodeType) => (
                <button
                  key={nodeType.type}
                  onClick={() => addNode(nodeType.type)}
                  className="w-full text-left rounded-lg border border-border bg-background px-3 py-2 text-sm transition hover:border-accent"
                >
                  <p className="font-medium text-foreground">{nodeType.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {nodeType.category}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel position="bottom-right">
          <MiniMap
            nodeColor={(node) => {
              switch (node.data.nodeType) {
                case 'gemini_image':
                  return '#C4165A'
                case 'luma_video':
                  return '#8B5CF6'
                case 'approval':
                  return '#F59E0B'
                default:
                  return 'hsl(var(--muted-foreground))'
              }
            }}
            maskColor="rgba(0, 0, 0, 0.8)"
            className="!bg-card !border !border-border rounded-xl overflow-hidden"
          />
        </Panel>

        <Controls
          className="!bg-card !border !border-border rounded-xl overflow-hidden"
        />
        <Background color="hsl(var(--border))" gap={20} size={1} />
      </ReactFlow>

      {/* Node Config Panel */}
      {selectedNode && (
        <NodeConfigPanel nodeId={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  )
}
