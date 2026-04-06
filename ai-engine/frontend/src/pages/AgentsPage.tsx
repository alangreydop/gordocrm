import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Layout } from '../components/Layout'
import { Bot, Plus, MessageSquare, Trash2, Edit, Settings, Sparkles } from 'lucide-react'

interface AIAgent {
  id: number
  name: string
  description: string | null
  system_prompt: string
  model: string
  temperature: number
  max_tokens: number
  available_tools: string[]
  is_active: boolean
  created_at: string
}

interface Conversation {
  id: number
  agent_id: number
  user_id: number
  title: string
  created_at: string
  updated_at: string
}

const DEFAULT_AGENTS = [
  {
    name: 'Pipeline Assistant',
    description: 'Asistente para gestión de pipelines y jobs',
    system_prompt: `Eres un asistente especializado en gestión de pipelines de AI.
Puedes ayudar a:
- Crear y configurar pipelines
- Monitorear jobs en ejecución
- Diagnosticar errores
- Sugerir mejoras en la configuración

Responde de forma concisa y técnica. Usa @mentions para referirte a jobs o pipelines específicos.`,
    model: 'gemini-2.5-pro',
    temperature: 50,
  },
  {
    name: 'Creative Director',
    description: 'Director creativo para generación de contenido',
    system_prompt: `Eres un director creativo experto en generación de contenido con AI.
Puedes ayudar a:
- Escribir prompts efectivos para Nano Banana Pro
- Sugerir composiciones visuales
- Optimizar parámetros de generación
- Revisar y criticar resultados

Responde de forma inspiradora pero práctica. Incluye ejemplos concretos.`,
    model: 'gemini-2.5-pro',
    temperature: 80,
  },
  {
    name: 'Data Analyst',
    description: 'Analista de datos y métricas',
    system_prompt: `Eres un analista de datos especializado en métricas de pipelines AI.
Puedes ayudar a:
- Analizar rendimiento de pipelines
- Identificar cuellos de botella
- Sugerir optimizaciones de costo
- Generar reportes de uso

Responde con datos concretos y recomendaciones accionables.`,
    model: 'gemini-2.5-pro',
    temperature: 40,
  },
]

