import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getProject, getCategories, createCategory, deleteCategory,
  getContacts, createContact, updateContact, deleteContact,
  getTemplates, sendEmail, getEmailLogs,
  replyEmail, getThread, postGmailImport, searchThreads,
} from '../api'
import Modal from '../components/Modal'
import StatusBadge from '../components/StatusBadge'

const STATUSES = ['not_contacted', 'contacted', 'responded', 'negotiating', 'confirmed', 'declined']

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

const emptyContactForm = { company_name: '', contact_name: '', email: '', ask_type: '', status: 'not_contacted', notes: '', gmail_thread_link: '' }

function parseThreadId(input) {
  if (!input) return ''
  const match = input.match(/#[^/]+\/([A-Za-z0-9]+)/)
  if (match) return match[1]
  return input.trim()
}

// ── Send Email Modal ──────────────────────────────────────────────────────────

function SendEmailModal({ contact, onClose }) {
  const [templateId, setTemplateId] = useState('')
  const [result, setResult] = useState(null)
  const qc = useQueryClient()

  const { data: templates = [] } = useQuery({ queryKey: ['templates'], queryFn: getTemplates })

  const send = useMutation({
    mutationFn: () => sendEmail(contact.id, { template_id: Number(templateId) }),
    onSuccess: (data) => {
      setResult(data)
      qc.invalidateQueries(['contacts', contact.category_id])
      qc.invalidateQueries(['email-logs', contact.id])
    },
  })

  if (result) {
    return (
      <Modal title="Email Sent" onClose={onClose}>
        <p className="success-msg">Email sent successfully!</p>
        <div className="email-preview">
          <p><strong>Subject:</strong> {result.subject}</p>
          <pre className="email-body">{result.body}</pre>
        </div>
        <div className="form-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={`Send Email to ${contact.company_name}`} onClose={onClose}>
      <div className="form">
        <label className="form-label">Template
          <select className="form-input" value={templateId} onChange={e => setTemplateId(e.target.value)}>
            <option value="">Select a template...</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        {send.isError && <p className="error-msg">{send.error?.response?.data?.detail ?? 'Send failed'}</p>}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!templateId || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Contact Detail Modal ──────────────────────────────────────────────────────

function ContactModal({ contact, categoryId, onClose }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState('details')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...contact, gmail_thread_link: contact.gmail_thread_id || '' })
  const [showSend, setShowSend] = useState(false)
  const [replyBody, setReplyBody] = useState('')

  const { data: logs = [] } = useQuery({
    queryKey: ['email-logs', contact.id],
    queryFn: () => getEmailLogs(contact.id),
    enabled: tab === 'history',
  })

  const { data: thread, isLoading: threadLoading, error: threadError } = useQuery({
    queryKey: ['thread', contact.id],
    queryFn: () => getThread(contact.id),
    enabled: tab === 'reply',
    retry: false,
  })

  const update = useMutation({
    mutationFn: (data) => updateContact(categoryId, contact.id, data),
    onSuccess: () => { qc.invalidateQueries(['contacts', categoryId]); setEditing(false) },
  })

  const reply = useMutation({
    mutationFn: () => replyEmail(contact.id, { body: replyBody }),
    onSuccess: () => {
      setReplyBody('')
      qc.invalidateQueries(['thread', contact.id])
      qc.invalidateQueries(['email-logs', contact.id])
      qc.invalidateQueries(['contacts', categoryId])
    },
  })

  const handleSave = (e) => {
    e.preventDefault()
    const { gmail_thread_link, ...rest } = form
    const threadId = parseThreadId(gmail_thread_link)
    update.mutate({ ...rest, gmail_thread_id: threadId || null })
  }

  return (
    <>
      <Modal title={contact.company_name} onClose={onClose} wide>
        <div className="tabs">
          <button className={`tab ${tab === 'details' ? 'active' : ''}`} onClick={() => setTab('details')}>Details</button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>Email History</button>
          <button className={`tab ${tab === 'reply' ? 'active' : ''}`} onClick={() => setTab('reply')}>Reply</button>
        </div>

        {tab === 'details' && (
          editing ? (
            <form onSubmit={handleSave} className="form">
              <label className="form-label">Company Name *
                <input className="form-input" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} required />
              </label>
              <label className="form-label">Contact Name
                <input className="form-input" value={form.contact_name ?? ''} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
              </label>
              <label className="form-label">Email
                <input className="form-input" type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </label>
              <label className="form-label">Ask Type
                <input className="form-input" value={form.ask_type ?? ''} onChange={e => setForm(f => ({ ...f, ask_type: e.target.value }))} placeholder="e.g. money, product, paid performance" />
              </label>
              <label className="form-label">Status
                <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </label>
              <label className="form-label">Gmail Thread Link
                <input className="form-input" value={form.gmail_thread_link} onChange={e => setForm(f => ({ ...f, gmail_thread_link: e.target.value }))} placeholder="Paste Gmail URL or raw thread ID" />
              </label>
              <label className="form-label">Notes
                <textarea className="form-input" rows={4} value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </label>
              <div className="form-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={update.isPending}>Save</button>
              </div>
            </form>
          ) : (
            <div>
              <dl className="detail-list">
                <dt>Contact Name</dt><dd>{contact.contact_name || '—'}</dd>
                <dt>Email</dt><dd>{contact.email || '—'}</dd>
                <dt>Ask Type</dt><dd>{contact.ask_type || '—'}</dd>
                <dt>Status</dt><dd><StatusBadge status={contact.status} /></dd>
                <dt>Last Contacted</dt><dd>{contact.last_contacted_date ? new Date(contact.last_contacted_date).toLocaleDateString() : '—'}</dd>
                <dt>Gmail Thread</dt><dd className="thread-id-cell">{contact.gmail_thread_id || '—'}</dd>
                <dt>Notes</dt><dd className="notes">{contact.notes || '—'}</dd>
              </dl>
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setEditing(true)}>Edit</button>
                <button className="btn btn-primary" onClick={() => setShowSend(true)} disabled={!contact.email}>
                  Send Email
                </button>
              </div>
            </div>
          )
        )}

        {tab === 'history' && (
          <div>
            {logs.length === 0 && <p className="empty">No emails sent yet.</p>}
            {logs.map(log => (
              <div key={log.id} className="log-entry">
                <div className="log-header">
                  <strong>{log.subject}</strong>
                  <span className="muted">{new Date(log.sent_at).toLocaleString()}</span>
                </div>
                <pre className="email-body">{log.body}</pre>
              </div>
            ))}
          </div>
        )}

        {tab === 'reply' && (
          <div>
            {!contact.gmail_thread_id ? (
              <p className="empty">No Gmail thread linked. Send an email first, or paste a thread link in the Details tab.</p>
            ) : (
              <>
                {threadLoading && <p className="muted" style={{ marginBottom: 16 }}>Loading thread...</p>}
                {threadError && (
                  <p className="error-msg" style={{ marginBottom: 16 }}>
                    {threadError?.response?.data?.detail ?? 'Could not load thread'}
                  </p>
                )}
                {thread && (
                  <div className="thread-messages">
                    {thread.messages.map(msg => (
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
                  <textarea
                    className="form-input"
                    rows={5}
                    placeholder="Write your reply..."
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                  />
                  {reply.isError && (
                    <p className="error-msg" style={{ marginTop: 8 }}>{reply.error?.response?.data?.detail ?? 'Reply failed'}</p>
                  )}
                  {reply.isSuccess && <p className="success-msg" style={{ marginTop: 8 }}>Reply sent!</p>}
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
              </>
            )}
          </div>
        )}
      </Modal>

      {showSend && <SendEmailModal contact={contact} onClose={() => setShowSend(false)} />}
    </>
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
  const [importForm, setImportForm] = useState({ company_name: '', contact_name: '', email: '' })

  const importThread = useMutation({
    mutationFn: () => postGmailImport(projectId, category.id, { thread_id: selected.thread_id, ...importForm }),
    onSuccess: () => { qc.invalidateQueries(['contacts', category.id]); onClose() },
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
      <Modal title="Import as Contact" onClose={() => setSelected(null)}>
        <div className="gmail-thread-item" style={{ cursor: 'default', marginBottom: 16 }}>
          <div className="gmail-thread-subject">{selected.subject}</div>
          <div className="gmail-thread-meta">
            <span>{selected.from_name || selected.from_email}</span>
            <span className="muted">{selected.date}</span>
          </div>
          {selected.snippet && <p className="gmail-thread-snippet">{selected.snippet}</p>}
        </div>
        <form onSubmit={e => { e.preventDefault(); importThread.mutate() }} className="form">
          <label className="form-label">Company Name *
            <input className="form-input" value={importForm.company_name} onChange={e => setImportForm(f => ({ ...f, company_name: e.target.value }))} required />
          </label>
          <label className="form-label">Contact Name
            <input className="form-input" value={importForm.contact_name} onChange={e => setImportForm(f => ({ ...f, contact_name: e.target.value }))} />
          </label>
          <label className="form-label">Email
            <input className="form-input" type="email" value={importForm.email} onChange={e => setImportForm(f => ({ ...f, email: e.target.value }))} />
          </label>
          {importThread.isError && <p className="error-msg">{importThread.error?.response?.data?.detail ?? 'Import failed'}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>Back</button>
            <button type="submit" className="btn btn-primary" disabled={importThread.isPending}>Import Contact</button>
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
                  setImportForm({ company_name: '', contact_name: t.from_name || '', email: t.from_email || '' })
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

function CategorySection({ category, projectId }) {
  const qc = useQueryClient()
  const [showAddContact, setShowAddContact] = useState(false)
  const [showGmailImport, setShowGmailImport] = useState(false)
  const [selectedContact, setSelectedContact] = useState(null)
  const [contactForm, setContactForm] = useState(emptyContactForm)

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts', category.id],
    queryFn: () => getContacts(category.id),
  })

  const addContact = useMutation({
    mutationFn: (data) => createContact(category.id, data),
    onSuccess: () => {
      qc.invalidateQueries(['contacts', category.id])
      setShowAddContact(false)
      setContactForm(emptyContactForm)
    },
  })

  const patchContact = useMutation({
    mutationFn: ({ id, data }) => updateContact(category.id, id, data),
    onSuccess: () => qc.invalidateQueries(['contacts', category.id]),
  })

  const removeContact = useMutation({
    mutationFn: (id) => deleteContact(category.id, id),
    onSuccess: () => qc.invalidateQueries(['contacts', category.id]),
  })

  const removeCategory = useMutation({
    mutationFn: () => deleteCategory(projectId, category.id),
    onSuccess: () => qc.invalidateQueries(['categories', projectId]),
  })

  const handleAddContact = (e) => {
    e.preventDefault()
    const { gmail_thread_link, ...rest } = contactForm
    const threadId = parseThreadId(gmail_thread_link)
    addContact.mutate({ ...rest, gmail_thread_id: threadId || null })
  }

  return (
    <div className="category-section">
      <div className="category-header">
        <h3>{category.name}</h3>
        <div className="category-actions">
          <button className="btn btn-sm btn-ghost" onClick={() => setShowGmailImport(true)}>↓ Import from Gmail</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowAddContact(true)}>+ Add Contact</button>
          <button className="btn btn-sm btn-danger" onClick={() => { if (confirm(`Delete category "${category.name}"?`)) removeCategory.mutate() }}>Delete</button>
        </div>
      </div>

      {contacts.length === 0 ? (
        <p className="empty small">No contacts yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Ask Type</th>
              <th>Status</th>
              <th>Last Contacted</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id} className="table-row" onClick={() => setSelectedContact(c)}>
                <td>{c.company_name}</td>
                <td>{c.contact_name || '—'}</td>
                <td>{c.email || '—'}</td>
                <td>{c.ask_type || '—'}</td>
                <td>
                  <StatusSelect
                    value={c.status}
                    onClick={e => e.stopPropagation()}
                    onChange={e => patchContact.mutate({ id: c.id, data: { status: e.target.value } })}
                  />
                </td>
                <td>{c.last_contacted_date ? new Date(c.last_contacted_date).toLocaleDateString() : '—'}</td>
                <td>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={e => { e.stopPropagation(); if (confirm(`Delete ${c.company_name}?`)) removeContact.mutate(c.id) }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddContact && (
        <Modal title={`Add Contact to ${category.name}`} onClose={() => setShowAddContact(false)}>
          <form onSubmit={handleAddContact} className="form">
            <label className="form-label">Company Name *
              <input className="form-input" value={contactForm.company_name} onChange={e => setContactForm(f => ({ ...f, company_name: e.target.value }))} required />
            </label>
            <label className="form-label">Contact Name
              <input className="form-input" value={contactForm.contact_name} onChange={e => setContactForm(f => ({ ...f, contact_name: e.target.value }))} />
            </label>
            <label className="form-label">Email
              <input className="form-input" type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
            </label>
            <label className="form-label">Ask Type
              <input className="form-input" value={contactForm.ask_type} onChange={e => setContactForm(f => ({ ...f, ask_type: e.target.value }))} placeholder="e.g. money, product, paid performance" />
            </label>
            <label className="form-label">Gmail Thread Link
              <input className="form-input" value={contactForm.gmail_thread_link} onChange={e => setContactForm(f => ({ ...f, gmail_thread_link: e.target.value }))} placeholder="Paste Gmail URL or thread ID (optional)" />
            </label>
            <label className="form-label">Notes
              <textarea className="form-input" rows={3} value={contactForm.notes} onChange={e => setContactForm(f => ({ ...f, notes: e.target.value }))} />
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddContact(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={addContact.isPending}>Add</button>
            </div>
          </form>
        </Modal>
      )}

      {showGmailImport && (
        <GmailImportModal projectId={projectId} category={category} onClose={() => setShowGmailImport(false)} />
      )}

      {selectedContact && (
        <ContactModal contact={selectedContact} categoryId={category.id} onClose={() => setSelectedContact(null)} />
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
    onSuccess: () => { qc.invalidateQueries(['categories', id]); setShowAddCategory(false); setCategoryName('') },
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
        <p className="empty">No categories yet. Add one to start tracking contacts.</p>
      )}

      {categories.map(cat => (
        <CategorySection key={cat.id} category={cat} projectId={id} />
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
