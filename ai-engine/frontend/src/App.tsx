import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { PipelineEditor } from './components/PipelineEditor'
import { PipelineList } from './components/PipelineList'
import { JobsList } from './components/JobsList'
import { ApprovalPanel } from './components/ApprovalPanel'
import { LoginPage } from './components/LoginPage'
import { WebhooksPage } from './pages/WebhooksPage'
import { AgentsPage } from './pages/AgentsPage'
import { useAuthStore } from './stores/useAuthStore'

function AppContent() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<PipelineList />} />
        <Route path="pipelines" element={<PipelineList />} />
        <Route path="pipelines/:id" element={<PipelineEditor />} />
        <Route path="jobs" element={<JobsList />} />
        <Route path="approvals" element={<ApprovalPanel />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="agents" element={<AgentsPage />} />
      </Route>
    </Routes>
  )
}

function App() {
  const { init, isLoading } = useAuthStore()
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const initialize = async () => {
      await init()
      setInitialized(true)
    }
    initialize()
  }, [])

  if (!initialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando aplicación...</p>
        </div>
      </div>
    )
  }

  return <AppContent />
}

export default App
