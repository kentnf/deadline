import { BrowserRouter, Routes, Route, Link, Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ProjectsPage from './pages/ProjectsPage'
import TemplatesPage from './pages/TemplatesPage'
import EditorPage from './pages/EditorPage'
import LLMSettingsPage from './pages/LLMSettingsPage'
import PapersPage from './pages/PapersPage'
import ProfilePage from './pages/ProfilePage'
import ToastContainer from './components/ToastContainer'
import { LanguageProvider, useLang, useT } from './i18n'

export default function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<ProjectsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="papers" element={<PapersPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings/llm" element={<LLMSettingsPage />} />
          </Route>
          <Route path="/editor/:projectId" element={<EditorPage />} />
        </Routes>
        <ToastContainer />
      </BrowserRouter>
    </LanguageProvider>
  )
}

function Layout() {
  const t = useT()
  const { lang, setLang } = useLang()
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    fetch('/api/version').then(r => r.json()).then(d => setVersion(d.version)).catch(() => {})
  }, [])

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ background: '#001529', color: '#fff', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', gap: 24 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>Deadline</span>
        <Link to="/" style={{ color: '#a0c4ff', textDecoration: 'none' }}>{t('我的项目')}</Link>
        <Link to="/templates" style={{ color: '#a0c4ff', textDecoration: 'none' }}>{t('模版管理')}</Link>
        <Link to="/papers" style={{ color: '#a0c4ff', textDecoration: 'none' }}>📄 {t('文章管理')}</Link>
        <Link to="/profile" style={{ color: '#a0c4ff', textDecoration: 'none' }}>👤 {t('基础信息')}</Link>
        <div style={{ flex: 1 }} />
        <Link to="/settings/llm" style={{ color: '#a0c4ff', textDecoration: 'none', fontSize: 13 }}>⚙ {t('LLM 设置')}</Link>
        {version && <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>v{version}</span>}
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          style={{ background: 'none', border: '1px solid #a0c4ff', color: '#a0c4ff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 13 }}
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </nav>
      <Outlet />
    </div>
  )
}
