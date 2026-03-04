import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { llmApi, type LLMConfig } from '../api'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'

export default function LLMSettingsPage() {
  const t = useT()
  const { addToast } = useToastStore()
  const [config, setConfig] = useState<LLMConfig>({
    provider: 'openai', model: 'gpt-4o-mini', api_key: '', base_url: '',
  })
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    llmApi.getConfig().then(res => {
      const data = res.data
      setIsConfigured(data.configured)
      setConfig({
        provider: data.provider || 'openai',
        model: data.model || 'gpt-4o-mini',
        api_key: data.api_key || '',
        base_url: data.base_url || '',
      })
    }).catch(() => {
      addToast(t('加载 LLM 配置失败'), 'error')
    })
  }, [])

  const handleSave = async () => {
    if (isConfigured && !apiKeyInput) {
      addToast(t('请在 API Key 字段输入密钥后再保存（已有密钥不自动保留）'), 'error')
      return
    }
    setSaving(true)
    setTestResult(null)
    try {
      const payload: LLMConfig = {
        ...config,
        api_key: apiKeyInput,
      }
      await llmApi.saveConfig(payload)
      addToast(t('LLM 配置已保存'), 'success')
      setIsConfigured(true)
      setApiKeyInput('')
      const res = await llmApi.getConfig()
      setConfig({
        provider: res.data.provider,
        model: res.data.model,
        api_key: res.data.api_key,
        base_url: res.data.base_url,
      })
    } catch {
      addToast(t('保存失败'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await llmApi.test()
      if (res.data.success) {
        setTestResult({ success: true, message: t('连接成功！LLM 配置有效。') })
      } else {
        setTestResult({ success: false, message: res.data.error || t('连接失败') })
      }
    } catch {
      setTestResult({ success: false, message: t('请求失败，请检查网络或后端服务') })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Link to="/" style={{ color: '#1890ff', textDecoration: 'none', fontSize: 13 }}>{t('← 返回项目列表')}</Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t('LLM 设置')}</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        {t('配置全局 LLM Provider，所有功能（模版解析、对话、内容生成）共用此配置。')}
      </p>

      {isConfigured && (
        <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '8px 14px', marginBottom: 20, fontSize: 13, color: '#389e0d' }}>
          {t('✓ 已配置。当前 API Key：')}{config.api_key}
        </div>
      )}

      <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={labelStyle}>
          Provider
          <select
            value={config.provider}
            onChange={e => setConfig(c => ({ ...c, provider: e.target.value }))}
            style={inputStyle}
          >
            <option value="openai">{t('OpenAI 兼容（含 Qwen、DeepSeek、Zhipu 等）')}</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>

        <label style={labelStyle}>
          Model
          <input
            value={config.model}
            onChange={e => setConfig(c => ({ ...c, model: e.target.value }))}
            style={inputStyle}
            placeholder="gpt-4o-mini"
          />
        </label>

        <label style={labelStyle}>
          API Key
          <input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            style={inputStyle}
            placeholder={isConfigured ? t('保存时必须重新输入（当前：') + config.api_key + '）' : 'sk-...'}
          />
        </label>

        <label style={labelStyle}>
          Base URL <span style={{ color: '#999', fontWeight: 400 }}>({t('可选，OpenAI 兼容接口')})</span>
          <input
            value={config.base_url}
            onChange={e => setConfig(c => ({ ...c, base_url: e.target.value }))}
            style={inputStyle}
            placeholder="https://api.openai.com/v1"
          />
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={handleSave} disabled={saving} style={btnStyle}>
            {saving ? t('保存中…') : t('保存配置')}
          </button>
          <button onClick={handleTest} disabled={testing || !isConfigured} style={{ ...btnStyle, background: '#52c41a' }}>
            {testing ? t('测试中…') : t('测试连接')}
          </button>
        </div>

        {testResult && (
          <div style={{
            padding: '8px 14px', borderRadius: 6, fontSize: 13,
            background: testResult.success ? '#f6ffed' : '#fff2f0',
            border: `1px solid ${testResult.success ? '#b7eb8f' : '#ffccc7'}`,
            color: testResult.success ? '#389e0d' : '#cf1322',
          }}>
            {testResult.success ? '✓ ' : '✗ '}{testResult.message}
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 13, color: '#888' }}>
        <strong>{t('提示：')}</strong>{t('也可通过')} <code>.env</code> {t('文件配置')}（<code>LLM_API_KEY</code>、<code>LLM_MODEL</code>、<code>LLM_PROVIDER</code>、<code>LLM_BASE_URL</code>）{t('，数据库配置优先级更高。')}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, fontWeight: 500,
}
const inputStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #d0d0d0', borderRadius: 4,
  fontFamily: 'inherit', fontSize: 14, marginTop: 2,
}
const btnStyle: React.CSSProperties = {
  padding: '7px 18px', background: '#1890ff', color: '#fff', border: 'none',
  borderRadius: 4, cursor: 'pointer', fontSize: 14,
}
