import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '../api'
import Modal from '../components/Modal'

const empty = { name: '', subject: '', body: '' }

export default function TemplatesPage() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(null) // null | 'new' | template object
  const [form, setForm] = useState(empty)

  const { data: templates = [], isLoading } = useQuery({ queryKey: ['templates'], queryFn: getTemplates })

  const create = useMutation({
    mutationFn: createTemplate,
    onSuccess: () => { qc.invalidateQueries(['templates']); setEditing(null) },
  })

  const update = useMutation({
    mutationFn: ({ id, data }) => updateTemplate(id, data),
    onSuccess: () => { qc.invalidateQueries(['templates']); setEditing(null) },
  })

  const remove = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => qc.invalidateQueries(['templates']),
  })

  const openNew = () => { setForm(empty); setEditing('new') }
  const openEdit = (t) => { setForm({ name: t.name, subject: t.subject, body: t.body }); setEditing(t) }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (editing === 'new') {
      create.mutate(form)
    } else {
      update.mutate({ id: editing.id, data: form })
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Email Templates</h1>
        <button className="btn btn-primary" onClick={openNew}>+ New Template</button>
      </div>

      <p className="muted hint">Placeholders: <code>{'{{contact_name}}'}</code> <code>{'{{company_name}}'}</code> <code>{'{{project_name}}'}</code> <code>{'{{project_date}}'}</code></p>

      {isLoading && <p className="muted">Loading...</p>}

      <div className="template-list">
        {templates.map(t => (
          <div key={t.id} className="template-card">
            <div className="template-info">
              <h3>{t.name}</h3>
              <p className="muted">{t.subject}</p>
              <pre className="template-preview">{t.body}</pre>
            </div>
            <div className="template-actions">
              <button className="btn btn-sm btn-ghost" onClick={() => openEdit(t)}>Edit</button>
              <button className="btn btn-sm btn-danger" onClick={() => { if (confirm(`Delete "${t.name}"?`)) remove.mutate(t.id) }}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && !isLoading && (
        <p className="empty">No templates yet. Create one to start sending emails.</p>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New Template' : 'Edit Template'} onClose={() => setEditing(null)} wide>
          <form onSubmit={handleSubmit} className="form">
            <label className="form-label">Template Name *
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </label>
            <label className="form-label">Subject *
              <input className="form-input" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} required />
            </label>
            <label className="form-label">Body *
              <textarea className="form-input" rows={12} value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} required />
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={create.isPending || update.isPending}>
                {editing === 'new' ? 'Create' : 'Save'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
