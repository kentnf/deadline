import { useState, useEffect, useRef } from 'react'
import { useT } from '../i18n'

interface Tag {
  id: number
  name: string
}

interface Paper {
  id: number
  title: string | null
  authors: string | null
  abstract: string | null
  keywords: string | null
  scientific_significance: string | null
  status: string
  file_name: string
  created_at: string | null
  project_ids: number[]
  tags: Tag[]
}

interface Project {
  id: number
  name: string
}

const API = '/api'

export default function PapersPage() {
  const t = useT()
  const [papers, setPapers] = useState<Paper[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<Paper | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function loadPapers() {
    const res = await fetch(`${API}/papers`)
    const data = await res.json()
    setPapers(data)
  }

  async function loadProjects() {
    const res = await fetch(`${API}/projects`)
    const data = await res.json()
    setProjects(data)
  }

  async function loadTags() {
    const res = await fetch(`${API}/tags`)
    const data = await res.json()
    setTags(data)
  }

  async function loadDetail(id: number) {
    const res = await fetch(`${API}/papers/${id}`)
    const data = await res.json()
    setDetail(data)
  }

  useEffect(() => {
    loadPapers()
    loadProjects()
    loadTags()
  }, [])

  useEffect(() => {
    if (selectedId !== null) loadDetail(selectedId)
    else setDetail(null)
  }, [selectedId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`${API}/papers/upload`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || t('上传失败'))
      await loadPapers()
      setSelectedId(data.id)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleFieldBlur(field: string, value: string) {
    if (!detail) return
    setSaving(true)
    try {
      await fetch(`${API}/papers/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      await loadPapers()
      await loadDetail(detail.id)
    } finally {
      setSaving(false)
    }
  }

  async function handleAssociation(projectId: number, checked: boolean) {
    if (!detail) return
    const url = `${API}/papers/${detail.id}/projects/${projectId}`
    if (checked) {
      await fetch(url, { method: 'POST' })
    } else {
      await fetch(url, { method: 'DELETE' })
    }
    await loadDetail(detail.id)
  }

  async function handleDelete(id: number) {
    if (!confirm(t('确认删除此论文？将同时删除文件和所有项目关联。'))) return
    await fetch(`${API}/papers/${id}`, { method: 'DELETE' })
    if (selectedId === id) setSelectedId(null)
    await loadPapers()
  }

  async function handleAddTag() {
    if (!detail || !newTagInput.trim()) return
    const name = newTagInput.trim()
    // Find existing tag or create new one
    let tag = tags.find(tg => tg.name === name)
    if (!tag) {
      const res = await fetch(`${API}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        // Tag might already exist with different casing — reload and find
        await loadTags()
        tag = tags.find(tg => tg.name.toLowerCase() === name.toLowerCase())
        if (!tag) return
      } else {
        tag = await res.json()
        await loadTags()
      }
    }
    if (detail.tags.some(tg => tg.id === tag!.id)) {
      setNewTagInput('')
      return
    }
    await fetch(`${API}/papers/${detail.id}/tags/${tag!.id}`, { method: 'POST' })
    setNewTagInput('')
    await loadDetail(detail.id)
    await loadPapers()
  }

  async function handleRemoveTag(tagId: number) {
    if (!detail) return
    await fetch(`${API}/papers/${detail.id}/tags/${tagId}`, { method: 'DELETE' })
    await loadDetail(detail.id)
    await loadPapers()
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ready: '#52c41a',
      processing: '#faad14',
      failed: '#ff4d4f',
    }
    const labels: Record<string, string> = {
      ready: t('已就绪'),
      processing: t('处理中'),
      failed: t('提取失败'),
    }
    return (
      <span style={{
        background: colors[status] || '#999', color: '#fff',
        borderRadius: 4, padding: '1px 8px', fontSize: 12,
      }}>
        {labels[status] || status}
      </span>
    )
  }

  const filteredPapers = selectedTagId === null
    ? papers
    : papers.filter(p => p.tags.some(tg => tg.id === selectedTagId))

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', fontFamily: 'system-ui' }}>
      {/* Left panel: tag filter + list */}
      <div style={{ width: 320, borderRight: '1px solid #e8e8e8', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, flex: 1 }}>{t('文章管理')}</span>
          <label style={{
            background: uploading ? '#d9d9d9' : '#1677ff', color: '#fff',
            padding: '4px 12px', borderRadius: 6, cursor: uploading ? 'default' : 'pointer', fontSize: 13,
          }}>
            {uploading ? t('上传中…') : t('+ 上传 PDF')}
            <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
          </label>
        </div>

        {/* Tag filter chips */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            onClick={() => setSelectedTagId(null)}
            style={{
              padding: '2px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer', border: 'none',
              background: selectedTagId === null ? '#1677ff' : '#f0f0f0',
              color: selectedTagId === null ? '#fff' : '#555',
            }}
          >{t('全部')}</button>
          {tags.map(tg => (
            <button
              key={tg.id}
              onClick={() => setSelectedTagId(tg.id)}
              style={{
                padding: '2px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer', border: 'none',
                background: selectedTagId === tg.id ? '#1677ff' : '#f0f0f0',
                color: selectedTagId === tg.id ? '#fff' : '#555',
              }}
            >{tg.name}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredPapers.length === 0 && (
            <div style={{ padding: 24, color: '#999', textAlign: 'center', fontSize: 13 }}>
              {t('暂无文章，点击「上传 PDF」添加')}
            </div>
          )}
          {filteredPapers.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                background: selectedId === p.id ? '#e6f4ff' : '#fff',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.title || p.file_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {statusBadge(p.status)}
                  <span style={{ fontSize: 11, color: '#999' }}>{p.file_name}</span>
                </div>
                {p.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                    {p.tags.map(tg => (
                      <span key={tg.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#e6f4ff', color: '#1677ff' }}>{tg.name}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={e => { e.stopPropagation(); handleDelete(p.id) }}
                style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}
              >✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel: detail */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {!detail ? (
          <div style={{ color: '#999', textAlign: 'center', marginTop: 60 }}>{t('从左侧选择一篇文章查看详情')}</div>
        ) : (
          <div style={{ maxWidth: 720 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{detail.title || detail.file_name}</h2>
              {statusBadge(detail.status)}
              {saving && <span style={{ fontSize: 12, color: '#999' }}>{t('保存中…')}</span>}
            </div>

            {detail.status === 'failed' && (
              <div style={{ background: '#fff2f0', border: '1px solid #ffa39e', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: '#cf1322' }}>
                {t('PDF 文本提取失败（可能是扫描版或加密文件），请手动填写以下字段。')}
              </div>
            )}

            {/* Tags section */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 500, fontSize: 13, display: 'block', marginBottom: 8 }}>{t('标签')}</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {detail.tags.map(tg => (
                  <span key={tg.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 12, background: '#e6f4ff', color: '#1677ff', fontSize: 12 }}>
                    {tg.name}
                    <button
                      onClick={() => handleRemoveTag(tg.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1677ff', padding: 0, lineHeight: 1, fontSize: 12 }}
                    >✕</button>
                  </span>
                ))}
                {detail.tags.length === 0 && <span style={{ fontSize: 12, color: '#999' }}>{t('暂无')}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={newTagInput}
                  onChange={e => setNewTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() } }}
                  placeholder={t('标签名称')}
                  list="tag-suggestions"
                  style={{ flex: 1, padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13 }}
                />
                <datalist id="tag-suggestions">
                  {tags.filter(tg => !detail.tags.some(dt => dt.id === tg.id)).map(tg => (
                    <option key={tg.id} value={tg.name} />
                  ))}
                </datalist>
                <button
                  onClick={handleAddTag}
                  disabled={!newTagInput.trim()}
                  style={{ padding: '4px 12px', background: '#1677ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                >{t('添加标签')}</button>
              </div>
            </div>

            {([
              { key: 'title', label: t('标题'), multiline: false },
              { key: 'authors', label: t('作者'), multiline: false },
              { key: 'keywords', label: t('关键词'), multiline: false },
            ] as { key: keyof Paper; label: string; multiline: boolean }[]).map(({ key, label }) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 500, fontSize: 13, display: 'block', marginBottom: 4 }}>{label}</label>
                <input
                  key={detail.id + key}
                  defaultValue={(detail[key] as string) || ''}
                  onBlur={e => handleFieldBlur(key, e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            ))}

            {([
              { key: 'abstract', label: t('摘要'), rows: 5 },
              { key: 'scientific_significance', label: t('科学意义（用于 AI 提示词注入）'), rows: 3 },
            ] as { key: keyof Paper; label: string; rows: number }[]).map(({ key, label, rows }) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 500, fontSize: 13, display: 'block', marginBottom: 4 }}>{label}</label>
                <textarea
                  key={detail.id + key}
                  defaultValue={(detail[key] as string) || ''}
                  onBlur={e => handleFieldBlur(key, e.target.value)}
                  rows={rows}
                  style={{ width: '100%', padding: '6px 10px', border: '1px solid #d9d9d9', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>
            ))}

            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{t('关联项目')}</h3>
              {projects.length === 0 ? (
                <div style={{ color: '#999', fontSize: 13 }}>{t('暂无项目')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projects.map(proj => (
                    <label key={proj.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={detail.project_ids.includes(proj.id)}
                        onChange={e => handleAssociation(proj.id, e.target.checked)}
                      />
                      {proj.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