export function AgentsPage() {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingAgent, setEditingAgent] = useState<AIAgent | null>(null)
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_prompt: '',
    model: 'gemini-2.5-pro',
    temperature: 70,
  })

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation.id)
    }
  }, [activeConversation])

  const loadAgents = async () => {
    try {
      const response = await api.get('/agents')
      setAgents(response.data)
      if (response.data.length === 0) {
        // Crear agentes por defecto
        await createDefaultAgents()
      }
    } catch (error) {
      console.error('Error loading agents:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const createDefaultAgents = async () => {
    try {
      for (const agentConfig of DEFAULT_AGENTS) {
        await api.post('/agents', agentConfig)
      }
      loadAgents()
    } catch (error) {
      console.error('Error creating default agents:', error)
    }
  }

  const loadConversations = async (agentId: number) => {
    try {
      const response = await api.get(`/agents/conversations?agent_id=${agentId}`)
      return response.data
    } catch (error) {
      console.error('Error loading conversations:', error)
      return []
    }
  }

  const loadMessages = async (conversationId: number) => {
    try {
      const response = await api.get(`/agents/conversations/${conversationId}/messages`)
      setMessages(response.data)
    } catch (error) {
      console.error('Error loading messages:', error)
      setMessages([])
    }
  }

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingAgent) {
        await api.put(`/agents/${editingAgent.id}`, formData)
      } else {
        await api.post('/agents', formData)
      }
      setShowModal(false)
      setEditingAgent(null)
      setFormData({ name: '', description: '', system_prompt: '', model: 'gemini-2.5-pro', temperature: 70 })
      loadAgents()
    } catch (error) {
      console.error('Error saving agent:', error)
      alert('Error guardando agente')
    }
  }

  const handleDeleteAgent = async (id: number) => {
    if (!confirm('¿Seguro que quieres eliminar este agente?')) return
    try {
      await api.delete(`/agents/${id}`)
      loadAgents()
    } catch (error) {
      console.error('Error deleting agent:', error)
    }
  }

  const handleEditAgent = (agent: AIAgent) => {
    setEditingAgent(agent)
    setFormData({
      name: agent.name,
      description: agent.description || '',
      system_prompt: agent.system_prompt,
      model: agent.model,
      temperature: agent.temperature,
    })
    setShowModal(true)
  }

  const handleOpenConversation = async (agent: AIAgent) => {
    try {
      // Crear o buscar conversación
      const response = await api.post('/agents/conversations', {
        agent_id: agent.id,
        title: `Conversación con ${agent.name}`,
      })
      setActiveConversation(response.data)
      setMessages([])
    } catch (error) {
      console.error('Error opening conversation:', error)
    }
  }

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !activeConversation) return

    setIsSending(true)
    try {
      const response = await api.post(`/agents/conversations/${activeConversation.id}/messages`, {
        content: messageInput,
      })

      // Agregar mensajes a la lista
      setMessages(prev => [
        ...prev,
        {
          id: Date.now(),
          role: 'user',
          content: messageInput,
          created_at: new Date().toISOString(),
        },
        response.data.assistant_message,
      ])
      setMessageInput('')
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Error enviando mensaje')
    } finally {
      setIsSending(false)
    }
  }

  const closeChat = () => {
    setActiveConversation(null)
    setMessages([])
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
              AI Agents
            </p>
            <h1 className="mt-3 text-3xl font-black text-foreground">
              Agentes de IA
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
              Agentes de IA especializados para ayudarte con pipelines, creación de contenido y análisis de datos.
              Usa @mentions para referirte a jobs, pipelines o usuarios específicos.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingAgent(null)
              setFormData({ name: '', description: '', system_prompt: '', model: 'gemini-2.5-pro', temperature: 70 })
              setShowModal(true)
            }}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:bg-secondary"
          >
            <Plus className="h-4 w-4" />
            Nuevo agente
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            Cargando agentes...
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium">
              No tienes agentes configurados
            </p>
            <p className="text-muted-foreground mt-2">
              Crea tu primer agente o usa los templates predefinidos
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-2xl border border-border bg-card p-6 transition hover:border-accent"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {agent.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {agent.model}
                      </p>
                    </div>
                  </div>
                  {agent.is_active ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/50 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                      Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-800/50 bg-zinc-950/30 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                      Inactivo
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                  {agent.description}
                </p>

                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Temperature: {agent.temperature}%
                  </span>
                </div>

                {agent.available_tools && agent.available_tools.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {agent.available_tools.map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground"
                      >
                        <Sparkles className="h-3 w-3" />
                        {tool}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => handleOpenConversation(agent)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-secondary"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Chatear
                  </button>
                  <button
                    onClick={() => handleEditAgent(agent)}
                    className="p-2 text-muted-foreground hover:text-foreground transition"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteAgent(agent.id)}
                    className="p-2 text-muted-foreground hover:text-destructive transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chat Panel */}
        {activeConversation && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-border bg-card flex flex-col max-h-[80vh]">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {messages.length > 0 ? 'Conversación' : 'Nueva conversación'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Usa @job#, @pipeline# o @usuario para mencionar
                  </p>
                </div>
                <button
                  onClick={closeChat}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-foreground'
                      }`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="flex items-center gap-2 mb-1">
                          <Bot className="h-3 w-3" />
                          <span className="text-xs font-medium">AI Agent</span>
                        </div>
                      )}
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      {msg.mentions && msg.mentions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {msg.mentions.map((mention: any, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 rounded-md bg-accent/20 px-2 py-0.5 text-[10px] text-accent-foreground"
                            >
                              {mention.type === 'user' && '@'}
                              {mention.type === 'job' && 'Job #'}
                              {mention.type === 'pipeline' && 'Pipeline #'}
                              {mention.display || mention.id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 border-t border-border">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Escribe tu mensaje... usa @ para mencionar"
                    className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isSending || !messageInput.trim()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition hover:bg-secondary disabled:opacity-50"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-bold text-foreground mb-4">
                {editingAgent ? 'Editar Agente' : 'Nuevo Agente'}
              </h3>

              <form onSubmit={handleCreateAgent} className="space-y-4">
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
                    placeholder="Ej: Pipeline Assistant"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Descripción
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[60px]"
                    placeholder="Descripción del propósito del agente..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    System Prompt *
                  </label>
                  <textarea
                    value={formData.system_prompt}
                    onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                    required
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder-muted-foreground/50 focus:border-accent focus:outline-none min-h-[150px]"
                    placeholder="Instrucciones que definen el comportamiento del agente..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Modelo
                    </label>
                    <select
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
                    >
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Temperatura
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.temperature}
                      onChange={(e) => setFormData({ ...formData, temperature: parseInt(e.target.value) })}
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground focus:border-accent focus:outline-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      0 = determinista, 100 = creativo
                    </p>
                  </div>
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
                    {editingAgent ? 'Actualizar' : 'Crear'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
