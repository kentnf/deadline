import React, { useState, useEffect } from 'react'
import { overridesApi } from '../api'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'

interface Override {
  id: number
  section_id: number | null
  override_type: string
  original_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  user_reason: string | null
  created_at: string
}

interface Props {
  projectId: number
  onClose: () => void
}

export default function RuleOverridePanel({ projectId, onClose }: Props) {
  const t = useT()
  const [overridesBySection, setOverridesBySection] = useState<Record<string, Override[]>>({})
  const { addToast } = useToastStore()

  const load = async () => {
    try {
      const res = await overridesApi.list(projectId)
      setOverridesBySection(res.data)
    } catch {
      addToast(t('加载规则覆盖失败'), 'error')
    }
  }

  useEffect(() => { load() }, [])

  const handleRevert = async (overrideId: number) => {
    try {
      await overridesApi.delete(projectId, overrideId)
      addToast(t('规则已恢复'), 'success')
      load()
    } catch {
      addToast(t('撤销失败'), 'error')
    }
  }

  const typeLabel: Record<string, string> = {
    word_limit: t('字数限制'), title: t('标题'), writing_guide: t('写作要求'),
    new_section: t('新增章节'), merge_sections: t('合并章节'), remove_limit: t('移除限制'),
  }

  const allOverrides = Object.values(overridesBySection).flat()

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontWeight: 700, margin: 0 }}>{t('规则覆盖管理')}</h2>
        <button onClick={onClose} style={btnStyle}>{t('关闭')}</button>
      </div>

      {allOverrides.length === 0 ? (
        <p style={{ color: '#888' }}>{t('暂无规则覆盖。在对话中表达调整意图后，AI 会引导你确认规则变更。')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allOverrides.map(o => (
            <div key={o.id} style={{ border: '1px solid #e0e0e0', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span style={{ fontWeight: 600, marginRight: 8 }}>{typeLabel[o.override_type] || o.override_type}</span>
                  <span style={{ fontSize: 12, color: '#888' }}>{o.created_at ? new Date(o.created_at).toLocaleString() : ''}</span>
                  {o.user_reason && <div style={{ marginTop: 4, fontSize: 13, color: '#555' }}>{t('原因：')}{o.user_reason}</div>}
                  {o.original_value && (
                    <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                      {t('原始：')}{JSON.stringify(o.original_value)}{t(' → 新值：')}{JSON.stringify(o.new_value)}
                    </div>
                  )}
                </div>
                <button onClick={() => handleRevert(o.id)} style={{ ...btnStyle, background: '#ff7875', padding: '4px 10px', fontSize: 12 }}>{t('撤销')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 14px', background: '#1890ff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer',
}
