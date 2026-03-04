import React, { useState } from 'react'
import type { TemplateSection } from '../api'
import { useT } from '../i18n'

interface Props {
  fileName: string
  initialSections: TemplateSection[]
  onSave: (name: string, sections: TemplateSection[]) => void
  onCancel: () => void
  saving: boolean
}

export default function TemplateConfirmationView({ fileName, initialSections, onSave, onCancel, saving }: Props) {
  const t = useT()
  const [name, setName] = useState(fileName.replace('.docx', ''))
  const [sections, setSections] = useState<TemplateSection[]>(initialSections.map((s, i) => ({ ...s, order: s.order ?? i })))

  const updateSection = (idx: number, key: keyof TemplateSection, value: unknown) => {
    setSections((prev) => prev.map((s, i) => i === idx ? { ...s, [key]: value } : s))
  }

  const addSection = () => {
    const newSec: TemplateSection = {
      title: t('新章节'), level: 1, word_limit: null, writing_guide: null,
      order: sections.length, parent_id: null,
    }
    setSections((prev) => [...prev, newSec])
  }

  const deleteSection = (idx: number) => {
    setSections((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    const withOrder = sections.map((s, i) => ({ ...s, order: i }))
    onSave(name, withOrder)
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t('确认模版结构')}</h1>
      <p style={{ color: '#666', marginBottom: 16 }}>{t('来源：')}{fileName}。{t('请检查并完善每个章节的写作要求。')}</p>

      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <label style={{ fontWeight: 600 }}>{t('模版名称：')}</label>
        <input value={name} onChange={e => setName(e.target.value)} style={{ padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: 4, width: 280 }} />
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button onClick={addSection} style={btnStyle}>{t('+ 添加章节')}</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sections.map((sec, idx) => (
          <div key={idx} style={{
            border: '1px solid #e0e0e0', borderRadius: 6, padding: 12,
            marginLeft: (sec.level - 1) * 20,
            background: sec.level === 1 ? '#fafafa' : '#fff',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, color: '#888', minWidth: 28 }}>L{sec.level}</span>
              <input
                value={sec.title}
                onChange={e => updateSection(idx, 'title', e.target.value)}
                style={{ flex: 1, padding: '4px 8px', border: '1px solid #d0d0d0', borderRadius: 4, fontWeight: 600 }}
                placeholder={t('章节标题')}
              />
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {t('级别:')}
                <select value={sec.level} onChange={e => updateSection(idx, 'level', parseInt(e.target.value))} style={{ padding: '4px', border: '1px solid #d0d0d0', borderRadius: 4 }}>
                  <option value={1}>{t('1级')}</option>
                  <option value={2}>{t('2级')}</option>
                  <option value={3}>{t('3级')}</option>
                </select>
              </label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {t('字数限制:')}
                <input
                  type="number"
                  value={sec.word_limit ?? ''}
                  onChange={e => updateSection(idx, 'word_limit', e.target.value ? parseInt(e.target.value) : null)}
                  style={{ width: 80, padding: '4px', border: '1px solid #d0d0d0', borderRadius: 4 }}
                  placeholder={t('无限制')}
                />
              </label>
              <button onClick={() => deleteSection(idx)} style={{ ...btnStyle, background: '#ff7875', padding: '4px 10px' }}>×</button>
            </div>
            <textarea
              value={sec.writing_guide ?? ''}
              onChange={e => updateSection(idx, 'writing_guide', e.target.value || null)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', border: '1px solid #e0e0e0', borderRadius: 4, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder={t('写作要求（可留空）')}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
        <button onClick={handleSave} disabled={!name || saving} style={{ ...btnStyle, background: '#52c41a' }}>
          {saving ? t('保存中…') : t('保存模版')}
        </button>
        <button onClick={onCancel} style={{ ...btnStyle, background: '#8c8c8c' }}>{t('取消')}</button>
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
}
