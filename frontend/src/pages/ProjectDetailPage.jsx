import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProject, getCategories, createCategory, deleteCategory,
  getOrgs, createOrg, updateOrg, deleteOrg,
  addPerson, updatePerson, deletePerson,
  startEmail, linkThread, getThreadMessages, replyToThread,
  getTemplates,
  searchThreads, postGmailImport,
} from '../api'
import Modal from '../components/Modal'

const STATUSES = ['not_contacted', 'contacted', 'responded', 'negotiating', 'confirmed', 'declined']

// ── StatusSelect ──────────────────────────────────────────────────────────────

function StatusSelect({ value, onChange, onClick }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const tmp = document.createElement('span')
    tmp.style.cssText = 'position:absolute;visibility:hidden;font-size:12px;font-weight:500;padding:2px 10px;white-space:nowrap'
    tmp.textContent = value.replace(/_/g, ' ')
    document.body.appendChild(tmp)
    ref.current.style.width = `${tmp.offsetWidth}px`
    document.body.removeChild(tmp)
  }, [value])
  return (
    <select ref={ref} className={`status-select status-select-${value}`} value={value} onClick={onClick} onChange={onChange}>
      {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
    </select>
  )
}

// ── Template rendering (client-side) ─────────────────────────────────────────

function applyTemplate(subject, body, { orgName, personName, projectName, projectDate }) {
  const r = (s) => s
    .replace(/{{company_name}}/g, orgName || '')
    .replace(/{{contact_name}}/g, personName || '')
    .replace(/{{project_name}}/g, projectName || '')
    .replace(/{{project_date}}/g, projectDate || '')
  return { subject: r(subject), body: r(body) }
}

// ── Thread View (messages + reply compose) ────────────────────────────────────

