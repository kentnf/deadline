import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err.response?.data?.message || err.message || 'Unknown error'
    console.error('API error:', msg)
    return Promise.reject(err)
  }
)

export default api

// Templates
export const templatesApi = {
  list: () => api.get('/templates'),
  get: (id: number) => api.get(`/templates/${id}`),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/templates/upload', form)
  },
  parse: (fileId: string) =>
    api.post(`/templates/parse?file_id=${fileId}`),
  save: (data: { name: string; sections: TemplateSection[] }) =>
    api.post('/templates', data),
  delete: (id: number, force = false) =>
    api.delete(`/templates/${id}?force=${force}`),
}

// Projects
export const projectsApi = {
  list: () => api.get('/projects'),
  get: (id: number) => api.get(`/projects/${id}`),
  create: (name: string, templateId: number) =>
    api.post('/projects', { name, template_id: templateId }),
  delete: (id: number) => api.delete(`/projects/${id}`),
  getStatus: (id: number) => api.get(`/projects/${id}/status`),
}

// Sections
export const sectionsApi = {
  updateContent: (projectId: number, sectionId: number, content: string) =>
    api.put(`/projects/${projectId}/sections/${sectionId}/content`, { content }),
  generateSkeleton: (projectId: number, sectionId: number) =>
    api.post(`/projects/${projectId}/sections/${sectionId}/generate-skeleton`),
}

// Overrides
export const overridesApi = {
  list: (projectId: number) => api.get(`/projects/${projectId}/overrides`),
  create: (projectId: number, data: OverrideCreate) =>
    api.post(`/projects/${projectId}/overrides`, data),
  delete: (projectId: number, overrideId: number) =>
    api.delete(`/projects/${projectId}/overrides/${overrideId}`),
}

// LLM
export const llmApi = {
  getConfig: () => api.get('/llm/config'),
  saveConfig: (config: LLMConfig) => api.put('/llm/config', config),
  test: () => api.post('/llm/test'),
}

// Types
export interface LLMConfig {
  provider: string
  model: string
  api_key: string
  base_url?: string
}

export interface TemplateSection {
  title: string
  level: number
  word_limit?: number | null
  writing_guide?: string | null
  order: number
  parent_id?: number | null
  children?: TemplateSection[]
}

export interface OverrideCreate {
  section_id?: number | null
  override_type: string
  original_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  user_reason?: string | null
}
