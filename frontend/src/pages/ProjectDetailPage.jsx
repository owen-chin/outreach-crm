import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import {
  getProject, getCategories, createCategory,
  getOrgs, createOrg, updateOrg, deleteOrg,
  addPerson, updatePerson, deletePerson,
  startEmail, linkThread, getThreadMessages, replyToThread,
  getTemplates,
  searchThreads, postGmailImport,
  attachmentUrl, getAttachmentBlob,
  getDraft, saveDraft, deleteDraft, draftAttachmentUrl,
} from '../api'
import Modal from '../components/Modal'
import RichTextEditor from '../components/RichTextEditor'
import StatusBadge, { STATUS_LABELS, STATUS_DOT_COLORS } from '../components/StatusBadge'
import { avatarColor, initials } from '../lib/avatar'

const STATUSES = ['not_contacted', 'contacted', 'responded', 'negotiating', 'confirmed', 'declined']

// ── Email display helpers ─────────────────────────────────────────────────────

function parseSender(raw) {
  const match = raw?.match(/^(.+?)\s*<([^>]+)>$/)
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() }
  return { name: raw || '', email: raw || '' }
}

function formatEmailDate(raw) {
  if (!raw) return ''
  try {
    const d = new Date(raw)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const isThisYear = d.getFullYear() === now.getFullYear()
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      ...(isThisYear ? {} : { year: 'numeric' }),
      hour: 'numeric', minute: '2-digit',
    })
  } catch { return raw }
}

function decodeEntities(str) {
  if (!str) return ''
  const el = document.createElement('textarea')
  el.innerHTML = str
  return el.value
}

// Gmail rejects outgoing messages over ~25MB total.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

function totalFileSize(files) {
  return files.reduce((sum, f) => sum + f.size, 0)
}

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

// Fetches any inline images referenced in a received message's HTML body (their src
// points at our own protected attachment endpoint, which needs the Bearer header a
// plain <img> tag can't send) and swaps them for blob object URLs before sanitizing.
async function renderMessageHtml(rawHtml) {
  let html = rawHtml
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const srcs = [...new Set(
    Array.from(doc.querySelectorAll('img[src^="/api/organizations/"]')).map(img => img.getAttribute('src'))
  )]
  for (const src of srcs) {
    try {
      const blob = await getAttachmentBlob(src)
      html = html.split(src).join(URL.createObjectURL(blob))
    } catch {
      // leave the original src — the image just won't load
    }
  }
  return DOMPurify.sanitize(html)
}