function ThreadView({ org, thread, categoryId, onBack }) {
  const qc = useQueryClient()
  const [replyBody, setReplyBody] = useState('')
  const [ccPersonIds, setCcPersonIds] = useState([])

  const { data: threadData, isLoading, error } = useQuery({
    queryKey: ['thread-messages', org.id, thread.id],
    queryFn: () => getThreadMessages(org.id, thread.id),
    retry: false,
  })

  const reply = useMutation({
    mutationFn: () => replyToThread(org.id, thread.id, { body: replyBody, cc_person_ids: ccPersonIds }),
    onSuccess: () => {
      setReplyBody('')
      setCcPersonIds([])
      qc.invalidateQueries({ queryKey: ['thread-messages', org.id, thread.id] })
      qc.invalidateQueries({ queryKey: ['orgs', categoryId] })
    },
  })

  const toggleCc = (id) => setCcPersonIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  return (
    <div>
      <div className="thread-view-header">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>← Threads</button>
        <span className="thread-view-subject">{thread.subject || '(no subject)'}</span>
      </div>

      {isLoading && <p className="muted" style={{ padding: '16px 0' }}>Loading thread...</p>}
      {error && <p className="error-msg" style={{ padding: '8px 0' }}>{error?.response?.data?.detail ?? 'Could not load thread from Gmail'}</p>}

      {threadData && (
        <div className="thread-messages">
          {threadData.messages.map(msg => (
            <div key={msg.id} className="thread-message">
              <div className="thread-message-header">
                <span className="thread-sender">{msg.sender}</span>
                <span className="muted thread-date">{msg.date}</span>
              </div>
              {msg.subject && <div className="thread-subject">{msg.subject}</div>}
              <p className="thread-snippet">{msg.snippet}</p>
            </div>
          ))}
        </div>
      )}

      <div className="reply-compose">
        {org.people.filter(p => p.email).length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>CC</span>
            <div className="cc-checkboxes">
              {org.people.filter(p => p.email).map(p => (
                <label key={p.id} className="cc-checkbox-label">
                  <input type="checkbox" checked={ccPersonIds.includes(p.id)} onChange={() => toggleCc(p.id)} />
                  {p.name || p.email}
                </label>
              ))}
            </div>
          </div>
        )}
        <textarea
          className="form-input"
          rows={5}
          placeholder="Write your reply..."
          value={replyBody}
          onChange={e => setReplyBody(e.target.value)}
        />
        {reply.isError && <p className="error-msg" style={{ marginTop: 4 }}>{reply.error?.response?.data?.detail ?? 'Reply failed'}</p>}
        {reply.isSuccess && <p className="success-msg" style={{ marginTop: 4 }}>Reply sent!</p>}
        <div className="form-actions">
          <button
            className="btn btn-primary"
            disabled={!replyBody.trim() || reply.isPending}
            onClick={() => reply.mutate()}
          >
            {reply.isPending ? 'Sending...' : 'Send Reply'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Compose View (new email) ──────────────────────────────────────────────────

function ComposeView({ org, project, categoryId, onCancel, onSuccess }) {
  const qc = useQueryClient()
  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: getTemplates })

  const peopleWithEmail = org.people.filter(p => p.email)
  const [toPersonId, setToPersonId] = useState(peopleWithEmail[0]?.id ?? '')
  const [ccPersonIds, setCcPersonIds] = useState([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [templateId, setTemplateId] = useState('')

  const toPerson = org.people.find(p => p.id === Number(toPersonId))

  const loadTemplate = (tid) => {
    setTemplateId(tid)
    if (!tid) return
    const tmpl = templates.find(t => t.id === Number(tid))
    if (!tmpl) return
    const rendered = applyTemplate(tmpl.subject, tmpl.body, {
      orgName: org.name,
      personName: toPerson?.name || '',
      projectName: project?.name || '',
      projectDate: project?.date || '',
    })
    setSubject(rendered.subject)
    setBody(rendered.body)
  }

  const send = useMutation({
    mutationFn: () => startEmail(org.id, {
      to_person_id: Number(toPersonId),
      cc_person_ids: ccPersonIds,
      subject,
      body,
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['orgs', categoryId] })
      onSuccess({ id: data.thread_id, gmail_thread_id: data.gmail_thread_id, subject: data.subject, created_at: new Date().toISOString() })
    },
  })

  const toggleCc = (id) => setCcPersonIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const ccCandidates = org.people.filter(p => p.email && p.id !== Number(toPersonId))

  return (
    <div>
      <div className="thread-view-header">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>← Back</button>
        <span className="thread-view-subject">New Email to {org.name}</span>
      </div>

      {peopleWithEmail.length === 0 ? (
        <p className="empty" style={{ padding: '24px 0' }}>No contacts with an email address. Add one in the People tab first.</p>
      ) : (
        <div className="form" style={{ marginTop: 16 }}>
          <label className="form-label">To
            <select className="form-input" value={toPersonId} onChange={e => setToPersonId(e.target.value)}>
              {peopleWithEmail.map(p => (
                <option key={p.id} value={p.id}>{p.name ? `${p.name} (${p.email})` : p.email}</option>
              ))}
            </select>
          </label>

          {ccCandidates.length > 0 && (
            <div className="form-label">
              <span>CC</span>
              <div className="cc-checkboxes">
                {ccCandidates.map(p => (
                  <label key={p.id} className="cc-checkbox-label">
                    <input type="checkbox" checked={ccPersonIds.includes(p.id)} onChange={() => toggleCc(p.id)} />
                    {p.name ? `${p.name} (${p.email})` : p.email}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="form-label">Load Template (optional)
            <select className="form-input" value={templateId} onChange={e => loadTemplate(e.target.value)}>
              <option value="">— pick a template to pre-fill —</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          <label className="form-label">Subject
            <input className="form-input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject..." />
          </label>

          <label className="form-label">Body
            <textarea className="form-input" rows={9} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your email..." />
          </label>

          {send.isError && <p className="error-msg">{send.error?.response?.data?.detail ?? 'Failed to send'}</p>}

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!toPersonId || !subject.trim() || !body.trim() || send.isPending}
              onClick={() => send.mutate()}
            >
              {send.isPending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Thread List View ──────────────────────────────────────────────────────────

function ThreadListView({ org, categoryId, onCompose, onSelectThread }) {
  const qc = useQueryClient()
  const [showLinkForm, setShowLinkForm] = useState(false)
  const [linkId, setLinkId] = useState('')
  const [linkSubject, setLinkSubject] = useState('')

  const linkMutation = useMutation({
    mutationFn: () => linkThread(org.id, { gmail_thread_id: linkId.trim(), subject: linkSubject.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgs', categoryId] })
      setShowLinkForm(false)
      setLinkId('')
      setLinkSubject('')
    },
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {org.threads.length} thread{org.threads.length !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowLinkForm(v => !v)}>Link Thread</button>
          <button className="btn btn-sm btn-primary" onClick={onCompose}>+ New Email</button>
        </div>
      </div>

      {showLinkForm && (
        <div className="link-thread-form">
          <input className="form-input" placeholder="Gmail Thread ID" value={linkId} onChange={e => setLinkId(e.target.value)} />
          <input className="form-input" placeholder="Subject (optional)" value={linkSubject} onChange={e => setLinkSubject(e.target.value)} />
          {linkMutation.isError && <p className="error-msg">{linkMutation.error?.response?.data?.detail ?? 'Link failed'}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowLinkForm(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={!linkId.trim() || linkMutation.isPending} onClick={() => linkMutation.mutate()}>Link</button>
          </div>
        </div>
      )}

      {org.threads.length === 0 && !showLinkForm && (
        <div className="empty-conversation">
          <p className="muted">No email threads yet.</p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onCompose}>Compose First Email</button>
        </div>
      )}

      <div className="thread-card-list">
        {org.threads.map(thread => (
          <button key={thread.id} className="thread-card" onClick={() => onSelectThread(thread)}>
            <span className="thread-card-subject">{thread.subject || '(no subject)'}</span>
            <span className="thread-card-date muted">{new Date(thread.created_at).toLocaleDateString()}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Conversation Tab ──────────────────────────────────────────────────────────

function ConversationTab({ org, categoryId, project }) {
  const [view, setView] = useState(() => org.threads.length === 1 ? 'thread' : 'list')
  const [activeThread, setActiveThread] = useState(() => org.threads.length === 1 ? org.threads[0] : null)

  return (
    <div>
      {view === 'list' && (
        <ThreadListView
          org={org}
          categoryId={categoryId}
          onCompose={() => setView('compose')}
          onSelectThread={(t) => { setActiveThread(t); setView('thread') }}
        />
      )}
      {view === 'compose' && (
        <ComposeView
          org={org}
          project={project}
          categoryId={categoryId}
          onCancel={() => setView('list')}
          onSuccess={(t) => { setActiveThread(t); setView('thread') }}
        />
      )}
      {view === 'thread' && activeThread && (
        <ThreadView
          org={org}
          thread={activeThread}
          categoryId={categoryId}
          onBack={() => setView('list')}
        />
      )}
    </div>
  )
}

// ── People Tab ────────────────────────────────────────────────────────────────

function PeopleTab({ org, categoryId }) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', email: '', title: '' })
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const add = useMutation({
    mutationFn: () => addPerson(org.id, addForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgs', categoryId] })
      setShowAdd(false)
      setAddForm({ name: '', email: '', title: '' })
    },
  })

  const edit = useMutation({
    mutationFn: () => updatePerson(org.id, editingId, editForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs', categoryId] }); setEditingId(null) },
  })

  const remove = useMutation({
    mutationFn: (id) => deletePerson(org.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs', categoryId] }),
  })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {org.people.length} person{org.people.length !== 1 ? 's' : ''}
        </span>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowAdd(v => !v)}>+ Add Person</button>
      </div>

      {org.people.length === 0 && !showAdd && (
        <p className="empty small">No contacts added yet.</p>
      )}

      <div className="people-list">
        {org.people.map(person => (
          <div key={person.id} className="person-card">
            {editingId === person.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label className="form-label">Name
                    <input className="form-input" value={editForm.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                  </label>
                  <label className="form-label">Email
                    <input className="form-input" type="email" value={editForm.email ?? ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                  </label>
                  <label className="form-label" style={{ gridColumn: '1 / -1' }}>Title
                    <input className="form-input" value={editForm.title ?? ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Marketing Director" />
                  </label>
                </div>
                {edit.isError && <p className="error-msg">{edit.error?.response?.data?.detail ?? 'Save failed'}</p>}
                <div className="form-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" disabled={edit.isPending} onClick={() => edit.mutate()}>Save</button>
                </div>
              </div>
            ) : (
              <div className="person-card-content">
                <div className="person-info">
                  <span className="person-name">{person.name || '—'}</span>
                  {person.title && <span className="person-title">{person.title}</span>}
                  {person.email && <a className="person-email" href={`mailto:${person.email}`}>{person.email}</a>}
                </div>
                <div className="person-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(person.id); setEditForm({ name: person.name || '', email: person.email || '', title: person.title || '' }) }}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => { if (confirm(`Remove ${person.name || person.email}?`)) remove.mutate(person.id) }}>Remove</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="add-person-form">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="form-label">Name
              <input className="form-input" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
            </label>
            <label className="form-label">Email
              <input className="form-input" type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} />
            </label>
            <label className="form-label" style={{ gridColumn: '1 / -1' }}>Title
              <input className="form-input" value={addForm.title} onChange={e => setAddForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Marketing Director" />
            </label>
          </div>
          {add.isError && <p className="error-msg">{add.error?.response?.data?.detail ?? 'Failed to add person'}</p>}
          <div className="form-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={add.isPending} onClick={() => add.mutate()}>Add Person</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ org, categoryId }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: org.name, website: org.website || '', ask_type: org.ask_type || '', status: org.status, notes: org.notes || '' })

  useEffect(() => {
    if (!editing) setForm({ name: org.name, website: org.website || '', ask_type: org.ask_type || '', status: org.status, notes: org.notes || '' })
  }, [org, editing])

  const update = useMutation({
    mutationFn: (data) => updateOrg(categoryId, org.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs', categoryId] }); setEditing(false) },
  })

  if (editing) {
    return (
      <form onSubmit={e => { e.preventDefault(); update.mutate({ name: form.name, website: form.website || null, ask_type: form.ask_type || null, status: form.status, notes: form.notes || null }) }} className="form">
        <label className="form-label">Org Name *
          <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        </label>
        <label className="form-label">Website
          <input className="form-input" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
        </label>
        <label className="form-label">Ask Type
          <input className="form-input" value={form.ask_type} onChange={e => setForm(f => ({ ...f, ask_type: e.target.value }))} placeholder="e.g. money, product, paid performance" />
        </label>
        <label className="form-label">Status
          <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="form-label">Notes
          <textarea className="form-input" rows={4} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </label>
        {update.isError && <p className="error-msg">{update.error?.response?.data?.detail ?? 'Save failed'}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={update.isPending}>Save</button>
        </div>
      </form>
    )
  }

  return (
    <div>
      <dl className="detail-list">
        <dt>Website</dt>
        <dd>{org.website ? <a href={org.website} target="_blank" rel="noreferrer">{org.website}</a> : '—'}</dd>
        <dt>Ask Type</dt><dd>{org.ask_type || '—'}</dd>
        <dt>Status</dt><dd><span className={`badge badge-${org.status}`}>{org.status.replace(/_/g, ' ')}</span></dd>
        <dt>Last Contacted</dt><dd>{org.last_contacted_date ? new Date(org.last_contacted_date).toLocaleDateString() : '—'}</dd>
        <dt>Notes</dt><dd className="notes">{org.notes || '—'}</dd>
      </dl>
      <div className="form-actions">
        <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>
      </div>
    </div>
  )
}

// ── Org Modal ─────────────────────────────────────────────────────────────────

function OrgModal({ orgId, categoryId, project, onClose }) {
  const [tab, setTab] = useState('overview')

  const { data: org } = useQuery({
    queryKey: ['orgs', categoryId],
    queryFn: () => getOrgs(categoryId),
    select: orgs => orgs?.find(o => o.id === orgId),
  })

  if (!org) return null

  return (
    <Modal title={org.name} onClose={onClose} wide>
      <div className="tabs">
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab ${tab === 'people' ? 'active' : ''}`} onClick={() => setTab('people')}>
          People {org.people.length > 0 && <span className="tab-count">{org.people.length}</span>}
        </button>
        <button className={`tab ${tab === 'conversation' ? 'active' : ''}`} onClick={() => setTab('conversation')}>
          Conversation {org.threads.length > 0 && <span className="tab-count">{org.threads.length}</span>}
        </button>
      </div>
      {tab === 'overview' && <OverviewTab org={org} categoryId={categoryId} />}
      {tab === 'people' && <PeopleTab org={org} categoryId={categoryId} />}
      {tab === 'conversation' && <ConversationTab org={org} categoryId={categoryId} project={project} />}
    </Modal>
  )
}

// ── Gmail Import Modal ────────────────────────────────────────────────────────

function GmailImportModal({ projectId, category, onClose }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [threads, setThreads] = useState(null)
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [importForm, setImportForm] = useState({ org_name: '', contact_name: '', email: '' })

  const importThread = useMutation({
    mutationFn: () => postGmailImport(projectId, category.id, { thread_id: selected.thread_id, ...importForm }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs', category.id] }); onClose() },
  })

  const handleSearch = async () => {
    if (!email.trim()) return
    setSearchError('')
    setSearching(true)
    try {
      const data = await searchThreads(email.trim())
      setThreads(data)
    } catch (e) {
      setSearchError(e?.response?.data?.detail ?? 'Search failed. Make sure Gmail is connected.')
    } finally {
      setSearching(false)
    }
  }

  if (selected) {
    return (
      <Modal title="Import as Organization" onClose={() => setSelected(null)}>
        <div className="gmail-thread-item" style={{ cursor: 'default', marginBottom: 16 }}>
          <div className="gmail-thread-subject">{selected.subject}</div>
          <div className="gmail-thread-meta">
            <span>{selected.from_name || selected.from_email}</span>
            <span className="muted">{selected.date}</span>
          </div>
          {selected.snippet && <p className="gmail-thread-snippet">{selected.snippet}</p>}
        </div>
        <form onSubmit={e => { e.preventDefault(); importThread.mutate() }} className="form">
          <label className="form-label">Organization Name *
            <input className="form-input" value={importForm.org_name} onChange={e => setImportForm(f => ({ ...f, org_name: e.target.value }))} required />
          </label>
          <label className="form-label">Contact Name
            <input className="form-input" value={importForm.contact_name} onChange={e => setImportForm(f => ({ ...f, contact_name: e.target.value }))} />
          </label>
          <label className="form-label">Contact Email
            <input className="form-input" type="email" value={importForm.email} onChange={e => setImportForm(f => ({ ...f, email: e.target.value }))} />
          </label>
          {importThread.isError && <p className="error-msg">{importThread.error?.response?.data?.detail ?? 'Import failed'}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>Back</button>
            <button type="submit" className="btn btn-primary" disabled={importThread.isPending}>Import</button>
          </div>
        </form>
      </Modal>
    )
  }

  return (
    <Modal title={`Import from Gmail — ${category.name}`} onClose={onClose} wide>
      <div className="form">
        <p className="muted" style={{ marginBottom: 4 }}>Enter the sender's email address to find their thread in Gmail.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            value={email}
            onChange={e => { setEmail(e.target.value); setThreads(null); setSearchError('') }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="sender@example.com"
            type="email"
          />
          <button className="btn btn-primary" disabled={!email.trim() || searching} onClick={handleSearch}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {searchError && <p className="error-msg">{searchError}</p>}
      </div>
      {threads !== null && (
        <div style={{ marginTop: 16 }}>
          {threads.length === 0 ? (
            <p className="empty">No threads found from {email}.</p>
          ) : (
            <div className="gmail-thread-list">
              {threads.map(t => (
                <button key={t.thread_id} className="gmail-thread-item" onClick={() => {
                  setSelected(t)
                  setImportForm({ org_name: '', contact_name: t.from_name || '', email: t.from_email || '' })
                }}>
                  <div className="gmail-thread-subject">{t.subject}</div>
                  <div className="gmail-thread-meta">
                    <span>{t.from_name || t.from_email}</span>
                    <span className="muted">{t.date}</span>
                  </div>
                  <p className="gmail-thread-snippet">{t.snippet}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Category Section ──────────────────────────────────────────────────────────

function CategorySection({ category, projectId, project }) {
  const qc = useQueryClient()
  const [showAddOrg, setShowAddOrg] = useState(false)
  const [showGmailImport, setShowGmailImport] = useState(false)
  const [selectedOrgId, setSelectedOrgId] = useState(null)
  const [orgForm, setOrgForm] = useState({ name: '', website: '', ask_type: '', contact_name: '', contact_email: '' })

  const { data: orgs = [] } = useQuery({
    queryKey: ['orgs', category.id],
    queryFn: () => getOrgs(category.id),
  })

  const addOrg = useMutation({
    mutationFn: (data) => createOrg(category.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orgs', category.id] })
      setShowAddOrg(false)
      setOrgForm({ name: '', website: '', ask_type: '', contact_name: '', contact_email: '' })
    },
  })

  const patchOrg = useMutation({
    mutationFn: ({ id, data }) => updateOrg(category.id, id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ['orgs', category.id] })
      const prev = qc.getQueryData(['orgs', category.id])
      qc.setQueryData(['orgs', category.id], orgs => orgs?.map(o => o.id === id ? { ...o, ...data } : o))
      return { prev }
    },
    onError: (_, __, ctx) => qc.setQueryData(['orgs', category.id], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['orgs', category.id] }),
  })

  const removeOrg = useMutation({
    mutationFn: (id) => deleteOrg(category.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs', category.id] }),
  })

  const removeCategory = useMutation({
    mutationFn: () => deleteCategory(projectId, category.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories', projectId] }),
  })

  return (
    <div className="category-section">
      <div className="category-header">
        <h3>{category.name}</h3>
        <div className="category-actions">
          <button className="btn btn-sm btn-ghost" onClick={() => setShowGmailImport(true)}>↓ Import from Gmail</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowAddOrg(true)}>+ Add Org</button>
          <button className="btn btn-sm btn-danger" onClick={() => { if (confirm(`Delete category "${category.name}"?`)) removeCategory.mutate() }}>Delete</button>
        </div>
      </div>

      {orgs.length === 0 ? (
        <p className="empty small">No organizations yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Organization</th>
              <th>Contact</th>
              <th>Ask Type</th>
              <th>Status</th>
              <th>Last Contacted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orgs.map(org => {
              const primary = org.people[0]
              return (
                <tr key={org.id} className="table-row" onClick={() => setSelectedOrgId(org.id)}>
                  <td><strong>{org.name}</strong></td>
                  <td>
                    {primary
                      ? <>{primary.name || primary.email}{org.people.length > 1 && <span className="muted"> +{org.people.length - 1}</span>}</>
                      : <span className="muted">—</span>
                    }
                  </td>
                  <td>{org.ask_type || '—'}</td>
                  <td>
                    <StatusSelect
                      value={org.status}
                      onClick={e => e.stopPropagation()}
                      onChange={e => patchOrg.mutate({ id: org.id, data: { status: e.target.value } })}
                    />
                  </td>
                  <td>{org.last_contacted_date ? new Date(org.last_contacted_date).toLocaleDateString() : '—'}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={e => { e.stopPropagation(); if (confirm(`Delete ${org.name}?`)) removeOrg.mutate(org.id) }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {showAddOrg && (
        <Modal title={`Add Organization to ${category.name}`} onClose={() => setShowAddOrg(false)}>
          <form
            onSubmit={e => {
              e.preventDefault()
              addOrg.mutate({
                name: orgForm.name,
                website: orgForm.website || null,
                ask_type: orgForm.ask_type || null,
                contact_name: orgForm.contact_name || null,
                contact_email: orgForm.contact_email || null,
              })
            }}
            className="form"
          >
            <label className="form-label">Organization Name *
              <input className="form-input" value={orgForm.name} onChange={e => setOrgForm(f => ({ ...f, name: e.target.value }))} required />
            </label>
            <label className="form-label">Website
              <input className="form-input" value={orgForm.website} onChange={e => setOrgForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
            </label>
            <label className="form-label">Ask Type
              <input className="form-input" value={orgForm.ask_type} onChange={e => setOrgForm(f => ({ ...f, ask_type: e.target.value }))} placeholder="e.g. money, product, paid performance" />
            </label>
            <label className="form-label">Contact Name
              <input className="form-input" value={orgForm.contact_name} onChange={e => setOrgForm(f => ({ ...f, contact_name: e.target.value }))} />
            </label>
            <label className="form-label">Contact Email
              <input className="form-input" type="email" value={orgForm.contact_email} onChange={e => setOrgForm(f => ({ ...f, contact_email: e.target.value }))} />
            </label>
            {addOrg.isError && <p className="error-msg">{addOrg.error?.response?.data?.detail ?? 'Failed to add organization'}</p>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddOrg(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={addOrg.isPending}>Add</button>
            </div>
          </form>
        </Modal>
      )}

      {showGmailImport && (
        <GmailImportModal projectId={projectId} category={category} onClose={() => setShowGmailImport(false)} />
      )}

      {selectedOrgId && (
        <OrgModal orgId={selectedOrgId} categoryId={category.id} project={project} onClose={() => setSelectedOrgId(null)} />
      )}
    </div>
  )
}

// ── Project Detail Page ───────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')

  const { data: project } = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) })
  const { data: categories = [] } = useQuery({ queryKey: ['categories', id], queryFn: () => getCategories(id) })

  const addCategory = useMutation({
    mutationFn: () => createCategory(id, { name: categoryName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories', id] }); setShowAddCategory(false); setCategoryName('') },
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← Back</button>
          <h1>{project?.name ?? '...'}</h1>
          {project?.date && <p className="muted">{project.date}</p>}
          {project?.description && <p>{project.description}</p>}
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddCategory(true)}>+ Add Category</button>
      </div>

      {categories.length === 0 && (
        <p className="empty">No categories yet. Add one to start tracking organizations.</p>
      )}

      {categories.map(cat => (
        <CategorySection key={cat.id} category={cat} projectId={id} project={project} />
      ))}

      {showAddCategory && (
        <Modal title="Add Category" onClose={() => setShowAddCategory(false)}>
          <form onSubmit={e => { e.preventDefault(); addCategory.mutate() }} className="form">
            <label className="form-label">Name *
              <input className="form-input" value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="e.g. Sponsors, Performers, Venues" required />
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddCategory(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={addCategory.isPending}>Add</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
