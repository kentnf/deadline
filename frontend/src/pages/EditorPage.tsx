import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { projectsApi, sectionsApi } from '../api'
import { useToastStore } from '../stores/toastStore'
import RuleOverridePanel from '../components/RuleOverridePanel'
import { useT, useLang } from '../i18n'

// Task 1.1: design tokens
const theme = {
  bg: '#f5f7fa',
  card: '#ffffff',
  shadow: '0 1px 4px rgba(0,0,0,0.08)',
  primary: '#1677ff',
  textMain: '#1a1a2e',
  textSub: '#6b7280',
  border: '#e5e7eb',
  msgRadius: 12,
  msgFontSize: 14,
  msgLineHeight: 1.7,
}

interface Section {
  id: number
  template_section_id: number
  status: string
  skeleton_text: string | null
  content: string | null
  word_count: number
  generation_plan: Array<{ index: number; title: string; word_count: number }> | null
  generation_cursor: number | null
  has_writing_guide_override: boolean
  quality_issues: string[] | null
  quality_checked_at: string | null
  effective_section: {
    id: number
    title: string
    level: number
    word_limit?: number
    writing_guide?: string
    order: number
    parent_id?: number
  }
}

interface Message {
  id?: number
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

export default function EditorPage() {
  const t = useT()
  const { lang, setLang } = useLang()
  const { projectId } = useParams<{ projectId: string }>()
  const pid = parseInt(projectId!)
  const { addToast } = useToastStore()

  const [project, setProject] = useState<any>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<number | null>(null)
  const [templateStatus, setTemplateStatus] = useState<'valid' | 'incomplete' | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showOverrides, setShowOverrides] = useState(false)
  const [paragraphRevision, setParagraphRevision] = useState<{ idx: number; text: string } | null>(null)
  const [paraMessages, setParaMessages] = useState<Message[]>([])
  const [paraInput, setParaInput] = useState('')
  const [paraStreaming, setParaStreaming] = useState(false)
  const [confirmedPara, setConfirmedPara] = useState<string | null>(null)

