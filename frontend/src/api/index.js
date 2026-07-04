import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('crm_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Projects
export const getProjects = () => api.get('/api/projects').then(r => r.data)
export const getProject = (id) => api.get(`/api/projects/${id}`).then(r => r.data)
export const createProject = (data) => api.post('/api/projects', data).then(r => r.data)
export const updateProject = (id, data) => api.patch(`/api/projects/${id}`, data).then(r => r.data)
export const deleteProject = (id) => api.delete(`/api/projects/${id}`)

// Categories
export const getCategories = (projectId) => api.get(`/api/projects/${projectId}/categories`).then(r => r.data)
export const createCategory = (projectId, data) => api.post(`/api/projects/${projectId}/categories`, data).then(r => r.data)
export const updateCategory = (projectId, id, data) => api.patch(`/api/projects/${projectId}/categories/${id}`, data).then(r => r.data)
export const deleteCategory = (projectId, id) => api.delete(`/api/projects/${projectId}/categories/${id}`)

// Organizations
export const getOrgs = (categoryId) => api.get(`/api/categories/${categoryId}/organizations`).then(r => r.data)
export const createOrg = (categoryId, data) => api.post(`/api/categories/${categoryId}/organizations`, data).then(r => r.data)
export const updateOrg = (categoryId, orgId, data) => api.patch(`/api/categories/${categoryId}/organizations/${orgId}`, data).then(r => r.data)
export const deleteOrg = (categoryId, orgId) => api.delete(`/api/categories/${categoryId}/organizations/${orgId}`)

// People
export const addPerson = (orgId, data) => api.post(`/api/organizations/${orgId}/people`, data).then(r => r.data)
export const updatePerson = (orgId, personId, data) => api.patch(`/api/organizations/${orgId}/people/${personId}`, data).then(r => r.data)
export const deletePerson = (orgId, personId) => api.delete(`/api/organizations/${orgId}/people/${personId}`)

// Threads
export const startEmail = (orgId, data) => api.post(`/api/organizations/${orgId}/threads/start-email`, data).then(r => r.data)
export const linkThread = (orgId, data) => api.post(`/api/organizations/${orgId}/threads/link`, data).then(r => r.data)
export const getThreadMessages = (orgId, threadId) => api.get(`/api/organizations/${orgId}/threads/${threadId}/messages`).then(r => r.data)
export const replyToThread = (orgId, threadId, data) => api.post(`/api/organizations/${orgId}/threads/${threadId}/reply`, data).then(r => r.data)

// Email Templates
export const getTemplates = () => api.get('/api/email-templates').then(r => r.data)
export const createTemplate = (data) => api.post('/api/email-templates', data).then(r => r.data)
export const updateTemplate = (id, data) => api.patch(`/api/email-templates/${id}`, data).then(r => r.data)
export const deleteTemplate = (id) => api.delete(`/api/email-templates/${id}`)

// Gmail
export const searchThreads = (email) => api.get('/api/gmail/search-threads', { params: { email } }).then(r => r.data)
export const postGmailImport = (projectId, categoryId, data) => api.post(`/api/projects/${projectId}/categories/${categoryId}/gmail-import`, data).then(r => r.data)

// Auth
export const getAuthStatus = () => api.get('/api/auth/status').then(r => r.data)
export const getGoogleAuthUrl = () => api.get('/api/auth/google').then(r => r.data)
export const disconnectGoogle = () => api.delete('/api/auth/google')
