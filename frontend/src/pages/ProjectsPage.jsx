import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProjects, createProject, updateProject, deleteProject } from '../api'
import Modal from '../components/Modal'

const emptyForm = { name: '', date: '', description: '' }

export default function ProjectsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: getProjects })

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: () => { qc.invalidateQueries(['projects']); setShowCreate(false); setForm(emptyForm) },
  })

  const update = useMutation({
    mutationFn: ({ id, data }) => updateProject(id, data),
    onSuccess: () => { qc.invalidateQueries(['projects']); setEditing(null) },
  })

  const remove = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => qc.invalidateQueries(['projects']),
  })

  const openEdit = (e, p) => {
    e.stopPropagation()
    setForm({ name: p.name, date: p.date ?? '', description: p.description ?? '' })
    setEditing(p)
  }

  const handleCreate = (e) => {
    e.preventDefault()
    create.mutate({ name: form.name, date: form.date || null, description: form.description || null })
  }

  const handleUpdate = (e) => {
    e.preventDefault()
    update.mutate({ id: editing.id, data: { name: form.name, date: form.date || null, description: form.description || null } })
  }

  return (
    <div>
      <div className="page-header">
        <h1>Projects</h1>
        <button className="btn btn-primary" onClick={() => { setForm(emptyForm); setShowCreate(true) }}>+ New Project</button>
      </div>

      {isLoading && <p className="muted">Loading...</p>}

      <div className="card-grid">
        {projects.map(p => (
          <div key={p.id} className="card" onClick={() => navigate(`/projects/${p.id}`)}>
            <div className="card-content">
              <h3 className="card-title">{p.name}</h3>
              {p.date && <p className="muted card-date">{p.date}</p>}
              {p.description && <p className="card-desc">{p.description}</p>}
            </div>
            <div className="card-actions">
              <button className="btn btn-ghost btn-sm" onClick={e => openEdit(e, p)}>Edit</button>
              <button
                className="btn btn-danger btn-sm"
                onClick={e => { e.stopPropagation(); if (confirm(`Delete "${p.name}"?`)) remove.mutate(p.id) }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {projects.length === 0 && !isLoading && (
        <p className="empty">No projects yet. Create one to get started.</p>
      )}

      {(showCreate || editing) && (
        <Modal title={editing ? 'Edit Project' : 'New Project'} onClose={() => { setShowCreate(false); setEditing(null) }}>
          <form onSubmit={editing ? handleUpdate : handleCreate} className="form">
            <label className="form-label">Name *
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </label>
            <label className="form-label">Date
              <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </label>
            <label className="form-label">Description
              <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </label>
            {(create.isError || update.isError) && (
              <p className="error-msg">
                {(() => {
                  const detail = (create.error || update.error)?.response?.data?.detail
                  return typeof detail === 'string' ? detail : 'Something went wrong'
                })()}
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => { setShowCreate(false); setEditing(null) }}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={create.isPending || update.isPending}>
                {create.isPending || update.isPending ? 'Saving...' : editing ? 'Save' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
