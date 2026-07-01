import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

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

// Contacts
export const getContacts = (categoryId) => api.get(`/api/categories/${categoryId}/contacts`).then(r => r.data)
export const createContact = (categoryId, data) => api.post(`/api/categories/${categoryId}/contacts`, data).then(r => r.data)
export const updateContact = (categoryId, id, data) => api.patch(`/api/categories/${categoryId}/contacts/${id}`, data).then(r => r.data)
export const deleteContact = (categoryId, id) => api.delete(`/api/categories/${categoryId}/contacts/${id}`)

// Email Templates
export const getTemplates = () => api.get('/api/email-templates').then(r => r.data)
export const createTemplate = (data) => api.post('/api/email-templates', data).then(r => r.data)
export const updateTemplate = (id, data) => api.patch(`/api/email-templates/${id}`, data).then(r => r.data)
export const deleteTemplate = (id) => api.delete(`/api/email-templates/${id}`)

// Email
export const sendEmail = (contactId, data) => api.post(`/api/contacts/${contactId}/send-email`, data).then(r => r.data)
export const getEmailLogs = (contactId) => api.get(`/api/contacts/${contactId}/email-logs`).then(r => r.data)

// Auth
export const getAuthStatus = () => api.get('/api/auth/status').then(r => r.data)
export const getGoogleAuthUrl = () => api.get('/api/auth/google').then(r => r.data)
export const disconnectGoogle = () => api.delete('/api/auth/google')
