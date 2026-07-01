import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import TemplatesPage from './pages/TemplatesPage'
import SettingsPage from './pages/SettingsPage'

const queryClient = new QueryClient()

function GmailCallbackHandler() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('gmail') === 'connected') {
      navigate('/settings', { replace: true })
    }
  }, [location, navigate])

  return null
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <GmailCallbackHandler />
        <Layout>
          <Routes>
            <Route path="/" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
