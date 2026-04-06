import { create } from 'zustand'
import type { Node, Edge } from '@reactflow/core'
import { pipelinesApi, nodesApi } from '../lib/api'

export interface PipelineNodeData {
  nodeType: string
  config: Record<string, any>
  label: string
}

export type PipelineNode = Node<PipelineNodeData>
export type PipelineEdge = Edge

interface PipelineState {
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  selectedNode: string | null
  nodeTypes: any[]
  isLoading: boolean
  error: string | null

  // Actions
  setNodes: (nodes: PipelineNode[]) => void
  setEdges: (edges: PipelineEdge[]) => void
  addNode: (node: PipelineNode) => void
  updateNode: (id: string, data: Partial<PipelineNode>) => void
  removeNode: (id: string) => void
  addEdge: (edge: PipelineEdge) => void
  removeEdge: (id: string) => void
  setSelectedNode: (id: string | null) => void
  loadNodeTypes: () => Promise<void>
  clear: () => void
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,
  nodeTypes: [],
  isLoading: false,
  error: null,

  setNodes: (nodes) => set({ nodes }),

  setEdges: (edges) => set({ edges }),

  addNode: (node) =>
    set((state) => ({ nodes: [...state.nodes, node] })),

  updateNode: (id, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, ...data } : n)),
    })),

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter(
        (e) => e.source !== id && e.target !== id
      ),
    })),

  addEdge: (edge) =>
    set((state) => ({ edges: [...state.edges, edge] })),

  removeEdge: (id) =>
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
    })),

  setSelectedNode: (id) => set({ selectedNode: id }),

  loadNodeTypes: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await nodesApi.list()
      set({ nodeTypes: response.data, isLoading: false })
    } catch (error: any) {
      set({
        error: error.message || 'Error loading node types',
        isLoading: false,
      })
    }
  },

  clear: () =>
    set({
      nodes: [],
      edges: [],
      selectedNode: null,
      error: null,
    }),
}))
