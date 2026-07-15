import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDashboard, createProject, deleteProject } from '../api'
import { useAuth } from '../context/AuthContext'
import ProjectFormModal from '../components/ProjectFormModal'

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function projectStatusTag(project) {
  if (project.org_count === 0) return { label: 'Planning', tone: 'planning' }
  if (project.date && new Date(project.date) < new Date(new Date().toDateString())) return { label: 'Wrapped', tone: 'wrapped' }
  return { label: 'Active', tone: 'active' }
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const ATTENTION_LABEL = { new_reply: 'NEW REPLY', follow_up: 'FOLLOW UP', deadline: 'DEADLINE' }
const ATTENTION_ICON = { new_reply: '✉', follow_up: '↩', deadline: '⏰' }

const STATUS_ORDER = ['not_contacted', 'contacted', 'responded', 'negotiating', 'confirmed', 'declined']
const STATUS_LABEL = {
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  responded: 'Responded',
  negotiating: 'Negotiating',
  confirmed: 'Confirmed',
  declined: 'Declined',
}

function pipelineBreakdown(counts) {
  return STATUS_ORDER
    .filter(s => s !== 'not_contacted' && counts[s] > 0)
    .map(s => ({ status: s, count: counts[s] }))
}

function pipelineAriaLabel(counts, total) {
  const parts = STATUS_ORDER.filter(s => counts[s] > 0).map(s => `${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`)
  return `${parts.join(', ')} of ${total} organizations`
}

function PipelineBar({ counts, total }) {
  if (!total) return <div className="pipeline-bar pipeline-bar-empty" />
  return (
    <div className="pipeline-bar" role="img" aria-label={pipelineAriaLabel(counts, total)}>
      {STATUS_ORDER.filter(s => counts[s] > 0).map(s => (
        <div
          key={s}
          className={`pipeline-seg pipeline-seg-${s}`}
          style={{ flexGrow: counts[s] }}
          title={`${STATUS_LABEL[s]}: ${counts[s]}`}
        />
      ))}
    </div>
  )
}

function errorDetail(mutation) {
  const detail = mutation.error?.response?.data?.detail
  return typeof detail === 'string' ? detail : 'Something went wrong'
}

export default function HomePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard })
  const projects = data?.projects ?? []
  const attention = data?.attention ?? []

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setShowCreate(false)
      navigate(`/projects/${project.id}`)
    },
  })

  const remove = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  })

  const firstName = (user?.name ?? user?.email ?? '').split(' ')[0]
  const orgsTotal = projects.reduce((sum, p) => sum + p.org_count, 0)
  const confirmedTotal = projects.reduce((sum, p) => sum + p.confirmed_count, 0)

  const attentionCountByProject = attention.reduce((acc, item) => {
    acc[item.project_id] = (acc[item.project_id] || 0) + 1
    return acc
  }, {})

  const tagged = projects.map(p => ({ ...p, tag: projectStatusTag(p) }))
  const activeProjects = tagged
    .filter(p => p.tag.tone === 'active')
    .sort((a, b) =>
      (attentionCountByProject[b.id] || 0) - (attentionCountByProject[a.id] || 0)
      || new Date(b.updated_at) - new Date(a.updated_at)
    )
  const otherProjects = tagged
    .filter(p => p.tag.tone !== 'active')
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

  const confirmDelete = (project) => {
    if (confirm(`Delete "${project.name}"? This removes all its categories, organizations, and threads.`)) {
      remove.mutate(project.id)
    }
  }

  return (
    <div className="home-layout">
      <div className="home-main">
        <div className="home-header">
          <div>
            <h1 className="home-greeting">{greeting()}, {firstName || 'there'}</h1>
            <p className="home-summary">
              {projects.length} project{projects.length !== 1 ? 's' : ''} · {orgsTotal} organization{orgsTotal !== 1 ? 's' : ''} · {confirmedTotal} confirmed
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New project</button>
        </div>

        {isLoading && <p className="muted">Loading...</p>}
        {!isLoading && projects.length === 0 && (
          <p className="empty">No projects yet. Create one to get started.</p>
        )}

        {activeProjects.length > 0 && (
          <div className="project-row-list">
            {activeProjects.map(p => {
              const flagCount = attentionCountByProject[p.id] || 0
              const breakdown = pipelineBreakdown(p.status_counts)
              return (
                <div key={p.id} className="project-row" onClick={() => navigate(`/projects/${p.id}`)}>
                  <div className="project-row-main">
                    <div className="project-row-heading">
                      <h3 className="project-row-name">{p.name}</h3>
                      <span className={`status-tag status-tag-${p.tag.tone}`}>{p.tag.label}</span>
                      {flagCount > 0 && (
                        <span className="project-row-flag">{flagCount} need{flagCount !== 1 ? 's' : ''} attention</span>
                      )}
                    </div>
                    <div className="project-row-meta">
                      {p.date && <span>{p.date}</span>}
                      <span>{p.category_count} categor{p.category_count !== 1 ? 'ies' : 'y'}</span>
                      <span>Updated {timeAgo(p.updated_at)}</span>
                    </div>
                    {p.description && <p className="project-row-desc">{p.description}</p>}
                  </div>

                  <div className="project-row-pipeline">
                    <span className="pipeline-total">{p.org_count} organization{p.org_count !== 1 ? 's' : ''}</span>
                    <PipelineBar counts={p.status_counts} total={p.org_count} />
                    <div className="pipeline-tags">
                      {breakdown.length > 0
                        ? breakdown.map(({ status, count }) => (
                          <span key={status} className="ptag">
                            <span className={`ptag-dot ptag-dot-${status}`} />
                            {count} {STATUS_LABEL[status].toLowerCase()}
                          </span>
                        ))
                        : p.org_count > 0 && <span className="ptag muted">Not started yet</span>}
                    </div>
                  </div>

                  <button
                    className="project-row-delete"
                    title="Delete project"
                    onClick={e => { e.stopPropagation(); confirmDelete(p) }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {otherProjects.length > 0 && (
          <div className="home-compact-section">
            <h2 className="home-compact-heading">Planning &amp; wrapped</h2>
            <div className="project-compact-list">
              {otherProjects.map(p => (
                <div key={p.id} className="project-compact-row" onClick={() => navigate(`/projects/${p.id}`)}>
                  <span className={`status-tag status-tag-${p.tag.tone} status-tag-sm`}>{p.tag.label}</span>
                  <span className="project-compact-name">{p.name}</span>
                  {p.date && <span className="project-compact-date">{p.date}</span>}
                  <span className="project-compact-count muted">
                    {p.org_count} org{p.org_count !== 1 ? 's' : ''}
                    {p.confirmed_count > 0 ? ` · ${p.confirmed_count} confirmed` : ''}
                  </span>
                  <button
                    className="project-compact-delete"
                    title="Delete project"
                    onClick={e => { e.stopPropagation(); confirmDelete(p) }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="home-rail">
        <div className="home-rail-header">
          <h2>Needs attention</h2>
          {attention.length > 0 && <span className="attention-count">{attention.length}</span>}
        </div>
        {attention.length === 0 ? (
          <p className="empty small">Nothing needs your attention right now.</p>
        ) : (
          <div className="attention-list">
            {attention.map((item, i) => (
              <button key={i} className="attention-card" onClick={() => navigate(`/projects/${item.project_id}`)}>
                <span className={`attention-icon attention-icon-${item.type}`}>{ATTENTION_ICON[item.type]}</span>
                <div className="attention-body">
                  <span className={`attention-badge attention-badge-${item.type}`}>{ATTENTION_LABEL[item.type]}</span>
                  <div className="attention-title">{item.org_name || item.project_name}</div>
                  <div className="attention-note">{item.note}</div>
                  <div className="attention-project">{item.project_name}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      {showCreate && (
        <ProjectFormModal
          mode="create"
          onSubmit={values => create.mutate(values)}
          onClose={() => setShowCreate(false)}
          pending={create.isPending}
          error={create.isError ? errorDetail(create) : null}
        />
      )}
    </div>
  )
}
