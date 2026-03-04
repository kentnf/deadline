import { useState, useEffect } from 'react'
import { useT } from '../i18n'

interface WorkExperience {
  id: number
  organization: string | null
  position: string | null
  academic_title: string | null
  start_date: string | null
  end_date: string | null
  is_current: boolean
}

interface ProjectHistory {
  id: number
  project_title: string | null
  grant_number: string | null
  grant_type: string | null
  role: string | null
  status: string | null
  start_date: string | null
  end_date: string | null
  funding_amount: number | null
  abstract: string | null
}

interface Profile {
  id: number
  name: string | null
  institution: string | null
  department: string | null
  title: string | null
  email: string | null
  work_experiences: WorkExperience[]
  project_histories: ProjectHistory[]
}

const API = '/api'

const GRANT_TYPES = [
  '国家自然科学基金面上',
  '国家自然科学基金青年',
  '国家自然科学基金重点',
  '省部级',
  '校级',
  '企业合作',
  '其他',
]

const ROLES = ['PI', '共同PI', '参与者']
const PROJECT_STATUSES = ['在研', '已结题', '申请中']

interface EditingCell {
  rowId: number
  field: string
}

export default function ProfilePage() {
  const t = useT()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [basicSaving, setBasicSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  async function load() {
    try {
      const res = await fetch(`${API}/profile`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setProfile(data)
    } catch {
      setLoadError(true)
    }
  }

  useEffect(() => { load() }, [])

  async function saveBasic(field: string, value: string) {
    setBasicSaving(true)
    await fetch(`${API}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    setBasicSaving(false)
    await load()
  }

  async function patchWork(id: number, patch: Partial<WorkExperience>) {
    await fetch(`${API}/profile/work-experiences/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setEditingCell(null)
    await load()
  }

  async function addWork() {
    await fetch(`${API}/profile/work-experiences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    await load()
  }

  async function deleteWork(id: number) {
    if (!confirm(t('删除此工作经历？'))) return
    await fetch(`${API}/profile/work-experiences/${id}`, { method: 'DELETE' })
    await load()
  }

  async function patchProj(id: number, patch: Partial<ProjectHistory>) {
    await fetch(`${API}/profile/project-histories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setEditingCell(null)
    await load()
  }

  async function addProj() {
    await fetch(`${API}/profile/project-histories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    await load()
  }

  async function deleteProj(id: number) {
    if (!confirm(t('删除此项目经历？'))) return
    await fetch(`${API}/profile/project-histories/${id}`, { method: 'DELETE' })
    await load()
  }

  function isEditing(rowId: number, field: string) {
    return editingCell?.rowId === rowId && editingCell?.field === field
  }

  const cellStyle: React.CSSProperties = {
    padding: '6px 8px', borderRight: '1px solid #f0f0f0', cursor: 'pointer', fontSize: 13, minHeight: 32,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160,
  }

  const dateCellStyle: React.CSSProperties = {
    padding: '2px 8px', borderRight: '1px solid #f0f0f0', fontSize: 13,
  }

  if (loadError) return <div style={{ padding: 40, color: '#ff4d4f' }}>{t('加载失败')}</div>
  if (!profile) return <div style={{ padding: 40, color: '#999' }}>{t('加载中…')}</div>

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: 'system-ui' }}>
      <h2 style={{ marginBottom: 24 }}>{t('基础信息')}</h2>

      {/* Basic info */}
      <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: 20, marginBottom: 32 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 15 }}>{t('申请人基本信息')}</h3>
        {basicSaving && <span style={{ fontSize: 12, color: '#999', marginBottom: 8, display: 'block' }}>{t('保存中…')}</span>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
          {([
            { key: 'name', label: t('姓名') },
            { key: 'institution', label: t('单位') },
            { key: 'department', label: t('部门/学院') },
            { key: 'title', label: t('职称') },
            { key: 'email', label: t('邮箱') },
          ] as { key: keyof Profile; label: string }[]).map(({ key, label }) => (
            <div key={key}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 3 }}>{label}</label>
              <input
                defaultValue={(profile[key] as string) || ''}
                onBlur={e => saveBasic(key, e.target.value)}
                style={{ width: '100%', padding: '5px 8px', border: '1px solid #d9d9d9', borderRadius: 5, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Work experience table */}
      <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: 20, marginBottom: 32 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 15 }}>{t('工作经历')}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e8e8e8' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              {[t('单位'), t('职位'), t('职称'), t('开始日期'), t('结束日期'), t('至今'), t('操作')].map(h => (
                <th key={h} style={{ padding: '8px', textAlign: 'left', fontSize: 13, fontWeight: 500, borderBottom: '1px solid #e8e8e8', borderRight: '1px solid #f0f0f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.work_experiences.map(w => (
              <tr key={w.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                {/* organization */}
                <td style={cellStyle} onClick={() => setEditingCell({ rowId: w.id, field: 'organization' })}>
                  {isEditing(w.id, 'organization') ? (
                    <input
                      autoFocus
                      defaultValue={w.organization || ''}
                      onBlur={e => patchWork(w.id, { organization: e.target.value })}
                      style={{ width: '100%', border: '1px solid #1677ff', borderRadius: 3, padding: '2px 4px', fontSize: 13 }}
                    />
                  ) : (w.organization || <span style={{ color: '#bbb' }}>{t('点击编辑')}</span>)}
                </td>
                {/* position (职位) */}
                <td style={cellStyle} onClick={() => setEditingCell({ rowId: w.id, field: 'position' })}>
                  {isEditing(w.id, 'position') ? (
                    <input
                      autoFocus
                      defaultValue={w.position || ''}
                      onBlur={e => patchWork(w.id, { position: e.target.value })}
                      style={{ width: '100%', border: '1px solid #1677ff', borderRadius: 3, padding: '2px 4px', fontSize: 13 }}
                    />
                  ) : (w.position || <span style={{ color: '#bbb' }}>{t('点击编辑')}</span>)}
                </td>
                {/* academic_title (职称) */}
                <td style={cellStyle} onClick={() => setEditingCell({ rowId: w.id, field: 'academic_title' })}>
                  {isEditing(w.id, 'academic_title') ? (
                    <input
                      autoFocus
                      defaultValue={w.academic_title || ''}
                      onBlur={e => patchWork(w.id, { academic_title: e.target.value })}
                      style={{ width: '100%', border: '1px solid #1677ff', borderRadius: 3, padding: '2px 4px', fontSize: 13 }}
                    />
                  ) : (w.academic_title || <span style={{ color: '#bbb' }}>{t('点击编辑')}</span>)}
                </td>
                {/* start_date — always-visible month picker */}
                <td style={dateCellStyle}>
                  <input
                    type="month"
                    value={w.start_date || ''}
                    onChange={e => patchWork(w.id, { start_date: e.target.value || null })}
                    style={{ border: 'none', background: 'transparent', fontSize: 13, cursor: 'pointer', width: 130 }}
                    onFocus={e => (e.target.style.border = '1px solid #1677ff')}
                    onBlur={e => (e.target.style.border = 'none')}
                  />
                </td>
                {/* end_date — always-visible month picker */}
                <td style={dateCellStyle}>
                  {w.is_current ? (
                    <span style={{ fontSize: 13, color: '#999' }}>{t('至今')}</span>
                  ) : (
                    <input
                      type="month"
                      value={w.end_date || ''}
                      onChange={e => patchWork(w.id, { end_date: e.target.value || null })}
                      style={{ border: 'none', background: 'transparent', fontSize: 13, cursor: 'pointer', width: 130 }}
                      onFocus={e => (e.target.style.border = '1px solid #1677ff')}
                      onBlur={e => (e.target.style.border = 'none')}
                    />
                  )}
                </td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={w.is_current}
                    onChange={e => patchWork(w.id, { is_current: e.target.checked, end_date: e.target.checked ? null : w.end_date })}
                  />
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  <button onClick={() => deleteWork(w.id)} style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: 15 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addWork} style={{ marginTop: 10, padding: '4px 14px', border: '1px dashed #d9d9d9', borderRadius: 5, cursor: 'pointer', fontSize: 13, background: '#fafafa' }}>
          {t('+ 添加一行')}
        </button>
      </div>

      {/* Project history table */}
      <div style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 8, padding: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 15 }}>{t('项目经历')}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e8e8e8' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              {[t('项目名称'), t('编号'), t('基金类型'), t('角色'), t('状态'), t('开始日期'), t('结束日期'), t('经费(万)'), t('摘要'), t('操作')].map(h => (
                <th key={h} style={{ padding: '8px', textAlign: 'left', fontSize: 12, fontWeight: 500, borderBottom: '1px solid #e8e8e8', borderRight: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.project_histories.map(h => (
              <tr key={h.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                {/* project_title */}
                <td style={cellStyle} onClick={() => setEditingCell({ rowId: h.id, field: 'project_title' })}>
                  {isEditing(h.id, 'project_title') ? (
                    <input autoFocus defaultValue={h.project_title || ''} onBlur={e => patchProj(h.id, { project_title: e.target.value })} style={{ width: 140, border: '1px solid #1677ff', borderRadius: 3, padding: '2px 4px', fontSize: 12 }} />
                  ) : (h.project_title || <span style={{ color: '#bbb' }}>{t('点击编辑')}</span>)}
                </td>
                {/* grant_number */}
                <td style={cellStyle} onClick={() => setEditingCell({ rowId: h.id, field: 'grant_number' })}>
                  {isEditing(h.id, 'grant_number') ? (
                    <input autoFocus defaultValue={h.grant_number || ''} onBlur={e => patchProj(h.id, { grant_number: e.target.value })} style={{ width: 100, border: '1px solid #1677ff', borderRadius: 3, padding: '2px 4px', fontSize: 12 }} />
                  ) : (h.grant_number || <span style={{ color: '#bbb' }}>—</span>)}
                </td>
                {/* grant_type — select */}
                <td style={cellStyle} onClick={() => setEditingCell({ rowId: h.id, field: 'grant_type' })}>
                  {isEditing(h.id, 'grant_type') ? (
                    <select autoFocus defaultValue={h.grant_type || ''} onBlur={e => patchProj(h.id, { grant_type: e.target.value })} style={{ border: '1px solid #1677ff', borderRadius: 3, padding: '2px 4px', fontSize: 12 }}>
                      <option value="">{t('请选择')}</option>
                      {GRANT_TYPES.map(gt => <option key={gt} value={gt}>{gt}</option>)}
                    </select>
                  ) : (h.grant_type || <span style={{ color: '#bbb' }}>{t('点击编辑')}</span>)}
                </td>
                {/* role — select */}
                <td style={cellStyle} onClick={() => setEditingCell({ rowId: h.id, field: 'role' })}>
                  {isEditing(h.id, 'role') ? (
                    <select autoFocus defaultValue={h.role || ''} onBlur={e => patchProj(h.id, { role: e.target.value })} style={{ border: '1px solid #1677ff', borderRadius: 3, fontSize: 12 }}>
                      <option value="">{t('请选择')}</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (h.role || <span style={{ color: '#bbb' }}>—</span>)}
                </td>
                {/* status — select */}
                <td style={cellStyle} onClick={() => setEditingCell({ rowId: h.id, field: 'status' })}>
                  {isEditing(h.id, 'status') ? (
                    <select autoFocus defaultValue={h.status || ''} onBlur={e => patchProj(h.id, { status: e.target.value })} style={{ border: '1px solid #1677ff', borderRadius: 3, fontSize: 12 }}>
                      <option value="">{t('请选择')}</option>
                      {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (h.status || <span style={{ color: '#bbb' }}>—</span>)}
                </td>
                {/* start_date — always-visible month picker */}
                <td style={dateCellStyle}>
                  <input
                    type="month"
                    value={h.start_date || ''}
                    onChange={e => patchProj(h.id, { start_date: e.target.value || null })}
                    style={{ border: 'none', background: 'transparent', fontSize: 12, cursor: 'pointer', width: 120 }}
                    onFocus={e => (e.target.style.border = '1px solid #1677ff')}
                    onBlur={e => (e.target.style.border = 'none')}
                  />
                </td>
                {/* end_date — always-visible month picker */}
                <td style={dateCellStyle}>
                  <input
                    type="month"
                    value={h.end_date || ''}
                    onChange={e => patchProj(h.id, { end_date: e.target.value || null })}
                    style={{ border: 'none', background: 'transparent', fontSize: 12, cursor: 'pointer', width: 120 }}
                    onFocus={e => (e.target.style.border = '1px solid #1677ff')}
                    onBlur={e => (e.target.style.border = 'none')}
                  />
                </td>
                {/* funding_amount */}
                <td style={cellStyle} onClick={() => setEditingCell({ rowId: h.id, field: 'funding_amount' })}>
                  {isEditing(h.id, 'funding_amount') ? (
                    <input autoFocus type="number" defaultValue={h.funding_amount ?? ''} onBlur={e => patchProj(h.id, { funding_amount: e.target.value ? parseFloat(e.target.value) : null })} style={{ width: 70, border: '1px solid #1677ff', borderRadius: 3, padding: '2px 4px', fontSize: 12 }} />
                  ) : (h.funding_amount != null ? h.funding_amount : <span style={{ color: '#bbb' }}>—</span>)}
                </td>
                {/* abstract — expands on click */}
                <td style={{ ...cellStyle, maxWidth: 200 }} onClick={() => setEditingCell({ rowId: h.id, field: 'abstract' })}>
                  {isEditing(h.id, 'abstract') ? (
                    <textarea
                      autoFocus
                      defaultValue={h.abstract || ''}
                      onBlur={e => patchProj(h.id, { abstract: e.target.value })}
                      rows={4}
                      style={{ width: 240, border: '1px solid #1677ff', borderRadius: 3, padding: '4px', fontSize: 12, resize: 'vertical' }}
                    />
                  ) : (h.abstract ? h.abstract.slice(0, 40) + (h.abstract.length > 40 ? '…' : '') : <span style={{ color: '#bbb' }}>{t('点击填写')}</span>)}
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  <button onClick={() => deleteProj(h.id)} style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', fontSize: 15 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addProj} style={{ marginTop: 10, padding: '4px 14px', border: '1px dashed #d9d9d9', borderRadius: 5, cursor: 'pointer', fontSize: 13, background: '#fafafa' }}>
          {t('+ 添加一行')}
        </button>
      </div>
    </div>
  )
}
