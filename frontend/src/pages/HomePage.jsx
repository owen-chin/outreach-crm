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

        <div className="home-project-grid">
          {projects.map(p => {
            const tag = projectStatusTag(p)
            const pct = Math.round((p.outreach_pct ?? 0) * 100)
            return (
              <div key={p.id} className="home-project-card" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="home-project-card-top">
                  <div>
                    <h3 className="home-project-name">{p.name}</h3>
                    {p.date && <span className="home-project-date">{p.date}</span>}
                  </div>
                  <div className="home-project-card-top-right">
                    <span className={`status-tag status-tag-${tag.tone}`}>{tag.label}</span>
                    <button
                      className="home-project-delete"
                      title="Delete project"
                      onClick={e => { e.stopPropagation(); if (confirm(`Delete "${p.name}"? This removes all its categories, organizations, and threads.`)) remove.mutate(p.id) }}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <p className="home-project-desc">{p.description || ''}</p>
                <div className="home-project-stats">
                  <div className="home-project-stat">
                    <span className="home-project-stat-value">{p.org_count}</span>
                    <span className="home-project-stat-label">Orgs</span>
                  </div>
                  <div className="home-project-stat">
                    <span className="home-project-stat-value home-project-stat-confirmed">{p.confirmed_count}</span>
                    <span className="home-project-stat-label">Confirmed</span>
                  </div>
                  <div className="home-project-stat">
                    <span className="home-project-stat-value">{p.negotiating_count}</span>
                    <span className="home-project-stat-label">In talks</span>
                  </div>
                </div>
                <div className="home-project-progress">
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="home-project-progress-labels">
                    <span className="muted">Updated {timeAgo(p.updated_at)}</span>
                    <span>{pct}% outreach</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
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
