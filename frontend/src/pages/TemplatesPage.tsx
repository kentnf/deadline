import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { templatesApi, type TemplateSection } from '../api'
import { useToastStore } from '../stores/toastStore'
import TemplateConfirmationView from '../components/TemplateConfirmationView'
import { useT } from '../i18n'

interface Template {
  id: number
  name: string
  section_count: number
  created_at: string
}

export default function TemplatesPage() {
  const t = useT()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [fileId, setFileId] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [parsedSections, setParsedSections] = useState<TemplateSection[] | null>(null)
  const [parsing, setParsing] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const { addToast } = useToastStore()

  const loadTemplates = async () => {
    try {
      const res = await templatesApi.list()
      setTemplates(res.data)
    } catch {
      addToast(t('加载模版失败'), 'error')
    }
  }

  useEffect(() => { loadTemplates() }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.docx')) {
      addToast(t('只支持 .docx 文件'), 'error')
      return
    }
    setUploading(true)
    setUploadProgress(30)
    try {
      const res = await templatesApi.upload(file)
      setFileId(res.data.file_id)
      setFileName(file.name)
      setUploadProgress(100)
    } catch {
      addToast(t('上传失败'), 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleParse = async () => {
    if (!fileId) return
    setParsing(true)
    try {
      const res = await templatesApi.parse(fileId)
      setParsedSections(res.data.sections)
    } catch (err: any) {
      const detail = err.response?.data?.detail || ''
      if (detail.includes('未配置') || detail.includes('LLM')) {
        addToast(t('LLM 未配置，请前往 LLM 设置页面配置后再解析'), 'error')
      } else {
        addToast(t('解析失败，请检查 LLM 配置'), 'error')
      }
    } finally {
      setParsing(false)
    }
  }

  const handleSaveTemplate = async (name: string, sections: TemplateSection[]) => {
    setLoading(true)
    try {
      await templatesApi.save({ name, sections })
      addToast(t('模版保存成功'), 'success')
      setParsedSections(null)
      setFileId(null)
      setFileName('')
      loadTemplates()
    } catch {
      addToast(t('保存失败'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await templatesApi.delete(id)
      addToast(t('删除成功'), 'success')
      setDeleteConfirm(null)
      loadTemplates()
    } catch (err: any) {
      if (err.response?.status === 409) {
        const force = window.confirm(t('该模版有关联项目，确定强制删除吗？'))
        if (force) {
          await templatesApi.delete(id, true)
          addToast(t('强制删除成功'), 'success')
          setDeleteConfirm(null)
          loadTemplates()
        }
      } else {
        addToast(t('删除失败'), 'error')
      }
    }
  }

  if (parsedSections) {
    return (
      <TemplateConfirmationView
        fileName={fileName}
        initialSections={parsedSections}
        onSave={handleSaveTemplate}
        onCancel={() => { setParsedSections(null); setFileId(null) }}
        saving={loading}
      />
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>{t('模版管理')}</h1>

      {/* Upload */}
      <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 20, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{t('上传模版')}</h2>
        <input type="file" accept=".docx" onChange={handleFileChange} disabled={uploading} />
        {uploading && (
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 4, background: '#e0e0e0', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#1890ff', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: 12, color: '#888' }}>{t('上传中…')}</span>
          </div>
        )}

        {fileId && !parsedSections && (
          <div style={{ marginTop: 16 }}>
            <p style={{ marginBottom: 8, color: '#555', fontSize: 14 }}>
              {t('已上传：')} <strong>{fileName}</strong>。{t('点击解析将使用全局 LLM 配置解析模版结构。')}
              （{t('未配置 LLM？请先前往')} <Link to="/settings/llm" style={{ color: '#1890ff' }}>{t('LLM 设置')}</Link> {t('配置。')}）
            </p>
            <button onClick={handleParse} disabled={parsing || loading} style={btnStyle}>
              {parsing ? t('解析中…') : t('开始解析')}
            </button>
          </div>
        )}
      </div>

      {/* Template list */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{t('已保存模版')}</h2>
      {templates.length === 0 ? (
        <div style={{ border: '1px dashed #d0d0d0', borderRadius: 8, padding: 32, textAlign: 'center', color: '#666', background: '#fafafa' }}>
          <div style={{ fontSize: 15, marginBottom: 8 }}>{t('还没有模版')}</div>
          <div style={{ fontSize: 13, color: '#999', marginBottom: 20 }}>
            {t('可以导入示例模版快速体验，或使用上方上传区域添加自己的 Word 模版')}
          </div>
          <button
            onClick={async () => {
              try {
                await fetch('/api/templates/import-sample', { method: 'POST' })
                const list = await templatesApi.list()
                setTemplates(list.data)
              } catch {
                // ignore
              }
            }}
            style={{ background: '#1677ff', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontSize: 14 }}
          >
            {t('导入示例模版')}
          </button>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
              <th style={thStyle}>{t('名称')}</th>
              <th style={thStyle}>{t('章节数')}</th>
              <th style={thStyle}>{t('创建时间')}</th>
              <th style={thStyle}>{t('操作')}</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tmpl) => (
              <tr key={tmpl.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={tdStyle}>{tmpl.name}</td>
                <td style={tdStyle}>{tmpl.section_count}</td>
                <td style={tdStyle}>{new Date(tmpl.created_at).toLocaleDateString()}</td>
                <td style={tdStyle}>
                  {deleteConfirm === tmpl.id ? (
                    <>
                      <span style={{ color: '#ff4d4f', marginRight: 8 }}>{t('确定删除？')}</span>
                      <button onClick={() => handleDelete(tmpl.id)} style={{ ...btnStyle, background: '#ff4d4f', marginRight: 4 }}>{t('确定')}</button>
                      <button onClick={() => setDeleteConfirm(null)} style={btnStyle}>{t('取消')}</button>
                    </>
                  ) : (
                    <button onClick={() => setDeleteConfirm(tmpl.id)} style={{ ...btnStyle, background: '#ff4d4f' }}>{t('删除')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
}
const thStyle: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#555' }
const tdStyle: React.CSSProperties = { padding: '8px 12px' }