async function downloadReceivedAttachment(orgId, threadId, messageId, att) {
  const blob = await getAttachmentBlob(attachmentUrl(orgId, threadId, messageId, att))
  const objectUrl = URL.createObjectURL(blob)
  if (att.mime_type?.startsWith('image/') || att.mime_type === 'application/pdf') {
    window.open(objectUrl, '_blank')
  } else {
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = att.filename || 'attachment'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}

function MessageBody({ msg, orgId, threadId }) {
  const { data: html, isLoading } = useQuery({
    queryKey: ['thread-msg-html', orgId, threadId, msg.id, msg.body_html],
    queryFn: () => renderMessageHtml(msg.body_html),
    enabled: !!msg.body_html,
    staleTime: Infinity,
  })

  if (!msg.body_html || isLoading || !html) {
    return <p className="thread-msg-snippet">{decodeEntities(msg.snippet)}</p>
  }
  return <div className="thread-msg-html" dangerouslySetInnerHTML={{ __html: html }} />
}

function ReceivedAttachments({ msg, orgId, threadId }) {
  const files = (msg.attachments || []).filter(a => !a.inline)
  if (files.length === 0) return null
  return (
    <div className="attachment-list">
      {files.map(a => (
        <button
          key={a.attachment_id}
          type="button"
          className="attachment-chip attachment-chip-download"
          onClick={() => downloadReceivedAttachment(orgId, threadId, msg.id, a)}
        >
          📎 {a.filename || 'attachment'}{a.size ? ` (${formatBytes(a.size)})` : ''}
        </button>
      ))}
    </div>
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

function plainToHtml(text) {
  if (!text) return ''
  return text.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
}

function isHtmlEmpty(html) {
  return !html || !html.replace(/<[^>]*>/g, '').trim()
}

// ── Draft autosave + scheduled send (shared by ComposeView and ThreadView) ────────

function toLocalInputValue(isoString) {
  const d = new Date(isoString)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function filesFromDraftAttachments(orgId, draft) {
  const files = []
  for (const att of draft.attachments || []) {
    try {
      const blob = await getAttachmentBlob(draftAttachmentUrl(orgId, draft.id, att.id))
      files.push(new File([blob], att.filename, { type: att.mime_type }))
    } catch {
      // skip attachments that fail to restore — user can re-add them if needed
    }
  }
  return files
}

// threadId=null means the "compose new email" context; setSubject/setToPersonId are
// only passed there. Hydrates an existing draft once per context, autosaves on blur
// (skipped when nothing changed since the last save), and exposes schedule/cancel.
function useDraftSync({
  orgId, threadId, editorRef,
  body, setBody, ccPersonIds, setCcPersonIds,
  subject, setSubject, toPersonId, setToPersonId,
  files, setFiles,
}) {
  const qc = useQueryClient()
  const queryKey = ['draft', orgId, threadId ?? 'compose']
  const { data: draft } = useQuery({ queryKey, queryFn: () => getDraft(orgId, threadId) })

  const [draftId, setDraftId] = useState(null)
  const [scheduledFor, setScheduledFor] = useState('')
  const [status, setStatus] = useState(null)
  const [failureMessage, setFailureMessage] = useState(null)
  const hydratedRef = useRef(false)
  const lastSavedRef = useRef(null)

  useEffect(() => { hydratedRef.current = false }, [orgId, threadId])

  useEffect(() => {
    if (hydratedRef.current || !draft) return
    hydratedRef.current = true
    setDraftId(draft.id)
    setStatus(draft.status)
    setFailureMessage(draft.failure_message)
    setScheduledFor(draft.send_at ? toLocalInputValue(draft.send_at) : '')
    setBody(draft.body || '')
    editorRef.current?.setContent(draft.body || '')
    setCcPersonIds(draft.cc_person_ids || [])
    if (setSubject) setSubject(draft.subject || '')
    if (setToPersonId && draft.to_person_id) setToPersonId(draft.to_person_id)
    filesFromDraftAttachments(orgId, draft).then(setFiles)
    lastSavedRef.current = {
      body: draft.body || '', cc: draft.cc_person_ids || [],
      subject: draft.subject || '', toPersonId: draft.to_person_id ?? null,
      fileNames: (draft.attachments || []).map(a => a.filename),
    }
  }, [draft])

  const save = useMutation({
    mutationFn: (overrides = {}) => {
      const fd = new FormData()
      if (threadId) fd.append('thread_id', threadId)
      if (setToPersonId) {
        const tpId = overrides.toPersonId ?? toPersonId
        if (tpId) fd.append('to_person_id', tpId)
      }
      fd.append('cc_person_ids', JSON.stringify(overrides.ccPersonIds ?? ccPersonIds))
      if (setSubject) fd.append('subject', overrides.subject ?? subject ?? '')
      fd.append('body', overrides.body ?? body)
      const sendAt = 'send_at' in overrides ? overrides.send_at : scheduledFor
      if (sendAt) fd.append('send_at', new Date(sendAt).toISOString())
      for (const f of (overrides.files ?? files)) fd.append('attachments', f)
      return saveDraft(orgId, fd)
    },
    onSuccess: (data) => {
      setDraftId(data.id)
      setStatus(data.status)
      setFailureMessage(data.failure_message)
      setScheduledFor(data.send_at ? toLocalInputValue(data.send_at) : '')
      lastSavedRef.current = {
        body: data.body, cc: data.cc_person_ids,
        subject: data.subject || '', toPersonId: data.to_person_id ?? null,
        fileNames: (data.attachments || []).map(a => a.filename),
      }
      qc.setQueryData(queryKey, data)
    },
  })

  const handleBlur = (html) => {
    if (isHtmlEmpty(html) && files.length === 0) return
    const current = {
      body: html, cc: ccPersonIds, subject: subject ?? '',
      toPersonId: toPersonId ?? null, fileNames: files.map(f => f.name),
    }
    const last = lastSavedRef.current
    const unchanged = last
      && last.body === current.body
      && JSON.stringify(last.cc) === JSON.stringify(current.cc)
      && last.subject === current.subject
      && String(last.toPersonId ?? '') === String(current.toPersonId ?? '')
      && JSON.stringify(last.fileNames) === JSON.stringify(current.fileNames)
    if (unchanged) return
    save.mutate({ body: html })
  }

  const scheduleSend = (localDatetimeValue) => {
    setScheduledFor(localDatetimeValue)
    save.mutate({ send_at: localDatetimeValue })
  }

  const cancelSchedule = () => {
    setScheduledFor('')
    save.mutate({ send_at: null })
  }

  const clearAfterSend = () => {
    setDraftId(null)
    setStatus(null)
    setFailureMessage(null)
    setScheduledFor('')
    lastSavedRef.current = null
    qc.setQueryData(queryKey, null)
  }

  const discardDraft = async () => {
    const id = draftId
    setDraftId(null)
    setStatus(null)
    setFailureMessage(null)
    setScheduledFor('')
    lastSavedRef.current = null
    setBody('')
    editorRef.current?.setContent('')
    setCcPersonIds([])
    if (setSubject) setSubject('')
    setFiles([])
    qc.setQueryData(queryKey, null)
    if (id) {
      try { await deleteDraft(orgId, id) } catch { /* already gone or unreachable — local state is already cleared */ }
    }
  }

  return {
    draftId, scheduledFor, status, failureMessage,
    isSaving: save.isPending, saveError: save.isError,
    handleBlur, scheduleSend, cancelSchedule, clearAfterSend, discardDraft,
  }
}

function DraftStatusLine({ draftId, isSaving, status, failureMessage, saveError, discardDraft }) {
  if (!draftId && !isSaving) return null
  const discard = draftId && (
    <button
      type="button"
      onClick={discardDraft}
      style={{ background: 'none', border: 'none', padding: 0, marginLeft: 8, color: 'var(--text-muted)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', fontSize: 12 }}
    >
      Discard draft
    </button>
  )
  if (isSaving) return <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Saving draft…</p>
  if (saveError) return <p className="error-msg" style={{ marginTop: 4 }}>Couldn't save draft — try again{discard}</p>
  if (status === 'failed') return <p className="error-msg" style={{ marginTop: 4 }}>Scheduled send failed: {failureMessage}{discard}</p>
  return <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Draft saved{discard}</p>
}

function ScheduleSendControl({ scheduledFor, status, onSchedule, onCancelSchedule }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(scheduledFor)

  useEffect(() => { setValue(scheduledFor) }, [scheduledFor])

  if (status === 'scheduled' && scheduledFor) {
    return (
      <span className="muted" style={{ fontSize: 12 }}>
        Scheduled for {new Date(scheduledFor).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        {' — '}
        <button
          type="button"
          onClick={onCancelSchedule}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
        >
          Cancel
        </button>
      </span>
    )
  }

  if (!open) {
    return <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>Schedule send</button>
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="datetime-local"
        className="form-input"
        style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }}
        value={value}
        min={toLocalInputValue(new Date(Date.now() + 60000).toISOString())}
        onChange={e => setValue(e.target.value)}
      />
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={!value}
        onClick={() => { onSchedule(value); setOpen(false) }}
      >
        Schedule
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  )
}

// ── Thread View (messages + reply compose) ────────────────────────────────────

function ThreadView({ org, thread, categoryId, onBack }) {
  const qc = useQueryClient()
  const [replyBody, setReplyBody] = useState('')
  const [ccPersonIds, setCcPersonIds] = useState([])
  const [replyFiles, setReplyFiles] = useState([])
  const replyEditorRef = useRef(null)
  const [expandedIds, setExpandedIds] = useState(null)

  const { data: threadData, isLoading, error } = useQuery({
    queryKey: ['thread-messages', org.id, thread.id],
    queryFn: () => getThreadMessages(org.id, thread.id),
    retry: false,
  })

  // Default to Gmail-style collapse: only the most recent message starts expanded.
  useEffect(() => {
    if (threadData?.messages?.length) {
      setExpandedIds(new Set([threadData.messages[threadData.messages.length - 1].id]))
    }
  }, [threadData?.messages?.length, thread.id])

  const toggleExpanded = (id) => setExpandedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const draftSync = useDraftSync({
    orgId: org.id, threadId: thread.id, editorRef: replyEditorRef,
    body: replyBody, setBody: setReplyBody,
    ccPersonIds, setCcPersonIds,
    files: replyFiles, setFiles: setReplyFiles,
  })

  const reply = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('cc_person_ids', JSON.stringify(ccPersonIds))
      fd.append('body', replyBody)
      for (const f of replyFiles) fd.append('attachments', f)
      if (draftSync.draftId) fd.append('draft_id', draftSync.draftId)
      return replyToThread(org.id, thread.id, fd)
    },
    onSuccess: () => {
      replyEditorRef.current?.setContent('')
      setReplyBody('')
      setCcPersonIds([])
      setReplyFiles([])
      draftSync.clearAfterSend()
      qc.invalidateQueries({ queryKey: ['thread-messages', org.id, thread.id] })
      qc.invalidateQueries({ queryKey: ['orgs', categoryId] })
    },
  })

  const toggleCc = (id) => setCcPersonIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const removeReplyFile = (idx) => setReplyFiles(fs => fs.filter((_, i) => i !== idx))
  const replyAttachmentsTooLarge = totalFileSize(replyFiles) > MAX_ATTACHMENT_BYTES

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
          {threadData.messages.map(msg => {
            const sender = parseSender(msg.sender)
            const initial = (sender.name || sender.email || '?')[0].toUpperCase()
            const expanded = expandedIds?.has(msg.id) ?? true
            return (
              <div key={msg.id} className={`thread-message ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
                <div className="thread-msg-avatar" style={{ background: avatarColor(sender.name || sender.email) }}>
                  {initial}
                </div>
                <div className="thread-msg-body">
                  <div className="thread-msg-header" onClick={() => toggleExpanded(msg.id)}>
                    <div className="thread-msg-from">
                      <span className="thread-msg-name">{sender.name || sender.email}</span>
                      {expanded && sender.name && sender.email !== sender.name && (
                        <span className="thread-msg-email">&lt;{sender.email}&gt;</span>
                      )}
                      {!expanded && (
                        <span className="thread-msg-preview">{decodeEntities(msg.snippet)}</span>
                      )}
                    </div>
                    <span className="thread-msg-date">{formatEmailDate(msg.date)}</span>
                  </div>
                  {expanded && (
                    <>
                      <MessageBody msg={msg} orgId={org.id} threadId={thread.id} />
                      <ReceivedAttachments msg={msg} orgId={org.id} threadId={thread.id} />
                    </>
                  )}
                </div>
              </div>
            )
          })}
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
        <RichTextEditor
          onChange={setReplyBody}
          onBlur={draftSync.handleBlur}
          editorRef={replyEditorRef}
          placeholder="Write your reply..."
          minHeight={120}
        />
        {replyFiles.length > 0 && (
          <div className="attachment-list">
            {replyFiles.map((f, i) => (
              <span key={i} className="attachment-chip">
                {f.name}
                <button type="button" onClick={() => removeReplyFile(i)}>×</button>
              </span>
            ))}
          </div>
        )}
        {replyAttachmentsTooLarge && (
          <p className="error-msg" style={{ marginTop: 4 }}>
            Attachments total {formatBytes(totalFileSize(replyFiles))} — Gmail's limit is 25MB. Remove a file before sending.
          </p>
        )}
        {reply.isError && <p className="error-msg" style={{ marginTop: 4 }}>{reply.error?.response?.data?.detail ?? 'Reply failed'}</p>}
        {reply.isSuccess && <p className="success-msg" style={{ marginTop: 4 }}>Reply sent!</p>}
        <DraftStatusLine {...draftSync} />
        <div className="form-actions">
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            Attach File
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={e => setReplyFiles(fs => [...fs, ...Array.from(e.target.files)])}
            />
          </label>
          <ScheduleSendControl
            scheduledFor={draftSync.scheduledFor}
            status={draftSync.status}
            onSchedule={draftSync.scheduleSend}
            onCancelSchedule={draftSync.cancelSchedule}
          />
          <button
            className="btn btn-primary"
            disabled={isHtmlEmpty(replyBody) || reply.isPending || replyAttachmentsTooLarge}
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
  const [attachments, setAttachments] = useState([])
  const editorRef = useRef(null)

  const toPerson = org.people.find(p => p.id === Number(toPersonId))

  const draftSync = useDraftSync({
    orgId: org.id, threadId: null, editorRef,
    body, setBody, ccPersonIds, setCcPersonIds,
    subject, setSubject, toPersonId, setToPersonId,
    files: attachments, setFiles: setAttachments,
  })

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
    const html = plainToHtml(rendered.body)
    editorRef.current?.setContent(html)
    setBody(html)
  }

  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('to_person_id', Number(toPersonId))
      fd.append('cc_person_ids', JSON.stringify(ccPersonIds))
      fd.append('subject', subject)
      fd.append('body', body)
      for (const f of attachments) fd.append('attachments', f)
      if (draftSync.draftId) fd.append('draft_id', draftSync.draftId)
      return startEmail(org.id, fd)
    },
    onSuccess: (data) => {
      draftSync.clearAfterSend()
      qc.invalidateQueries({ queryKey: ['orgs', categoryId] })
      onSuccess({ id: data.thread_id, gmail_thread_id: data.gmail_thread_id, subject: data.subject, created_at: new Date().toISOString() })
    },
  })

  const toggleCc = (id) => setCcPersonIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])
  const ccCandidates = org.people.filter(p => p.email && p.id !== Number(toPersonId))
  const removeFile = (idx) => setAttachments(fs => fs.filter((_, i) => i !== idx))
  const attachmentsTooLarge = totalFileSize(attachments) > MAX_ATTACHMENT_BYTES

  return (
    <div>
      <div className="thread-view-header">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>← Back</button>
        <span className="thread-view-subject">New Email to {org.name}</span>
      </div>

      {peopleWithEmail.length === 0 ? (
        <p className="empty" style={{ padding: '24px 0' }}>No contacts with an email address. Add one in Contacts first.</p>
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

          <div className="form-label">
            <span>Body</span>
            <RichTextEditor onChange={setBody} onBlur={draftSync.handleBlur} editorRef={editorRef} placeholder="Write your email..." minHeight={200} />
          </div>

          {attachments.length > 0 && (
            <div className="attachment-list">
              {attachments.map((f, i) => (
                <span key={i} className="attachment-chip">
                  {f.name}
                  <button type="button" onClick={() => removeFile(i)}>×</button>
                </span>
              ))}
            </div>
          )}

          {attachmentsTooLarge && (
            <p className="error-msg">
              Attachments total {formatBytes(totalFileSize(attachments))} — Gmail's limit is 25MB. Remove a file before sending.
            </p>
          )}

          {send.isError && <p className="error-msg">{send.error?.response?.data?.detail ?? 'Failed to send'}</p>}

          <DraftStatusLine {...draftSync} />

          <div className="form-actions">
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              Attach File
              <input
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={e => setAttachments(fs => [...fs, ...Array.from(e.target.files)])}
              />
            </label>
            <ScheduleSendControl
              scheduledFor={draftSync.scheduledFor}
              status={draftSync.status}
              onSchedule={draftSync.scheduleSend}
              onCancelSchedule={draftSync.cancelSchedule}
            />
            <button
              className="btn btn-primary"
              disabled={!toPersonId || !subject.trim() || isHtmlEmpty(body) || send.isPending || attachmentsTooLarge}
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

// ── Org detail cards (right sidebar) ──────────────────────────────────────────

function OrgDetailsCard({ org, categoryId }) {
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

  const remove = useMutation({
    mutationFn: () => deleteOrg(categoryId, org.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs', categoryId] }),
  })

  if (editing) {
    return (
      <div className="detail-card">
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
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
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
      </div>
    )
  }

  return (
    <div className="detail-card">
      <div className="detail-card-header">
        <div>
          <h3 className="detail-card-org-name">{org.name}</h3>
          {org.website && <a className="detail-card-website" href={org.website} target="_blank" rel="noreferrer">{org.website}</a>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => { if (confirm(`Delete ${org.name}? This removes all its contacts and threads.`)) remove.mutate() }}
          >
            Delete
          </button>
        </div>
      </div>
      <dl className="detail-list">
        <dt>Status</dt><dd><StatusBadge status={org.status} /></dd>
        <dt>Ask Type</dt><dd>{org.ask_type || '—'}</dd>
        <dt>Last Contacted</dt><dd>{org.last_contacted_date ? new Date(org.last_contacted_date).toLocaleDateString() : '—'}</dd>
      </dl>
      <div className="detail-card-notes">
        <span className="detail-card-notes-label">Notes</span>
        <p>{org.notes || '—'}</p>
      </div>
    </div>
  )
}

function PersonCardMenu({ onEdit, onRemove }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false) }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="person-menu" ref={menuRef}>
      <button type="button" className="person-menu-btn" aria-label="Contact options" onClick={() => setOpen(v => !v)}>⋮</button>
      {open && (
        <div className="person-dropdown">
          <button type="button" className="person-dropdown-item" onClick={() => { setOpen(false); onEdit() }}>Edit</button>
          <button type="button" className="person-dropdown-item person-dropdown-danger" onClick={() => { setOpen(false); onRemove() }}>Remove</button>
        </div>
      )}
    </div>
  )
}

function OrgContactsCard({ org, categoryId }) {
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
    <div className="detail-card">
      <div className="detail-card-header">
        <h3>Contacts · {org.people.length}</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(v => !v)}>+ Add</button>
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
                <span className="person-avatar" style={{ background: avatarColor(person.name || person.email) }}>
                  {initials(person.name || person.email)}
                </span>
                <div className="person-info">
                  <span className="person-name">{person.name || '—'}</span>
                  {person.title && <span className="person-title">{person.title}</span>}
                  {person.email && <a className="person-email" href={`mailto:${person.email}`}>{person.email}</a>}
                </div>
                <PersonCardMenu
                  onEdit={() => { setEditingId(person.id); setEditForm({ name: person.name || '', email: person.email || '', title: person.title || '' }) }}
                  onRemove={() => { if (confirm(`Remove ${person.name || person.email}?`)) remove.mutate(person.id) }}
                />
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

// ── Gmail Import Modal (fixed category, or a picker across `categories`) ──────

function GmailImportModal({ projectId, category, categories, onClose }) {
  const qc = useQueryClient()
  const [email, setEmail] = useState('')
  const [threads, setThreads] = useState(null)
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [importForm, setImportForm] = useState({ org_name: '', contact_name: '', email: '' })
  const [categoryId, setCategoryId] = useState(category?.id ?? categories?.[0]?.id ?? '')

  const importThread = useMutation({
    mutationFn: () => postGmailImport(projectId, Number(categoryId), { thread_id: selected.thread_id, subject: selected.subject, ...importForm }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs', Number(categoryId)] }); onClose() },
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
          {categories && !category && (
            <label className="form-label">Category *
              <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
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
            <button type="submit" className="btn btn-primary" disabled={importThread.isPending || !categoryId}>Import</button>
          </div>
        </form>
      </Modal>
    )
  }

  return (
    <Modal title={category ? `Import from Gmail — ${category.name}` : 'Import from Gmail'} onClose={onClose} wide>
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

// ── Add Organization Modal (fixed category, or a picker across `categories`) ──

function AddOrgModal({ category, categories, onClose }) {
  const qc = useQueryClient()
  const [categoryId, setCategoryId] = useState(category?.id ?? categories?.[0]?.id ?? '')
  const [form, setForm] = useState({ name: '', website: '', ask_type: '', contact_name: '', contact_email: '' })

  const addOrg = useMutation({
    mutationFn: (data) => createOrg(Number(categoryId), data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orgs', Number(categoryId)] }); onClose() },
  })

  return (
    <Modal title={category ? `Add Organization to ${category.name}` : 'Add Organization'} onClose={onClose}>
      <form
        onSubmit={e => {
          e.preventDefault()
          addOrg.mutate({
            name: form.name,
            website: form.website || null,
            ask_type: form.ask_type || null,
            contact_name: form.contact_name || null,
            contact_email: form.contact_email || null,
          })
        }}
        className="form"
      >
        {categories && !category && (
          <label className="form-label">Category *
            <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="form-label">Organization Name *
          <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
        </label>
        <label className="form-label">Website
          <input className="form-input" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
        </label>
        <label className="form-label">Ask Type
          <input className="form-input" value={form.ask_type} onChange={e => setForm(f => ({ ...f, ask_type: e.target.value }))} placeholder="e.g. money, product, paid performance" />
        </label>
        <label className="form-label">Contact Name
          <input className="form-input" value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
        </label>
        <label className="form-label">Contact Email
          <input className="form-input" type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
        </label>
        {addOrg.isError && <p className="error-msg">{addOrg.error?.response?.data?.detail ?? 'Failed to add organization'}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={addOrg.isPending || !categoryId}>Add</button>
        </div>
      </form>
    </Modal>
  )
}

// ── Project Subheader (shared by Inbox + Board) ───────────────────────────────

function ProjectSubheader({ project, view, onViewChange, orgs, onImport, onAddCategory, onAddOrg }) {
  const navigate = useNavigate()
  const confirmedCount = orgs.filter(o => o.status === 'confirmed').length
  const negotiatingCount = orgs.filter(o => o.status === 'negotiating').length

  const subline = view === 'board'
    ? [project?.date, `${orgs.length} organization${orgs.length !== 1 ? 's' : ''}`].filter(Boolean).join(' · ')
    : [project?.date, project?.description].filter(Boolean).join(' · ')

  return (
    <div className="project-subheader">
      <div className="project-subheader-left">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <div>
          <h1 className="project-subheader-title">{project?.name ?? '...'}</h1>
          {subline && <p className="project-subheader-subline">{subline}</p>}
        </div>
      </div>

      <div className="project-subheader-right">
        {view === 'inbox' && (
          <div className="subheader-counters">
            <span className="subheader-counter subheader-counter-confirmed">{confirmedCount} Confirmed</span>
            <span className="subheader-counter subheader-counter-negotiating">{negotiatingCount} In talks</span>
            <span className="subheader-counter">{orgs.length} Total</span>
          </div>
        )}

        <div className="view-switch">
          <button className={`view-switch-btn ${view === 'inbox' ? 'active' : ''}`} onClick={() => onViewChange('inbox')}>Inbox</button>
          <button className={`view-switch-btn ${view === 'board' ? 'active' : ''}`} onClick={() => onViewChange('board')}>Board</button>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={onImport}>⤓ Import from Gmail</button>
        {view === 'inbox'
          ? <button className="btn btn-primary btn-sm" onClick={onAddCategory}>+ Add Category</button>
          : <button className="btn btn-primary btn-sm" onClick={onAddOrg}>+ Add org</button>
        }
      </div>
    </div>
  )
}

// ── Project Inbox (#4a) ────────────────────────────────────────────────────────

const INBOX_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'negotiating', label: 'In talks' },
]

function ProjectInbox({ project, categories, orgs, onAddCategory }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrgId, setSelectedOrgId] = useState(null)
  const [importCategory, setImportCategory] = useState(null)
  const [addOrgCategory, setAddOrgCategory] = useState(null)
  const [collapsedIds, setCollapsedIds] = useState(() => new Set())

  const toggleCategory = (id) => setCollapsedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const filtered = orgs.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (search.trim() && !o.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  const selectedOrg = orgs.find(o => o.id === selectedOrgId) ?? null

  const counts = {
    all: orgs.length,
    confirmed: orgs.filter(o => o.status === 'confirmed').length,
    negotiating: orgs.filter(o => o.status === 'negotiating').length,
  }

  return (
    <div className="inbox-layout">
      <aside className="inbox-sidebar">
        <div className="inbox-sidebar-top">
          <input className="inbox-search-input" placeholder="Search organizations..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="inbox-filter-chips">
            {INBOX_FILTERS.map(f => (
              <button
                key={f.key}
                className={`inbox-filter-chip ${statusFilter === f.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label} {counts[f.key]}
              </button>
            ))}
          </div>
        </div>

        <div className="inbox-org-list">
          {categories.map(cat => {
            const catOrgs = filtered.filter(o => o.category.id === cat.id)
            const catHasAnyOrgs = orgs.some(o => o.category.id === cat.id)
            if (catHasAnyOrgs && catOrgs.length === 0) return null
            const collapsed = collapsedIds.has(cat.id)
            return (
              <div key={cat.id} className="inbox-category-group">
                <div className="inbox-category-header">
                  <button className="inbox-category-toggle" onClick={() => toggleCategory(cat.id)}>
                    <span className={`inbox-category-chevron ${collapsed ? 'collapsed' : ''}`}>▾</span>
                    <span>{cat.name.toUpperCase()} · {catOrgs.length}</span>
                  </button>
                  <div className="inbox-category-actions">
                    <button className="icon-chip" title="Import from Gmail" onClick={() => setImportCategory(cat)}>⤓</button>
                    <button className="icon-chip" title="Add organization" onClick={() => setAddOrgCategory(cat)}>+</button>
                  </div>
                </div>
                {!collapsed && catOrgs.map(org => {
                  const primary = org.people[0]
                  return (
                    <button
                      key={org.id}
                      className={`inbox-org-row ${selectedOrgId === org.id ? 'selected' : ''}`}
                      onClick={() => setSelectedOrgId(org.id)}
                    >
                      <span className="inbox-org-dot" style={{ background: STATUS_DOT_COLORS[org.status] }} />
                      <span className="inbox-org-info">
                        <span className="inbox-org-name">{org.name}</span>
                        <span className="inbox-org-meta">
                          {primary ? (primary.name || primary.email) : 'No contact'} · {STATUS_LABELS[org.status]}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
          {categories.length === 0 && <p className="empty small">No categories yet.</p>}
          {categories.length > 0 && filtered.length === 0 && <p className="empty small">No organizations match.</p>}
        </div>

        <button className="inbox-add-category-btn" onClick={onAddCategory}>+ New category</button>
      </aside>

      <section className="inbox-center">
        {selectedOrg ? (
          <>
            <div className="inbox-center-header">
              <h2>{selectedOrg.name}</h2>
              <StatusBadge status={selectedOrg.status} />
            </div>
            <div className="inbox-center-body">
              <ConversationTab key={selectedOrg.id} org={selectedOrg} categoryId={selectedOrg.category.id} project={project} />
            </div>
          </>
        ) : (
          <div className="inbox-center-empty">
            <p className="muted">Select an organization to see its conversation.</p>
          </div>
        )}
      </section>

      <aside className="inbox-right">
        {selectedOrg ? (
          <>
            <OrgDetailsCard key={`details-${selectedOrg.id}`} org={selectedOrg} categoryId={selectedOrg.category.id} />
            <OrgContactsCard key={`contacts-${selectedOrg.id}`} org={selectedOrg} categoryId={selectedOrg.category.id} />
          </>
        ) : (
          <p className="empty small">No organization selected.</p>
        )}
      </aside>

      {importCategory && (
        <GmailImportModal projectId={project?.id} category={importCategory} onClose={() => setImportCategory(null)} />
      )}
      {addOrgCategory && (
        <AddOrgModal category={addOrgCategory} onClose={() => setAddOrgCategory(null)} />
      )}
    </div>
  )
}

// ── Kanban Board (#3b) ─────────────────────────────────────────────────────────

const BOARD_FILTER_ALL = 'all'

function KanbanBoard({ categories, orgs, onAddOrg }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(BOARD_FILTER_ALL)
  const [dragOverStatus, setDragOverStatus] = useState(null)

  const patchStatus = useMutation({
    mutationFn: ({ categoryId, orgId, status }) => updateOrg(categoryId, orgId, { status }),
    onMutate: async ({ categoryId, orgId, status }) => {
      await qc.cancelQueries({ queryKey: ['orgs', categoryId] })
      const prev = qc.getQueryData(['orgs', categoryId])
      qc.setQueryData(['orgs', categoryId], list => list?.map(o => o.id === orgId ? { ...o, status } : o))
      return { prev, categoryId }
    },
    onError: (_, __, ctx) => { if (ctx) qc.setQueryData(['orgs', ctx.categoryId], ctx.prev) },
    onSettled: (_, __, vars) => qc.invalidateQueries({ queryKey: ['orgs', vars.categoryId] }),
  })

  const filtered = orgs.filter(o => {
    if (categoryFilter !== BOARD_FILTER_ALL && o.category.id !== categoryFilter) return false
    if (search.trim() && !o.name.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  const handleDrop = (e, status) => {
    e.preventDefault()
    setDragOverStatus(null)
    let payload
    try { payload = JSON.parse(e.dataTransfer.getData('text/plain')) } catch { return }
    const org = orgs.find(o => o.id === payload?.orgId)
    if (!org || org.status === status) return
    patchStatus.mutate({ categoryId: org.category.id, orgId: org.id, status })
  }

  return (
    <div className="board-layout">
      <div className="board-filter-bar">
        <input className="board-search-input" placeholder="Search organizations..." value={search} onChange={e => setSearch(e.target.value)} />
        <div className="board-category-chips">
          <button className={`board-chip ${categoryFilter === BOARD_FILTER_ALL ? 'active' : ''}`} onClick={() => setCategoryFilter(BOARD_FILTER_ALL)}>All</button>
          {categories.map(c => (
            <button key={c.id} className={`board-chip ${categoryFilter === c.id ? 'active' : ''}`} onClick={() => setCategoryFilter(c.id)}>{c.name}</button>
          ))}
        </div>
      </div>

      <div className="board-columns">
        {STATUSES.map(status => {
          const columnOrgs = filtered.filter(o => o.status === status)
          return (
            <div
              key={status}
              className={`board-column ${dragOverStatus === status ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOverStatus(status) }}
              onDragLeave={() => setDragOverStatus(s => s === status ? null : s)}
              onDrop={e => handleDrop(e, status)}
            >
              <div className="board-column-header">
                <span className="board-column-dot" style={{ background: STATUS_DOT_COLORS[status] }} />
                <span className="board-column-label">{STATUS_LABELS[status]}</span>
                <span className="board-column-count">{columnOrgs.length}</span>
              </div>
              <div className="board-column-body">
                {columnOrgs.map(org => {
                  const primary = org.people[0]
                  return (
                    <div
                      key={org.id}
                      className="board-card"
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ orgId: org.id }))}
                    >
                      <div className="board-card-top">
                        <span className="board-card-category">{org.category.name}</span>
                        {org.last_contacted_date && (
                          <span className="board-card-date">{new Date(org.last_contacted_date).toLocaleDateString()}</span>
                        )}
                      </div>
                      <div className="board-card-name">{org.name}</div>
                      {org.ask_type && <div className="board-card-ask">{org.ask_type}</div>}
                      {primary && (
                        <div className="board-card-footer">
                          <span className="board-card-avatar" style={{ background: avatarColor(primary.name || primary.email) }}>
                            {initials(primary.name || primary.email)}
                          </span>
                          <span className="board-card-contact">{primary.name || primary.email}</span>
                        </div>
                      )}
                    </div>
                  )
                })}
                <button className="board-add-org-btn" onClick={onAddOrg}>+ Add org</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Project Detail Page (shell) ───────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'board' ? 'board' : 'inbox'

  const [showAddCategory, setShowAddCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [showGmailImport, setShowGmailImport] = useState(false)
  const [showAddOrg, setShowAddOrg] = useState(false)

  const { data: project } = useQuery({ queryKey: ['project', id], queryFn: () => getProject(id) })
  const { data: categories = [] } = useQuery({ queryKey: ['categories', id], queryFn: () => getCategories(id) })

  const orgQueries = useQueries({
    queries: categories.map(cat => ({
      queryKey: ['orgs', cat.id],
      queryFn: () => getOrgs(cat.id),
    })),
  })

  const orgs = categories.flatMap((cat, i) => (orgQueries[i]?.data ?? []).map(o => ({ ...o, category: cat })))

  const setView = (v) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (v === 'inbox') next.delete('view')
      else next.set('view', v)
      return next
    }, { replace: true })
  }

  const addCategory = useMutation({
    mutationFn: () => createCategory(id, { name: categoryName }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories', id] }); setShowAddCategory(false); setCategoryName('') },
  })

  return (
    <div className="project-detail-shell">
      <ProjectSubheader
        project={project}
        view={view}
        onViewChange={setView}
        orgs={orgs}
        onImport={() => setShowGmailImport(true)}
        onAddCategory={() => setShowAddCategory(true)}
        onAddOrg={() => setShowAddOrg(true)}
      />

      {view === 'inbox' ? (
        <ProjectInbox project={project} categories={categories} orgs={orgs} onAddCategory={() => setShowAddCategory(true)} />
      ) : (
        <KanbanBoard categories={categories} orgs={orgs} onAddOrg={() => setShowAddOrg(true)} />
      )}

      {showAddCategory && (
        <Modal title="Add Category" onClose={() => setShowAddCategory(false)}>
          <form onSubmit={e => { e.preventDefault(); addCategory.mutate() }} className="form">
            <label className="form-label">Name *
              <input className="form-input" value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="e.g. Sponsors, Performers, Venues" required />
            </label>
            {addCategory.isError && <p className="error-msg">{addCategory.error?.response?.data?.detail ?? 'Failed to add category'}</p>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddCategory(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={addCategory.isPending}>Add</button>
            </div>
          </form>
        </Modal>
      )}

      {showGmailImport && (
        <GmailImportModal projectId={id} categories={categories} onClose={() => setShowGmailImport(false)} />
      )}
      {showAddOrg && (
        <AddOrgModal categories={categories} onClose={() => setShowAddOrg(false)} />
      )}
    </div>
  )
}
