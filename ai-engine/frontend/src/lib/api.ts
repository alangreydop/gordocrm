import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor para añadir token - usa 'auth_token' para consistencia
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor para manejar errores auth
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      // Solo redirigir si no estamos ya en login
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth endpoints
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, fullName: string) =>
    api.post('/auth/register', { email, password, full_name: fullName }),
  me: () => api.get('/auth/me'),
}

// Pipeline endpoints
export const pipelinesApi = {
  list: () => api.get('/pipelines'),
  get: (id: number) => api.get(`/pipelines/${id}`),
  create: (data: { name: string; description?: string }) =>
    api.post('/pipelines', data),
  update: (id: number, data: Partial<{ name: string; description: string }>) =>
    api.put(`/pipelines/${id}`, data),
  delete: (id: number) => api.delete(`/pipelines/${id}`),
  addNode: (pipelineId: number, node: any) =>
    api.post(`/pipelines/${pipelineId}/nodes`, node),
  addEdge: (pipelineId: number, edge: any) =>
    api.post(`/pipelines/${pipelineId}/edges`, edge),
}

// Jobs endpoints
export const jobsApi = {
  list: (statusFilter?: string) =>
    api.get('/jobs', { params: { status_filter: statusFilter } }),
  get: (id: number) => api.get(`/jobs/${id}`),
  create: (data: { pipeline_id: number; name: string; input_data?: any }) =>
    api.post('/jobs', data),
  cancel: (id: number) => api.post(`/jobs/${id}/cancel`),
  getApprovals: (jobId: number) => api.get(`/jobs/${jobId}/approvals`),
  decideApproval: (approvalId: number, approved: boolean, comments?: string) =>
    api.post(`/jobs/approvals/${approvalId}/decide`, { approved, comments }),
}

// Nodes endpoints
export const nodesApi = {
  list: () => api.get('/nodes'),
  get: (type: string) => api.get(`/nodes/${type}`),
  getByCategory: (category: string) => api.get(`/nodes/categories/${category}`),
}