  const [sectionStreamContent, setSectionStreamContent] = useState<string>('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('editor-sidebar-collapsed') === 'true'
  )
  // Task 2.1: tab state
  const [activeTab, setActiveTab] = useState<'chat' | 'standard' | 'content'>('chat')
  // Draft generation modal
  const [showDraftModal, setShowDraftModal] = useState(false)
  const [draftPhase, setDraftPhase] = useState<'preview' | 'generating' | 'done'>('preview')
  const [draftSectionStatus, setDraftSectionStatus] = useState<Record<number, 'pending' | 'generating' | 'done' | 'error'>>({})
  const [draftCurrentTitle, setDraftCurrentTitle] = useState('')
  const [draftCompleted, setDraftCompleted] = useState(0)
  const [usePapers, setUsePapers] = useState(false)
  const [useProfile, setUseProfile] = useState(false)
  const [showPapersPanel, setShowPapersPanel] = useState(false)
  const [allPapers, setAllPapers] = useState<{id:number;title:string|null;file_name:string}[]>([])
  const [projectPaperIds, setProjectPaperIds] = useState<number[]>([])
  // Writing sufficiency hint state
  const [hintReady, setHintReady] = useState(false)
  const [hintNotes, setHintNotes] = useState<string[]>([])
  // Generate-and-check modal state
  const [generatingSection, setGeneratingSection] = useState(false)
  const [genPreview, setGenPreview] = useState<{content: string; quality_check: {word_count: number; word_limit: number|null; within_limit: boolean; requirements_met: string[]; requirements_missed: string[]; overall: string}} | null>(null)
  // Writing standard tab state
  const [standardContent, setStandardContent] = useState('')
  const [standardDirty, setStandardDirty] = useState(false)
  const [generatingStandard, setGeneratingStandard] = useState(false)
  const [standardPreview, setStandardPreview] = useState<string | null>(null)
  // Inline paragraph edit state
  const [editingParaIdx, setEditingParaIdx] = useState<number | null>(null)
  const [editingParaText, setEditingParaText] = useState('')
  // Multi-thread conversation state
  const [threads, setThreads] = useState<{id: number; title: string; is_active: boolean}[]>([])
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null)
  const [showThreadDropdown, setShowThreadDropdown] = useState(false)
  // Quality check state
  const [checkingQuality, setCheckingQuality] = useState<Set<number>>(new Set())
  const [qualityPanelSectionId, setQualityPanelSectionId] = useState<number | null>(null)
  const [batchQCRunning, setBatchQCRunning] = useState(false)
  const [batchQCProgress, setBatchQCProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })

  const chatEndRef = useRef<HTMLDivElement>(null)
  const paraChatEndRef = useRef<HTMLDivElement>(null)
  const messageCache = useRef<Map<string, Message[]>>(new Map())
  const openContentTabOnSwitch = useRef(false)

  const sectionKey = (sectionId: number | null) =>
    sectionId === null ? 'overview' : String(sectionId)

  // W2 fix: auto-collapse sidebar when window width < 800px
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 800) {
        setSidebarCollapsed(true)
        localStorage.setItem('editor-sidebar-collapsed', 'true')
      }
    }
    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem('editor-sidebar-collapsed', String(next))
      return next
    })
  }

  const selectedSection = sections.find(s => s.id === selectedSectionId) || null

  const load = useCallback(async () => {
    try {
      const [pRes, statusRes] = await Promise.all([
        projectsApi.get(pid),
        projectsApi.getStatus(pid),
      ])
      setProject(pRes.data)
      setSections(pRes.data.sections)
      setTemplateStatus(statusRes.data.template_status)
    } catch {
      addToast(t('加载项目失败'), 'error')
    }
  }, [pid])

  useEffect(() => { load() }, [load])

  // Load papers list for association panel
  useEffect(() => {
    fetch('/api/papers').then(r => r.json()).then(setAllPapers).catch(() => {})
    fetch(`/api/projects/${pid}/papers`).then(r => r.json()).then((data: any[]) => setProjectPaperIds(data.map(p => p.id))).catch(() => {})
  }, [pid])

  async function togglePaperAssociation(paperId: number, checked: boolean) {
    const url = `/api/projects/${pid}/papers/${paperId}`
    if (checked) {
      await fetch(url, { method: 'POST' })
      setProjectPaperIds(prev => [...prev, paperId])
    } else {
      await fetch(url, { method: 'DELETE' })
      setProjectPaperIds(prev => prev.filter(id => id !== paperId))
    }
  }

  const openDraftModal = () => {
    const initial: Record<number, 'pending' | 'generating' | 'done' | 'error'> = {}
    sections.forEach(s => { initial[s.id] = 'pending' })
    setDraftSectionStatus(initial)
    setDraftPhase('preview')
    setDraftCompleted(0)
    setDraftCurrentTitle('')
    setShowDraftModal(true)
  }

  const startDraftGeneration = async () => {
    setDraftPhase('generating')
    try {
      const res = await fetch(`/api/projects/${pid}/generate-draft`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(t('请求失败'))
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let done = false
      while (!done) {
        const { done: d, value } = await reader.read()
        if (d) break
        const lines = decoder.decode(value).split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (raw === '[DONE]') { done = true; break }
          try {
            const ev = JSON.parse(raw)
            if (ev.event === 'section_start') {
              setDraftCurrentTitle(ev.title)
              setDraftSectionStatus(prev => ({ ...prev, [ev.section_id]: 'generating' }))
            } else if (ev.event === 'section_done') {
              setDraftSectionStatus(prev => ({ ...prev, [ev.section_id]: 'done' }))
              setDraftCompleted(ev.index)
            } else if (ev.event === 'section_error') {
              setDraftSectionStatus(prev => ({ ...prev, [ev.section_id]: 'error' }))
              addToast(lang === 'zh' ? `章节「${ev.title}」生成失败：${ev.error}` : `Section "${ev.title}" failed: ${ev.error}`, 'error')
            }
          } catch { /* ignore */ }
        }
      }
      // Await refresh so sections have content when modal closes
      await load()
      setDraftPhase('done')
    } catch {
      addToast(t('批量生成失败，请检查 LLM 配置'), 'error')
      setDraftPhase('preview')
    }
  }

  const closeDraftModalAndNavigate = () => {
    setShowDraftModal(false)
    // Navigate to first section that now has content
    setSections(prev => {
      const first = prev.find(s => s.content)
      if (first) {
        openContentTabOnSwitch.current = true
        setSelectedSectionId(first.id)
      }
      return prev
    })
  }

  // Task 2.2: reset to chat tab on section switch, unless flagged for content tab
  useEffect(() => {
    if (openContentTabOnSwitch.current) {
      setActiveTab('content')
      openContentTabOnSwitch.current = false
    } else {
      setActiveTab('chat')
    }
    setHintReady(false)
    setHintNotes([])
    setGenPreview(null)
    // Reset standard tab state to match new section's writing_guide
    const sec = sections.find(s => s.id === selectedSectionId)
    setStandardContent(sec?.effective_section.writing_guide ?? '')
    setStandardDirty(false)
    setStandardPreview(null)
    setEditingParaIdx(null)
    setThreads([])
    setActiveConversationId(null)
    setShowThreadDropdown(false)
    ;(async () => {
      await loadConversation(selectedSectionId)
      await loadThreads(selectedSectionId)
    })()
  }, [selectedSectionId, pid])

  const loadThreads = async (sectionId: number | null) => {
    try {
      const param = sectionId === null ? 'null' : String(sectionId)
      const res = await fetch(`/api/projects/${pid}/conversations?section_id=${param}`)
      const data: {id: number; title: string; is_active: boolean}[] = await res.json()
      setThreads(data)
      const active = data.find(t => t.is_active)
      if (active) setActiveConversationId(active.id)
    } catch {
      setThreads([])
    }
  }

  const loadConversation = async (sectionId: number | null, convId?: number | null) => {
    const cacheKey = convId != null ? String(convId) : sectionKey(sectionId)
    const cached = messageCache.current.get(cacheKey)
    if (cached) {
      setMessages(cached)
      return
    }
    try {
      const url = sectionId === null
        ? `/api/projects/${pid}/conversations/null`
        : `/api/projects/${pid}/conversations/${sectionId}`
      const res = await fetch(url)
      const data = await res.json()
      const msgs = data.messages || []
      const resolvedKey = data.conversation_id != null ? String(data.conversation_id) : cacheKey
      if (data.conversation_id != null) setActiveConversationId(data.conversation_id)
      messageCache.current.set(resolvedKey, msgs)
      setMessages(msgs)
    } catch {
      setMessages([])
    }
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    paraChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [paraMessages])

  const sendMessage = async (msg: string, sectionId: number | null, paragraphRef: number | null = null) => {
    if (!msg.trim() || streaming) return
    const key = activeConversationId != null ? String(activeConversationId) : sectionKey(sectionId)
    const userMsg: Message = { role: 'user', content: msg }
    const streamingBubble: Message = { role: 'assistant', content: '', streaming: true }
    setMessages(prev => {
      const updated = [...prev, userMsg, streamingBubble]
      messageCache.current.set(key, updated)
      return updated
    })
    setStreaming(true)
    setSectionStreamContent('')

    try {
      const res = await fetch(`/api/projects/${pid}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, section_id: sectionId, paragraph_ref: paragraphRef, use_papers: usePapers, use_profile: useProfile }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        const detail = errData.detail || t('请求失败')
        const isLLMError = detail.includes('未配置') || detail.includes('LLM')
        const errMsg = isLLMError
          ? t('LLM 未配置，请点击顶栏「⚙ LLM 设置」配置后再使用。')
          : detail
        setMessages(prev => {
          const arr = [...prev]
          arr[arr.length - 1] = { role: 'assistant', content: errMsg, streaming: false }
          messageCache.current.set(key, arr)
          return arr
        })
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let regularContent = ''
      let paragraphMode = false
      let streamDone = false

      while (!streamDone) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') { streamDone = true; break }
          try {
            const parsed = JSON.parse(data)
            if (parsed.token !== undefined) {
              if (!paragraphMode) {
                regularContent += parsed.token
                setMessages(prev => {
                  const arr = [...prev]
                  arr[arr.length - 1] = { role: 'assistant', content: regularContent, streaming: true }
                  return arr
                })
              } else {
                setSectionStreamContent(prev => prev + parsed.token)
              }
            } else if (parsed.prompt !== undefined) {
              if (!paragraphMode) {
                paragraphMode = true
                if (regularContent) {
                  setSectionStreamContent(regularContent)
                  regularContent = ''
                }
              }
              setMessages(prev => {
                const arr = [...prev]
                arr[arr.length - 1] = { role: 'assistant', content: parsed.prompt, streaming: false }
                messageCache.current.set(key, arr)
                return arr
              })
            } else if (parsed.hint !== undefined) {
              // Writing sufficiency hint from backend
              setHintReady(parsed.hint === 'ready')
              setHintNotes(parsed.notes || [])
            }
          } catch { /* ignore */ }
        }
      }

      if (paragraphMode) {
        setSectionStreamContent('')
        await load()
      } else {
        setMessages(prev => {
          const arr = [...prev]
          arr[arr.length - 1] = { role: 'assistant', content: regularContent, streaming: false }
          messageCache.current.set(key, arr)
          return arr
        })
      }
    } catch {
      addToast(t('发送消息失败'), 'error')
      setMessages(prev => {
        const arr = [...prev]
        // Keep user message; replace streaming bubble with error notice
        if (arr.length > 0 && arr[arr.length - 1].role === 'assistant') {
          arr[arr.length - 1] = { role: 'assistant', content: t('请求失败，请检查网络或 LLM 配置后重试。'), streaming: false }
        }
        messageCache.current.set(key, arr)
        return arr
      })
    } finally {
      setStreaming(false)
    }
  }

  const generateSectionContent = async () => {
    if (!selectedSectionId || generatingSection) return
    setGeneratingSection(true)
    try {
      const res = await fetch(`/api/projects/${pid}/sections/${selectedSectionId}/generate-and-check`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        addToast(err.detail || t('生成失败'), 'error')
        return
      }
      const data = await res.json()
      setGenPreview(data)
    } catch {
      addToast(t('生成失败，请检查网络或 LLM 配置'), 'error')
    } finally {
      setGeneratingSection(false)
    }
  }

  const confirmWriteSectionContent = async () => {
    if (!genPreview || !selectedSectionId) return
    try {
      await fetch(`/api/projects/${pid}/sections/${selectedSectionId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: genPreview.content }),
      })
      setGenPreview(null)
      setHintReady(false)
      await load()
      openContentTabOnSwitch.current = true
      setActiveTab('content')
      triggerQualityCheck(selectedSectionId)
    } catch {
      addToast(t('写入失败'), 'error')
    }
  }

  const saveWritingStandard = async () => {
    if (!selectedSectionId || !standardDirty) return
    try {
      await fetch(`/api/projects/${pid}/sections/${selectedSectionId}/writing-guide`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writing_guide: standardContent }),
      })
      setStandardDirty(false)
      await load()
      addToast(t('写作标准已保存'), 'success')
      const sec = sections.find(s => s.id === selectedSectionId)
      if (sec?.content) triggerQualityCheck(selectedSectionId)
    } catch {
      addToast(t('保存失败'), 'error')
    }
  }

  const generateStandard = async () => {
    if (!selectedSectionId || generatingStandard) return
    setGeneratingStandard(true)
    try {
      const res = await fetch(`/api/projects/${pid}/sections/${selectedSectionId}/generate-standard`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        addToast(err.detail || t('AI 生成失败'), 'error')
        return
      }
      const data = await res.json()
      setStandardPreview(data.writing_guide)
    } catch {
      addToast(t('AI 生成失败，请检查网络或 LLM 配置'), 'error')
    } finally {
      setGeneratingStandard(false)
    }
  }

  const confirmAdoptStandard = async () => {
    if (!selectedSectionId || standardPreview === null) return
    try {
      await fetch(`/api/projects/${pid}/sections/${selectedSectionId}/writing-guide`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writing_guide: standardPreview }),
      })
      setStandardContent(standardPreview)
      setStandardDirty(false)
      setStandardPreview(null)
      await load()
      addToast(t('写作标准已更新'), 'success')
      const sec = sections.find(s => s.id === selectedSectionId)
      if (sec?.content) triggerQualityCheck(selectedSectionId)
    } catch {
      addToast(t('保存失败'), 'error')
    }
  }

  const switchThread = async (convId: number) => {
    try {
      const res = await fetch(`/api/projects/${pid}/conversations/${convId}/activate`, { method: 'PUT' })
      const updated: {id: number; title: string; is_active: boolean}[] = await res.json()
      setThreads(updated)
      setActiveConversationId(convId)
      setShowThreadDropdown(false)
      // Clear the section-key cache entry so a future revisit to this section
      // fetches fresh and shows the correct active thread (not stale thread-1 data).
      messageCache.current.delete(sectionKey(selectedSectionId))
      // Load from cache or fetch via active-thread endpoint (now convId is active)
      const cacheKey = String(convId)
      const cached = messageCache.current.get(cacheKey)
      if (cached) {
        setMessages(cached)
      } else {
        await loadConversation(selectedSectionId, convId)
      }
    } catch {
      addToast(t('切换对话失败'), 'error')
    }
  }

  const createThread = async () => {
    try {
      const res = await fetch(`/api/projects/${pid}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section_id: selectedSectionId }),
      })
      if (!res.ok) throw new Error()
      const newThread: {id: number; title: string; is_active: boolean; created_at: string} = await res.json()
      setThreads(prev => prev.map(t => ({ ...t, is_active: false })).concat({ id: newThread.id, title: newThread.title, is_active: true }))
      setActiveConversationId(newThread.id)
      messageCache.current.set(String(newThread.id), [])
      setMessages([])
      setShowThreadDropdown(false)
    } catch {
      addToast(t('新建对话失败'), 'error')
    }
  }

  const sendParaMessage = async (msg: string) => {
    if (!msg.trim() || paraStreaming || !selectedSection) return
    const userMsg: Message = { role: 'user', content: msg }
    const assistantMsg: Message = { role: 'assistant', content: '', streaming: true }
    setParaMessages(prev => [...prev, userMsg, assistantMsg])
    setParaStreaming(true)

    try {
      const res = await fetch(`/api/projects/${pid}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          section_id: selectedSectionId,
          paragraph_ref: paragraphRevision?.idx,
        }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              if (parsed.token) {
                fullText += parsed.token
                setParaMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: fullText, streaming: true }
                  return updated
                })
              }
            } catch { /* ignore */ }
          }
        }
      }
      setConfirmedPara(fullText)
      setParaMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: fullText, streaming: false }
        return updated
      })
    } catch {
      addToast(t('发送失败'), 'error')
    } finally {
      setParaStreaming(false)
    }
  }

  const confirmParagraphRevision = async () => {
    if (!confirmedPara || !selectedSection || paragraphRevision === null) return
    const paragraphs = (selectedSection.content || '').split('\n\n')
    paragraphs[paragraphRevision.idx] = confirmedPara
    const newContent = paragraphs.join('\n\n')
    try {
      await sectionsApi.updateContent(pid, selectedSection.id, newContent)
      setSections(prev => prev.map(s =>
        s.id === selectedSection.id ? { ...s, content: newContent } : s
      ))
      setParagraphRevision(null)
      setParaMessages([])
      setConfirmedPara(null)
      addToast(t('段落已更新'), 'success')
    } catch {
      addToast(t('保存失败'), 'error')
    }
  }

  const saveInlineParaEdit = async () => {
    if (!selectedSection || editingParaIdx === null) return
    const paragraphs = (selectedSection.content || '').split('\n\n')
    paragraphs[editingParaIdx] = editingParaText
    const newContent = paragraphs.join('\n\n')
    try {
      const res = await sectionsApi.updateContent(pid, selectedSection.id, newContent)
      setSections(prev => prev.map(s =>
        s.id === selectedSection.id
          ? { ...s, content: newContent, word_count: res.data.word_count ?? s.word_count }
          : s
      ))
      setEditingParaIdx(null)
      addToast(t('段落已保存'), 'success')
      triggerQualityCheck(selectedSection.id)
    } catch {
      addToast(t('保存失败'), 'error')
    }
  }


  const runBatchQualityCheck = async () => {
    const checkable = sections.filter(s => s.status !== 'empty')
    if (checkable.length === 0) return
    setBatchQCRunning(true)
    setBatchQCProgress({ done: 0, total: checkable.length })
    for (let i = 0; i < checkable.length; i++) {
      await triggerQualityCheck(checkable[i].id)
      setBatchQCProgress({ done: i + 1, total: checkable.length })
    }
    setBatchQCRunning(false)
  }

  const triggerQualityCheck = async (sectionId: number) => {
    setCheckingQuality(prev => new Set(prev).add(sectionId))
    try {
      const res = await fetch(`/api/projects/${pid}/sections/${sectionId}/quality-check`, {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setSections(prev => prev.map(s =>
          s.id === sectionId
            ? { ...s, quality_issues: data.issues, quality_checked_at: data.checked_at }
            : s
        ))
      }
    } catch {
      // silently ignore quality check errors
    } finally {
      setCheckingQuality(prev => {
        const next = new Set(prev)
        next.delete(sectionId)
        return next
      })
    }
  }

  // Close quality panel on click outside
  useEffect(() => {
    if (qualityPanelSectionId === null) return
    const handler = () => setQualityPanelSectionId(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [qualityPanelSectionId])

  const statusColor: Record<string, string> = {
    empty: '#d9d9d9', skeleton: '#faad14', draft: '#1677ff', reviewed: '#52c41a',
  }
  const statusLabel: Record<string, string> = {
    empty: t('空'), skeleton: t('骨架'), draft: t('草稿'), reviewed: t('已审阅'),
  }

  if (!project) return <div style={{ padding: 24, color: theme.textSub }}>{t('加载中…')}</div>

  return (
    // Task 3.1 + 4.1: outer wrapper with page background
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', background: theme.bg }}>

      {/* Task 7.1: header — 56px, border-bottom */}
      <div style={{ height: 56, background: '#001529', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0, borderBottom: '1px solid ' + theme.border }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{project.name}</span>
        <span style={{ color: '#8c8c8c', fontSize: 13 }}>
          {t('完成度：')}{sections.length > 0 ? Math.round(sections.reduce((sum, s) => {
            let pts = 0
            if (s.skeleton_text) pts++
            if (s.content) pts++
            if (s.quality_checked_at && (!s.quality_issues || s.quality_issues.length === 0)) pts++
            return sum + pts
          }, 0) / (sections.length * 3) * 100) : 0}%
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowOverrides(v => !v)} style={headerBtn}>{t('规则覆盖')}</button>
        <Link to="/settings/llm" style={headerBtn}>⚙ {t('LLM 设置')}</Link>
        <a href={`/api/projects/${pid}/export`} download style={headerBtn}>{t('导出 Word')}</a>
        <button
          onClick={runBatchQualityCheck}
          disabled={batchQCRunning || sections.every(s => s.status === 'empty')}
          style={headerBtn}
        >
          {batchQCRunning ? `${t('检查中')} ${batchQCProgress.done}/${batchQCProgress.total}…` : t('批量质检')}
        </button>
        <button
          onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
          style={{ ...headerBtn, border: '1px solid rgba(255,255,255,0.4)' }}
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </div>

      {templateStatus === 'incomplete' && (
        <div style={{ background: '#fff1b8', borderBottom: '1px solid #ffe58f', padding: '10px 20px', color: '#876800' }}>
          ⚠️ {t('模版解析不完整，请先完善模版结构再开始写作。')}
        </div>
      )}

      {/* Task 3.2/3.3: two-column layout — sidebar + main panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 0 }}>

        {/* Left sidebar — unchanged collapsible logic */}
        <div style={{
          flex: sidebarCollapsed ? '0 0 44px' : '0 0 220px',
          borderRight: '1px solid ' + theme.border,
          overflow: 'hidden',
          background: theme.card,
          display: 'flex',
          flexDirection: 'column',
          transition: 'flex 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-end', padding: '6px 8px', borderBottom: '1px solid ' + theme.border, flexShrink: 0 }}>
            <button
              onClick={toggleSidebar}
              title={sidebarCollapsed ? t('展开章节栏') : t('折叠章节栏')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: theme.textSub, padding: '2px 4px', lineHeight: 1 }}
            >
              {sidebarCollapsed ? '»' : '«'}
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {sidebarCollapsed ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingTop: 4 }}>
                <div
                  onClick={() => setSelectedSectionId(null)}
                  title={t('项目概览')}
                  style={{
                    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', borderRadius: 4, fontSize: 14,
                    background: selectedSectionId === null ? '#e6f4ff' : 'transparent',
                  }}
                >
                  📋
                </div>
                {sections.map(s => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSectionId(s.id)}
                    title={s.effective_section.title}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', borderRadius: 4,
                      background: selectedSectionId === s.id ? '#e6f4ff' : 'transparent',
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor[s.status] || '#d9d9d9', display: 'block' }} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div
                  onClick={() => setSelectedSectionId(null)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: selectedSectionId === null ? '#e6f4ff' : 'transparent',
                    borderBottom: '1px solid ' + theme.border,
                    color: theme.textMain,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  📋 {t('项目概览')}
                </div>
                {sections.map(s => (
                  <div key={s.id}>
                  <div
                    onClick={() => setSelectedSectionId(s.id)}
                    style={{
                      padding: '8px 12px',
                      paddingLeft: 12 + (s.effective_section.level - 1) * 14,
                      cursor: 'pointer',
                      background: selectedSectionId === s.id ? '#e6f4ff' : 'transparent',
                      borderBottom: qualityPanelSectionId === s.id ? 'none' : '1px solid ' + theme.border,
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
                      color: theme.textMain,
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[s.status] || '#d9d9d9', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.effective_section.title}
                    </span>
                    {s.generation_cursor !== null && s.generation_plan && (
                      <span style={{ fontSize: 10, color: theme.primary, flexShrink: 0 }}>
                        {s.generation_cursor}/{s.generation_plan.length}
                      </span>
                    )}
                    {/* Quality badge */}
                    {checkingQuality.has(s.id) ? (
                      <span style={{ fontSize: 10, color: '#1677ff', flexShrink: 0 }}>{t('检查中…')}</span>
                    ) : s.quality_checked_at === null ? null : s.quality_issues && s.quality_issues.length > 0 ? (
                      <span
                        onClick={e => { e.stopPropagation(); setQualityPanelSectionId(prev => prev === s.id ? null : s.id) }}
                        style={{ fontSize: 11, color: '#fa8c16', flexShrink: 0, cursor: 'pointer', padding: '1px 4px', borderRadius: 4, background: '#fff7e6', border: '1px solid #ffd591' }}
                      >
                        ⚠️ {s.quality_issues.length}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, flexShrink: 0 }}>✅</span>
                    )}
                  </div>
                  {/* Quality detail panel */}
                  {qualityPanelSectionId === s.id && s.quality_issues && s.quality_issues.length > 0 && (
                    <div
                      onClick={e => e.stopPropagation()}
                      style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderTop: 'none', borderBottom: '1px solid ' + theme.border, padding: '10px 12px', fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, color: '#d46b08' }}>{t('质检问题')}</span>
                        <button
                          onClick={() => setQualityPanelSectionId(null)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textSub, fontSize: 14, lineHeight: 1 }}
                        >×</button>
                      </div>
                      <ul style={{ margin: '0 0 8px 0', paddingLeft: 16 }}>
                        {s.quality_issues.map((issue, i) => (
                          <li key={i} style={{ color: theme.textMain, marginBottom: 3 }}>{issue}</li>
                        ))}
                      </ul>
                      <button
                        onClick={() => { setSelectedSectionId(s.id); setActiveTab('chat'); setQualityPanelSectionId(null) }}
                        style={{ fontSize: 12, padding: '3px 10px', background: theme.primary, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                      >
                        {t('去对话完善')}
                      </button>
                    </div>
                  )}
                  </div>
                ))}
              </>
            )}
          </div>
          {/* Papers association panel toggle */}
          {!sidebarCollapsed && (
            <div style={{ borderTop: '1px solid ' + theme.border, flexShrink: 0 }}>
              <button
                onClick={() => setShowPapersPanel(v => !v)}
                style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: theme.textSub, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                📄 {t('关联文章')} {projectPaperIds.length > 0 && `(${projectPaperIds.length})`}
                <span style={{ marginLeft: 'auto' }}>{showPapersPanel ? '▲' : '▼'}</span>
              </button>
              {showPapersPanel && (
                <div style={{ padding: '4px 12px 10px', maxHeight: 160, overflowY: 'auto' }}>
                  {allPapers.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#bbb' }}>{t('暂无文章，前往「文章管理」上传')}</div>
                  ) : allPapers.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', padding: '2px 0' }}>
                      <input
                        type="checkbox"
                        checked={projectPaperIds.includes(p.id)}
                        onChange={e => togglePaperAssociation(p.id, e.target.checked)}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || p.file_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Task 3.3: Main panel — flex column with card background */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: theme.card, boxShadow: theme.shadow }}>

          {/* Task 4.1 + 4.2: Tab bar with message count */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid ' + theme.border, background: theme.card, flexShrink: 0 }}>
            <button
              onClick={() => setActiveTab('chat')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: 14,
                color: activeTab === 'chat' ? theme.primary : theme.textSub,
                fontWeight: activeTab === 'chat' ? 600 : 400,
                borderBottom: activeTab === 'chat' ? '2px solid ' + theme.primary : '2px solid transparent',
              }}
            >
              💬 {t('对话')}
            </button>
            {selectedSectionId !== null && (
              <button
                onClick={() => setActiveTab('standard')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: 14,
                  color: activeTab === 'standard' ? theme.primary : theme.textSub,
                  fontWeight: activeTab === 'standard' ? 600 : 400,
                  borderBottom: activeTab === 'standard' ? '2px solid ' + theme.primary : '2px solid transparent',
                }}
              >
                📋 {t('标准')}
              </button>
            )}
            <button
              onClick={() => setActiveTab('content')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '10px 20px', fontSize: 14,
                color: activeTab === 'content' ? theme.primary : theme.textSub,
                fontWeight: activeTab === 'content' ? 600 : 400,
                borderBottom: activeTab === 'content' ? '2px solid ' + theme.primary : '2px solid transparent',
              }}
            >
              📄 {t('内容')}
            </button>
            <div style={{ flex: 1 }} />
            {selectedSectionId === null && messages.length >= 2 && (
              <button
                onClick={openDraftModal}
                style={{ fontSize: 13, padding: '4px 14px', border: 'none', borderRadius: 6, background: '#52c41a', color: '#fff', cursor: 'pointer', fontWeight: 600, marginRight: 8 }}
              >
                {t('✨ 生成全文草稿')}
              </button>
            )}
            <span style={{ color: theme.textSub, fontSize: 12, paddingRight: 16 }}>{messages.length} {t('条消息')}</span>
          </div>

          {/* Task 5.1: Chat tab — full-width, hidden when inactive */}
          <div style={{ display: activeTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

            {/* Thread switcher row */}
            {(threads.length > 0 || selectedSectionId !== null) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', borderBottom: '1px solid ' + theme.border, flexShrink: 0, background: theme.bg, position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowThreadDropdown(v => !v)}
                    style={{ background: 'none', border: '1px solid ' + theme.border, borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: theme.textMain, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    💬 {threads.find(th => th.is_active)?.title ?? t('对话 1')}
                    {threads.length > 1 && <span style={{ color: theme.textSub }}>▾</span>}
                  </button>
                  {showThreadDropdown && threads.length > 0 && (
                    <div style={{ position: 'absolute', top: '110%', left: 0, background: theme.card, border: '1px solid ' + theme.border, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 160, overflow: 'hidden' }}>
                      {threads.map(t => (
                        <div
                          key={t.id}
                          onClick={() => switchThread(t.id)}
                          style={{ padding: '8px 14px', fontSize: 13, cursor: 'pointer', background: t.is_active ? '#e6f4ff' : 'transparent', color: t.is_active ? theme.primary : theme.textMain, fontWeight: t.is_active ? 600 : 400 }}
                        >
                          {t.title}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={createThread}
                  style={{ background: 'none', border: '1px solid ' + theme.border, borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: theme.textSub }}
                >＋ {t('新建对话')}</button>
              </div>
            )}
            {/* Task 5.2: message list with max-width centering */}
            <div style={{ flex: 1, overflow: 'auto', paddingTop: 16, paddingBottom: 8 }}>
              <div style={{ maxWidth: 760, margin: '0 auto', width: '100%', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m, i) => (
                  <MessageBubble key={i} message={m} />
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
            {/* Task 5.3: input area with max-width centering */}
            <div style={{ borderTop: '1px solid ' + theme.border, padding: '0 16px 12px', flexShrink: 0 }}>
              <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
                {/* Quick action and hint strip — above context toggles */}
                {selectedSectionId !== null && !streaming && selectedSection?.generation_cursor !== null && selectedSection?.generation_plan && (
                  <div style={{ paddingTop: 10, paddingBottom: 6, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      onClick={() => sendMessage('继续', selectedSectionId)}
                      disabled={streaming}
                      style={{ fontSize: 12, padding: '4px 12px', border: '1px solid #52c41a', borderRadius: 14, background: '#f6ffed', color: '#389e0d', cursor: 'pointer' }}
                    >
                      ▶ {t('继续生成下一段')}
                    </button>
                  </div>
                )}
                {selectedSectionId !== null && hintReady && !streaming && (
                  <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6, padding: '6px 12px', marginBottom: 6, fontSize: 12, color: '#389e0d', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{t('✅ 内容已覆盖写作要求主要方面，可以点击「生成章节内容」了')}</span>
                    {hintNotes.length > 0 && (
                      <span style={{ color: '#666', fontSize: 11 }}>（{hintNotes.join('；')}）</span>
                    )}
                  </div>
                )}
                {/* Context toggles row — above textarea */}
                <div style={{ display: 'flex', gap: 8, paddingTop: 10, paddingBottom: 6 }}>
                  <button
                    onClick={() => setUsePapers(v => !v)}
                    title={t('关联文章')}
                    style={{
                      padding: '3px 8px', fontSize: 11, borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: usePapers ? '1px solid #1677ff' : '1px solid #d9d9d9',
                      background: usePapers ? '#e6f4ff' : '#fafafa',
                      color: usePapers ? '#1677ff' : '#666',
                      fontWeight: usePapers ? 600 : 400,
                    }}
                  >📄 {t('关联文章')}</button>
                  <button
                    onClick={() => setUseProfile(v => !v)}
                    title={t('引用申请人档案')}
                    style={{
                      padding: '3px 8px', fontSize: 11, borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                      border: useProfile ? '1px solid #1677ff' : '1px solid #d9d9d9',
                      background: useProfile ? '#e6f4ff' : '#fafafa',
                      color: useProfile ? '#1677ff' : '#666',
                      fontWeight: useProfile ? 600 : 400,
                    }}
                  >👤 {t('引用档案')}</button>
                </div>
                {/* Textarea with send button embedded at bottom-right */}
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input, selectedSectionId); setInput('') } }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', paddingBottom: 44, paddingRight: 70, border: '1px solid ' + theme.border, borderRadius: 8, resize: 'none', height: 96, fontFamily: 'inherit', fontSize: 14, color: theme.textMain, outline: 'none' }}
                    placeholder={templateStatus === 'incomplete' ? t('请先完善模版…') : t('发送消息（Enter 发送，Shift+Enter 换行）')}
                    disabled={streaming || templateStatus === 'incomplete'}
                  />
                  <button
                    onClick={() => { sendMessage(input, selectedSectionId); setInput('') }}
                    disabled={!input.trim() || streaming || templateStatus === 'incomplete'}
                    style={{ ...btnStyle, position: 'absolute', bottom: 8, right: 8, height: 36, padding: '0 16px', fontSize: 14 }}
                  >{t('发送')}</button>
                </div>
                {/* Bottom action row — only when section selected */}
                {selectedSectionId !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
                    <button
                      onClick={generateSectionContent}
                      disabled={generatingSection || templateStatus === 'incomplete'}
                      style={{ fontSize: 13, padding: '5px 14px', border: 'none', borderRadius: 6, background: '#1677ff', color: '#fff', cursor: generatingSection ? 'default' : 'pointer', fontWeight: 600, opacity: generatingSection ? 0.7 : 1 }}
                    >
                      {generatingSection ? t('⏳ 生成中…') : t('✨ 生成章节内容')}
                    </button>
                    <button
                      onClick={generateStandard}
                      disabled={generatingStandard}
                      style={{ fontSize: 13, padding: '5px 14px', border: 'none', borderRadius: 6, background: '#52c41a', color: '#fff', cursor: generatingStandard ? 'default' : 'pointer', fontWeight: 600, opacity: generatingStandard ? 0.7 : 1 }}
                    >
                      {generatingStandard ? t('⏳ 生成中…') : t('📋 更新标准')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 标准 tab — writing standard editor */}
          {selectedSectionId !== null && (
            <div style={{ display: activeTab === 'standard' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
                <div style={{ maxWidth: 760, margin: '0 auto' }}>
                  {/* Header row with title and source badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: theme.textMain }}>{t('写作标准')}</h3>
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                      background: selectedSection?.has_writing_guide_override ? '#fff7e6' : '#f0f5ff',
                      color: selectedSection?.has_writing_guide_override ? '#d46b08' : '#2f54eb',
                      border: selectedSection?.has_writing_guide_override ? '1px solid #ffd591' : '1px solid #adc6ff',
                    }}>
                      {selectedSection?.has_writing_guide_override ? t('已自定义 ✏️') : t('来自模版')}
                    </span>
                  </div>

                  {/* Writing standard textarea editor */}
                  <textarea
                    value={standardContent}
                    onChange={e => { setStandardContent(e.target.value); setStandardDirty(true) }}
                    style={{
                      width: '100%', boxSizing: 'border-box', minHeight: 280,
                      padding: '12px 14px', border: '1px solid ' + theme.border, borderRadius: 8,
                      fontFamily: 'inherit', fontSize: 14, color: theme.textMain, lineHeight: 1.8,
                      resize: 'vertical', outline: 'none',
                    }}
                    placeholder={t('暂无写作标准。可在「对话」标签交流后点击底部「📋 更新标准」生成，或直接在此输入写作要求…')}
                  />

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
                    <button
                      onClick={saveWritingStandard}
                      disabled={!standardDirty}
                      style={{
                        padding: '7px 18px', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
                        background: standardDirty ? '#52c41a' : '#d9d9d9',
                        color: '#fff', cursor: standardDirty ? 'pointer' : 'default',
                      }}
                    >{t('💾 保存修改')}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Task 6.1: Content tab — hidden when inactive */}
          <div style={{ display: activeTab === 'content' ? 'block' : 'none', flex: 1, overflow: 'auto', padding: 24 }}>
            {showOverrides ? (
              <RuleOverridePanel projectId={pid} onClose={() => setShowOverrides(false)} />
            ) : selectedSection ? (
              <div style={{ maxWidth: 860, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: theme.textMain }}>{selectedSection.effective_section.title}</h2>
                    <span style={{ fontSize: 12, background: statusColor[selectedSection.status], color: '#fff', borderRadius: 4, padding: '2px 8px', marginTop: 4, display: 'inline-block' }}>
                      {statusLabel[selectedSection.status] || selectedSection.status}
                    </span>
                    {selectedSection.effective_section.word_limit && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: theme.textSub }}>
                        {selectedSection.word_count} / {selectedSection.effective_section.word_limit} {t('字')}
                      </span>
                    )}
                    {selectedSection.generation_cursor !== null && selectedSection.generation_plan && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: theme.primary, fontWeight: 500 }}>
                        {t('生成中 · 第')}{selectedSection.generation_cursor}/{selectedSection.generation_plan.length}{t('段')}
                      </span>
                    )}
                  </div>
                </div>

                {selectedSection.content ? (
                  <div>
                    {selectedSection.content.split('\n\n').map((para, idx) => (
                      <div key={idx} style={{ position: 'relative', marginBottom: 16, padding: '8px 12px', borderRadius: 6, border: '1px solid transparent' }}
                        onMouseEnter={e => { if (editingParaIdx !== idx) e.currentTarget.style.borderColor = theme.border }}
                        onMouseLeave={e => { if (editingParaIdx !== idx) e.currentTarget.style.borderColor = 'transparent' }}
                      >
                        {editingParaIdx === idx ? (
                          <div>
                            <textarea
                              value={editingParaText}
                              onChange={e => setEditingParaText(e.target.value)}
                              autoFocus
                              style={{ width: '100%', boxSizing: 'border-box', minHeight: 120, padding: '8px 10px', border: '1px solid ' + theme.primary, borderRadius: 6, fontFamily: 'inherit', fontSize: 14, color: theme.textMain, lineHeight: 1.7, resize: 'vertical', outline: 'none' }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button
                                onClick={saveInlineParaEdit}
                                style={{ padding: '5px 14px', border: 'none', borderRadius: 6, background: '#52c41a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                              >{t('✅ 保存')}</button>
                              <button
                                onClick={() => setEditingParaIdx(null)}
                                style={{ padding: '5px 14px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', color: '#555', cursor: 'pointer', fontSize: 13 }}
                              >{t('✕ 取消')}</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <ReactMarkdown>{para}</ReactMarkdown>
                            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                              <button
                                onClick={() => { setParagraphRevision({ idx, text: para }); setParaMessages([]); setConfirmedPara(null) }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.5 }}
                                title={t('AI 修改此段')}
                              >💬</button>
                              <button
                                onClick={() => { setEditingParaIdx(idx); setEditingParaText(para) }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: 0.5 }}
                                title={t('直接编辑此段')}
                              >✏️</button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {sectionStreamContent && selectedSectionId === selectedSection.id && (
                      <div style={{ padding: '8px 12px', borderRadius: 6, border: '1px dashed ' + theme.primary, background: '#f0f8ff', marginBottom: 16, color: theme.textMain, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
                        {sectionStreamContent}▌
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {sectionStreamContent && selectedSectionId === selectedSection.id ? (
                      <div style={{ padding: '8px 12px', borderRadius: 6, border: '1px dashed ' + theme.primary, background: '#f0f8ff', marginBottom: 16, color: theme.textMain, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
                        {sectionStreamContent}▌
                      </div>
                    ) : (
                      <div style={{ color: theme.textSub, fontStyle: 'italic', padding: 16 }}>
                        {t('暂无内容，请切换到「💬 对话」标签与 AI 交流后生成。')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: theme.textSub, padding: 16, maxWidth: 860, margin: '0 auto' }}>
                <h2 style={{ fontWeight: 700, fontSize: 18, color: theme.textMain }}>{t('项目概览')}</h2>
                <p>{t('点击左侧章节开始写作，或在「💬 对话」标签与 AI 评审人交流研究方向。')}</p>
                {sections.some(s => s.skeleton_text) && (
                  <div>
                    <h3 style={{ fontWeight: 600, marginTop: 16, color: theme.textMain }}>{t('章节骨架')}</h3>
                    {sections.map(s => s.skeleton_text ? (
                      <div key={s.id} style={{ marginBottom: 8, padding: 10, background: theme.bg, borderRadius: 6, border: '1px solid ' + theme.border }}>
                        <strong style={{ color: theme.textMain }}>{s.effective_section.title}</strong>
                        <span style={{ color: theme.textSub }}>：{s.skeleton_text}</span>
                      </div>
                    ) : null)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Generate Standard Modal */}
      {standardPreview !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, width: '90%', maxWidth: 640, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('AI 建议的写作标准')}</h3>
              <button onClick={() => setStandardPreview(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, padding: '12px 16px', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {standardPreview}
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e8e8e8', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setStandardPreview(null)}
                style={{ padding: '6px 18px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >{t('取消')}</button>
              <button
                onClick={confirmAdoptStandard}
                style={{ padding: '6px 18px', border: 'none', borderRadius: 6, background: '#52c41a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >{t('✅ 采用此标准')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Draft Generation Modal */}
      {showDraftModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: theme.card, borderRadius: 14, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid ' + theme.border }}>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: 16, color: theme.textMain }}>
                {draftPhase === 'preview' && t('✨ 生成全文草稿')}
                {draftPhase === 'generating' && `${t('⚙️ 正在生成…')} ${draftCurrentTitle}`}
                {draftPhase === 'done' && t('✅ 全部章节生成完成')}
              </h3>
              {draftPhase === 'preview' && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: theme.textSub }}>
                  {lang === 'zh'
                    ? `将根据对话中的研究方向，为以下 ${sections.length} 个章节生成初稿内容。`
                    : `This will generate drafts for ${sections.length} sections based on your research direction.`}
                </p>
              )}
              {draftPhase === 'generating' && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: theme.textSub }}>
                  {lang === 'zh'
                    ? `已完成 ${draftCompleted} / ${sections.length} 个章节`
                    : `Completed ${draftCompleted} / ${sections.length} sections`}
                </p>
              )}
              {draftPhase === 'done' && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#52c41a' }}>
                  {lang === 'zh'
                    ? `共生成 ${draftCompleted} 个章节，请切换到各章节查看内容。`
                    : `Generated ${draftCompleted} sections. Switch to each section to view content.`}
                </p>
              )}
            </div>

            {/* Section list */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 24px' }}>
              {sections.map((s, i) => {
                const st = draftSectionStatus[s.id]
                const icon = draftPhase === 'preview'
                  ? (s.status !== 'empty' ? '📄' : '○')
                  : st === 'generating' ? '⚙️'
                  : st === 'done' ? '✅'
                  : st === 'error' ? '❌'
                  : '○'
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < sections.length - 1 ? '1px solid ' + theme.border : 'none' }}>
                    <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0, width: 20, textAlign: 'center' }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: theme.textMain }}>
                        {s.effective_section.title}
                        {s.effective_section.word_limit && (
                          <span style={{ fontWeight: 400, color: theme.textSub, marginLeft: 8, fontSize: 12 }}>
                            {lang === 'zh' ? `约 ${s.effective_section.word_limit} 字` : `~${s.effective_section.word_limit} chars`}
                          </span>
                        )}
                      </div>
                      {draftPhase === 'preview' && s.effective_section.writing_guide && (
                        <div style={{ fontSize: 12, color: theme.textSub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.effective_section.writing_guide.substring(0, 60)}{s.effective_section.writing_guide.length > 60 ? '…' : ''}
                        </div>
                      )}
                      {draftPhase === 'preview' && s.status !== 'empty' && (
                        <div style={{ fontSize: 12, color: '#fa8c16', marginTop: 2 }}>{t('已有草稿，将被覆盖')}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Footer buttons */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid ' + theme.border, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {draftPhase === 'preview' && (
                <>
                  <button onClick={() => setShowDraftModal(false)} style={{ padding: '8px 18px', border: '1px solid ' + theme.border, borderRadius: 6, background: theme.card, color: theme.textMain, cursor: 'pointer', fontSize: 14 }}>
                    {t('取消')}
                  </button>
                  <button onClick={startDraftGeneration} style={{ padding: '8px 20px', border: 'none', borderRadius: 6, background: '#52c41a', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                    {t('开始生成')}
                  </button>
                </>
              )}
              {draftPhase === 'generating' && (
                <span style={{ fontSize: 13, color: theme.textSub, alignSelf: 'center' }}>{t('生成中，请勿关闭此窗口…')}</span>
              )}
              {draftPhase === 'done' && (
                <button onClick={closeDraftModalAndNavigate} style={{ padding: '8px 24px', border: 'none', borderRadius: 6, background: theme.primary, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  {t('完成，查看内容 →')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Paragraph Revision Modal */}
      {paragraphRevision !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: theme.card, borderRadius: 12, padding: 24, width: 580, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}>
            <h3 style={{ margin: '0 0 12px', fontWeight: 700, color: theme.textMain }}>{t('段落修改对话')}</h3>
            <div style={{ background: theme.bg, borderRadius: 8, padding: 12, marginBottom: 12, maxHeight: 150, overflow: 'auto', fontSize: 13, border: '1px solid ' + theme.border }}>
              <strong style={{ color: theme.textSub }}>{t('当前段落：')}</strong>
              <ReactMarkdown>{paragraphRevision.text}</ReactMarkdown>
            </div>
            <div style={{ flex: 1, overflow: 'auto', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 100 }}>
              {paraMessages.map((m, i) => <MessageBubble key={i} message={m} />)}
              <div ref={paraChatEndRef} />
            </div>
            {confirmedPara && (
              <div style={{ background: '#f0fff4', border: '1px solid #b7eb8f', borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 13 }}>
                <strong>{t('最新修改版本：')}</strong>
                <div style={{ marginTop: 4, color: theme.textMain }}>{confirmedPara.substring(0, 200)}{confirmedPara.length > 200 ? '…' : ''}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <textarea
                value={paraInput}
                onChange={e => setParaInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendParaMessage(paraInput); setParaInput('') } }}
                style={{ flex: 1, padding: 10, border: '1px solid ' + theme.border, borderRadius: 8, resize: 'none', height: 56, fontFamily: 'inherit', fontSize: 14 }}
                placeholder={t('描述修改意图…')}
                disabled={paraStreaming}
              />
              <button onClick={() => { sendParaMessage(paraInput); setParaInput('') }} disabled={!paraInput.trim() || paraStreaming} style={{ ...btnStyle, alignSelf: 'flex-end', height: 40 }}>{t('发送')}</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmParagraphRevision} disabled={!confirmedPara} style={{ ...btnStyle, background: '#52c41a' }}>{t('确认替换')}</button>
              <button onClick={() => { setParagraphRevision(null); setParaMessages([]); setConfirmedPara(null) }} style={{ ...btnStyle, background: theme.textSub }}>{t('放弃修改')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Generate-and-Check Preview Modal */}
      {genPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 10, width: '90%', maxWidth: 760, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{t('生成内容预览')}</h3>
              <button onClick={() => setGenPreview(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              {/* Generated content */}
              <div style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, padding: '12px 16px', marginBottom: 16, fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto' }}>
                {genPreview.content}
              </div>
              {/* Quality check results */}
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: '#333' }}>{t('质检结果（参考）')}</div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {lang === 'zh' ? `字数：${genPreview.quality_check.word_count} 字` : `Length: ${genPreview.quality_check.word_count} chars`}
                  </span>
                  {genPreview.quality_check.word_limit && (
                    <span style={{ fontSize: 12, color: genPreview.quality_check.within_limit ? '#52c41a' : '#fa8c16' }}>
                      {genPreview.quality_check.within_limit ? '✅' : '⚠️'}{' '}
                      {lang === 'zh' ? `要求约 ${genPreview.quality_check.word_limit} 字` : `Required: ~${genPreview.quality_check.word_limit} chars`}
                    </span>
                  )}
                </div>
                {genPreview.quality_check.requirements_met.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {genPreview.quality_check.requirements_met.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#389e0d', marginBottom: 3 }}>✅ {r}</div>
                    ))}
                  </div>
                )}
                {genPreview.quality_check.requirements_missed.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {genPreview.quality_check.requirements_missed.map((r, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#d46b08', marginBottom: 3 }}>⚠️ {r}</div>
                    ))}
                  </div>
                )}
                {genPreview.quality_check.overall && (
                  <div style={{ fontSize: 12, color: '#555', background: '#f5f5f5', borderRadius: 4, padding: '8px 12px', marginTop: 8 }}>
                    {genPreview.quality_check.overall}
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e8e8e8', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setGenPreview(null)}
                style={{ padding: '6px 18px', border: '1px solid #d9d9d9', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}
              >{t('继续对话')}</button>
              <button
                onClick={confirmWriteSectionContent}
                style={{ padding: '6px 18px', border: 'none', borderRadius: 6, background: '#1677ff', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >{t('写入章节内容')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Task 7.2: updated MessageBubble with design tokens
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div style={{
        maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: theme.msgRadius,
        fontSize: theme.msgFontSize,
        lineHeight: theme.msgLineHeight,
        background: isUser ? theme.primary : '#f0f2f5',
        color: isUser ? '#fff' : theme.textMain,
      }}>
        {isUser ? message.content : <ReactMarkdown>{message.content + (message.streaming ? '▌' : '')}</ReactMarkdown>}
      </div>
    </div>
  )
}

// Task 7.3: updated button styles using theme tokens
const btnStyle: React.CSSProperties = {
  padding: '8px 18px',
  background: theme.primary,
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontSize: 14,
}
const headerBtn: React.CSSProperties = {
  padding: '5px 14px',
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  textDecoration: 'none',
}
