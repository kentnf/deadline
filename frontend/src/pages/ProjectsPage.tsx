import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { projectsApi, templatesApi } from '../api'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'

interface Project {
  id: number
  name: string
  template_name: string
  status: string
  completion_percentage: number
  updated_at: string
}

interface Template {
  id: number
  name: string
}

export default function ProjectsPage() {
  const t = useT()
  const [projects, setProjects] = useState<Project[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTemplateId, setNewTemplateId] = useState<number | ''>('')
  const [creating, setCreating] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const { addToast } = useToastStore()
  const navigate = useNavigate()

  const load = async () => {
    try {
      const [pRes, tRes] = await Promise.all([projectsApi.list(), templatesApi.list()])
      setProjects(pRes.data)
      setTemplates(tRes.data)
    } catch {
      addToast(t('加载失败'), 'error')
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newName || !newTemplateId) return
    setCreating(true)
    try {
      const res = await projectsApi.create(newName, newTemplateId as number)
      addToast(t('项目创建成功'), 'success')
      setShowModal(false)
      setNewName('')
      setNewTemplateId('')
      navigate(`/editor/${res.data.project_id}`)
    } catch {
      addToast(t('创建失败'), 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await projectsApi.delete(id)
      addToast(t('项目已删除'), 'success')
      setDeleteConfirm(null)
      load()
    } catch {
      addToast(t('删除失败'), 'error')
    }
  }

  const statusLabel: Record<string, string> = {
    draft: t('草稿'), in_progress: t('进行中'), complete: t('已完成'),
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{t('我的项目')}</h1>
        <button onClick={() => setShowModal(true)} style={btnStyle}>{t('+ 新建项目')}</button>
      </div>

      {projects.length === 0 ? (
        <div style={{ border: '1px dashed #d0d0d0', borderRadius: 8, padding: 32, color: '#666', background: '#fafafa', maxWidth: 480 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>{t('开始使用')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ background: '#1677ff', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>1</span>
              <span style={{ fontSize: 13 }}>
                {t('前往')} <Link to="/templates" style={{ color: '#1677ff' }}>{t('模版管理')}</Link> {t('添加或导入一个模版')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ background: '#d0d0d0', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>2</span>
              <span style={{ fontSize: 13, color: '#999' }}>{t('回到这里点击「+ 新建项目」选择模版开始写作')}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {projects.map((p) => (
            <div key={p.id} style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, background: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{t('模版管理')}：{p.template_name} · {t('状态')}：{statusLabel[p.status] || p.status}</div>
                <CompletionBar pct={p.completion_percentage} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
                <button onClick={() => navigate(`/editor/${p.id}`)} style={btnStyle}>{t('继续写作')}</button>
                {deleteConfirm === p.id ? (
                  <>
                    <button onClick={() => handleDelete(p.id)} style={{ ...btnStyle, background: '#ff4d4f' }}>{t('确定删除')}</button>
                    <button onClick={() => setDeleteConfirm(null)} style={{ ...btnStyle, background: '#8c8c8c' }}>{t('取消')}</button>
                  </>
                ) : (
                  <button onClick={() => setDeleteConfirm(p.id)} style={{ ...btnStyle, background: '#ff7875' }}>{t('删除')}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 32, width: 400 }}>
            <h2 style={{ marginBottom: 20, fontWeight: 700 }}>{t('新建项目')}</h2>
            <label style={{ display: 'block', marginBottom: 12 }}>
              {t('项目名称')}
              <input value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} placeholder={t('例如：2025年国自然面上项目')} />
            </label>
            <label style={{ display: 'block', marginBottom: 20 }}>
              {t('选择模版')}
              <select value={newTemplateId} onChange={e => setNewTemplateId(e.target.value ? parseInt(e.target.value) : '')} style={inputStyle}>
                <option value="">{t('请选择模版')}</option>
                {templates.map(t2 => <option key={t2.id} value={t2.id}>{t2.name}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCreate} disabled={!newName || !newTemplateId || creating} style={{ ...btnStyle, background: '#52c41a' }}>
                {creating ? t('创建中…') : t('创建')}
              </button>
              <button onClick={() => setShowModal(false)} style={{ ...btnStyle, background: '#8c8c8c' }}>{t('取消')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CompletionBar({ pct }: { pct: number }) {
  const t = useT()
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 12, color: '#888' }}>
        <span>{t('完成度')}</span><span>{pct}%</span>
      </div>
      <div style={{ height: 6, background: '#e0e0e0', borderRadius: 3 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#52c41a' : '#1890ff', borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap',
}
const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, padding: '8px 10px', border: '1px solid #d0d0d0', borderRadius: 4,
}
