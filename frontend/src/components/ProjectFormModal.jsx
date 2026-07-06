import { useState } from 'react'
import Modal from './Modal'

export default function ProjectFormModal({ mode = 'create', initial, onSubmit, onClose, pending, error }) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    date: initial?.date ?? '',
    description: initial?.description ?? '',
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit({ name: form.name, date: form.date || null, description: form.description || null })
  }

  return (
    <Modal title={mode === 'edit' ? 'Edit Project' : 'New Project'} onClose={onClose}>
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
        {error && <p className="error-msg">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'Saving...' : mode === 'edit' ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
