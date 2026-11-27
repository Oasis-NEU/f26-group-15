/**
 * Real client for the FastAPI backend. Routes follow docs/api-contract.md.
 * Turned on with VITE_API_MODE=http and VITE_API_URL=http://localhost:8000.
 */
import type { Annotation, ExportFormat, Id, ImageRecord } from '../types/annotation'
import { supabase } from '../lib/supabase'
import { ApiError, type LabelAIApi } from './types'

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function createHttpApi(baseUrl: string): LabelAIApi {
  const base = baseUrl.replace(/\/$/, '')

  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { ...(await authHeader()) }
    let payload: BodyInit | undefined
    if (body instanceof FormData) {
      payload = body
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    const res = await fetch(base + path, { method, headers, body: payload })
    if (!res.ok) {
      // FastAPI errors look like {"detail": "..."}; validation errors make detail a list
      let message = `${method} ${path} failed (${res.status})`
      try {
        const err = (await res.json()) as { detail?: unknown }
        if (typeof err.detail === 'string') message = err.detail
        else if (Array.isArray(err.detail)) message = err.detail.map((d: { msg?: string }) => d.msg).join('; ')
      } catch {
        // response was not JSON
      }
      throw new ApiError(res.status, message)
    }
    return res
  }

  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    (await request(method, path, body)).json() as Promise<T>
  const none = async (method: string, path: string): Promise<void> => {
    await request(method, path)
  }

  return {
    listProjects: () => json('GET', '/projects'),
    getProject: (id) => json('GET', `/projects/${id}`),
    createProject: (input) => json('POST', '/projects', input),
    deleteProject: (id) => none('DELETE', `/projects/${id}`),

    listClasses: (projectId) => json('GET', `/projects/${projectId}/classes`),
    createClass: (projectId, input) => json('POST', `/projects/${projectId}/classes`, input),
    updateClass: (id, input) => json('PATCH', `/classes/${id}`, input),
    deleteClass: (id) => none('DELETE', `/classes/${id}`),

    listDatasets: (projectId) => json('GET', `/projects/${projectId}/datasets`),
    getDataset: (id) => json('GET', `/datasets/${id}`),
    createDataset: (projectId, input) => json('POST', `/projects/${projectId}/datasets`, input),
    deleteDataset: (id) => none('DELETE', `/datasets/${id}`),

    listImages: (datasetId) => json('GET', `/datasets/${datasetId}/images`),
    getImage: (id) => json('GET', `/images/${id}`),
    uploadImages(datasetId, files) {
      const form = new FormData()
      files.forEach((f) => form.append('files', f))
      return json<ImageRecord[]>('POST', `/datasets/${datasetId}/images`, form)
    },
    updateImageStatus: (id, status) => json('PATCH', `/images/${id}`, { status }),
    deleteImage: (id) => none('DELETE', `/images/${id}`),

    listAnnotations: (imageId) => json('GET', `/images/${imageId}/annotations`),
    saveAnnotations: (imageId: Id, annotations: Annotation[]) =>
      json('PUT', `/images/${imageId}/annotations`, { annotations }),

    predict: (imageId, req) => json('POST', `/images/${imageId}/predict`, req),

    async exportDataset(datasetId: Id, format: ExportFormat) {
      return (await request('GET', `/datasets/${datasetId}/export?format=${format}`)).blob()
    },
  }
}
