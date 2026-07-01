import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProjects, createProject, deleteProject } from '../api'
import Modal from '../components/Modal'

export default function ProjectsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', date: '', description: '' })

  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects })

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: () => { qc.invalidateQueries(['projects']); setShowCreate(false); setForm({ name: '', date: '', description: '' }) },
  })

  const remove = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => qc.invalidateQueries(['projects']),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    create.mutate({ name: form.name, date: form.date || null, description: form.description || null })
  }

  return (
    <div>
      <div className="page-header">
        <h1>Projects</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Project</button>
      </div>

      {isLoading && <p className="muted">Loading...</p>}

      <div className="card-grid">
        {projects.map(p => (
          <div key={p.id} className="card" onClick={() => navigate(`/projects/${p.id}`)}>
            <div className="card-content">
              <h3 className="card-title">{p.name}</h3>
              {p.date && <p className="muted">{p.date}</p>}
              {p.description && <p className="card-desc">{p.description}</p>}
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={e => { e.stopPropagation(); if (confirm(`Delete "${p.name}"?`)) remove.mutate(p.id) }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {projects.length === 0 && !isLoading && (
        <p className="empty">No projects yet. Create one to get started.</p>
      )}

      {showCreate && (
        <Modal title="New Project" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleSubmit} className="form">
            <label className="form-label">Name *
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </label>
            <label className="form-label">Date
              <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </label>
            <label className="form-label">Description
              <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </label>
            {create.isError && (
              <p className="error-msg">
                {typeof create.error?.response?.data?.detail === 'string'
                  ? create.error.response.data.detail
                  : JSON.stringify(create.error?.response?.data?.detail) ?? 'Something went wrong'}
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                {create.isPending ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
