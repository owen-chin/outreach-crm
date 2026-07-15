import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuthStatus, getGoogleAuthUrl, disconnectGoogle } from '../api'
import { useTheme } from '../context/ThemeContext'

export default function SettingsPage() {
  const qc = useQueryClient()
  const { theme, toggleTheme } = useTheme()

  const { data: status, isLoading } = useQuery({ queryKey: ['auth-status'], queryFn: getAuthStatus })

  const connect = useMutation({
    mutationFn: async () => {
      const { auth_url } = await getGoogleAuthUrl()
      window.location.href = auth_url
    },
  })

  const disconnect = useMutation({
    mutationFn: disconnectGoogle,
    onSuccess: () => qc.invalidateQueries(['auth-status']),
  })

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <h3>Gmail</h3>
            <p className="muted">Connect your Gmail account to send outreach emails.</p>
          </div>
          {isLoading ? (
            <span className="muted">Checking...</span>
          ) : status?.connected ? (
            <div className="settings-connected">
              <span className="badge badge-confirmed">Connected</span>
              <button className="btn btn-danger btn-sm" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => connect.mutate()} disabled={connect.isPending}>
              Connect Gmail
            </button>
          )}
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div>
            <h3>Dark mode</h3>
            <p className="muted">Switch between a light and dark interface.</p>
          </div>
          <button
            type="button"
            className={`theme-switch ${theme === 'dark' ? 'is-on' : ''}`}
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label="Toggle dark mode"
            onClick={toggleTheme}
          >
            <span className="theme-switch-thumb" />
          </button>
        </div>
      </div>
    </div>
  )
}
