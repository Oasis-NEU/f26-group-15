/**
 * In-browser fake backend. Implements the same LabelAIApi as the real client
 * so every page works before FastAPI is ready.
 *
 * - Metadata and annotations persist in localStorage.
 * - Uploaded image files persist in IndexedDB (localStorage is too small).
 * - predict() runs classical blob detection (lib/mockVision.ts).
 *
 * Reset everything with the "Reset demo data" button on the dashboard or by
 * clearing site data in the browser.
 */
import type {
  Annotation,
  Dataset,
  ExportFormat,
  Id,
  ImageRecord,
  ImageStatus,
  LabelClass,
  PredictRequest,
  Project,
} from '../types/annotation'
import { toCoco, toNativeJson, toYolo, yoloToText } from '../lib/exporters'
import { detectObjects, loadGray } from '../lib/mockVision'
import { newId, nowIso } from '../lib/util'
import { ApiError, type LabelAIApi } from './types'

const STORAGE_KEY = 'labelai.mock.v1'

interface StoredImage extends Omit<ImageRecord, 'annotation_count' | 'url'> {
  /** "sample:<path>" for bundled demo images, "idb" for uploads. */
  source: string
}

interface Db {
  projects: Project[]
  classes: LabelClass[]
  datasets: Dataset[]
  images: StoredImage[]
  annotations: Annotation[]
}

const SAMPLE_FILES = ['nuclei-01.jpg', 'nuclei-02.jpg', 'nuclei-03.jpg', 'nuclei-04.jpg', 'nuclei-05.jpg', 'nuclei-06.jpg']

function seed(): Db {
  const t = nowIso()
  const project: Project = {
    id: newId(),
    name: 'Nuclei segmentation demo',
    description: 'Synthetic fluorescence microscopy images for trying the labeling flow. Not patient data.',
    created_at: t,
  }
  const dataset: Dataset = { id: newId(), project_id: project.id, name: 'Synthetic DAPI, batch 1', created_at: t }
  const classes: LabelClass[] = [
    { id: newId(), project_id: project.id, name: 'Nucleus', color: '#F2C14E' },
    { id: newId(), project_id: project.id, name: 'Dividing nucleus', color: '#F07C6B' },
  ]
  const images: StoredImage[] = SAMPLE_FILES.map((f) => ({
    id: newId(),
    dataset_id: dataset.id,
    file_name: f,
    width: 768,
    height: 576,
    status: 'unlabeled',
    created_at: t,
    source: `sample:samples/${f}`,
  }))
  return { projects: [project], classes, datasets: [dataset], images, annotations: [] }
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    // corrupted or unavailable storage: fall through to a fresh seed
  }
  const db = seed()
  save(db)
  return db
}

function save(db: Db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch (e) {
    console.warn('[mockApi] could not persist to localStorage', e)
  }
}

// ---- IndexedDB blob store for uploaded files --------------------------------

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('labelai-mock', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('files')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(key: string, blob: Blob) {
  const db = await idb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite')
    tx.objectStore('files').put(blob, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet(key: string): Promise<Blob | undefined> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const req = db.transaction('files').objectStore('files').get(key)
    req.onsuccess = () => resolve(req.result as Blob | undefined)
    req.onerror = () => reject(req.error)
  })
}

async function idbDelete(key: string) {
  const db = await idb()
  db.transaction('files', 'readwrite').objectStore('files').delete(key)
}

async function idbClear() {
  const db = await idb()
  db.transaction('files', 'readwrite').objectStore('files').clear()
}

// ---- helpers -----------------------------------------------------------------

const objectUrls = new Map<Id, string>()
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function notFound(what: string): never {
  throw new ApiError(404, `${what} not found`)
}

async function resolveUrl(img: StoredImage): Promise<string> {
  if (img.source.startsWith('sample:')) return import.meta.env.BASE_URL + img.source.slice('sample:'.length)
  const cached = objectUrls.get(img.id)
  if (cached) return cached
  const blob = await idbGet(img.id)
  if (!blob) return ''
  const url = URL.createObjectURL(blob)
  objectUrls.set(img.id, url)
  return url
}

async function toRecord(db: Db, img: StoredImage): Promise<ImageRecord> {
  const { source: _source, ...rest } = img
  return {
    ...rest,
    url: await resolveUrl(img),
    annotation_count: db.annotations.filter((a) => a.image_id === img.id && a.status === 'accepted').length,
  }
}

async function imageSize(file: File): Promise<{ width: number; height: number }> {
  const bmp = await createImageBitmap(file)
  const size = { width: bmp.width, height: bmp.height }
  bmp.close()
  return size
}

// ---- the API -----------------------------------------------------------------

export function createMockApi(): LabelAIApi & { reset(): Promise<void> } {
  let db = load()
  const commit = () => save(db)

  return {
    async reset() {
      localStorage.removeItem(STORAGE_KEY)
      await idbClear()
      objectUrls.forEach((u) => URL.revokeObjectURL(u))
      objectUrls.clear()
      db = load()
    },

    async listProjects() {
      await delay(80)
      return [...db.projects].sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async getProject(id) {
      await delay(40)
      return db.projects.find((p) => p.id === id) ?? notFound('Project')
    },
    async createProject({ name, description }) {
      await delay(120)
      const p: Project = { id: newId(), name, description, created_at: nowIso() }
      db.projects.push(p)
      commit()
      return p
    },
    async deleteProject(id) {
      await delay(120)
      const datasetIds = db.datasets.filter((d) => d.project_id === id).map((d) => d.id)
      const imageIds = db.images.filter((i) => datasetIds.includes(i.dataset_id)).map((i) => i.id)
      db.projects = db.projects.filter((p) => p.id !== id)
      db.classes = db.classes.filter((c) => c.project_id !== id)
      db.datasets = db.datasets.filter((d) => d.project_id !== id)
      db.images = db.images.filter((i) => !imageIds.includes(i.id))
      db.annotations = db.annotations.filter((a) => !imageIds.includes(a.image_id))
      await Promise.all(imageIds.map(idbDelete))
      commit()
    },

    async listClasses(projectId) {
      await delay(40)
      return db.classes.filter((c) => c.project_id === projectId)
    },
    async createClass(projectId, { name, color }) {
      await delay(80)
      const c: LabelClass = { id: newId(), project_id: projectId, name, color }
      db.classes.push(c)
      commit()
      return c
    },
    async updateClass(id, patch) {
      await delay(60)
      const c = db.classes.find((x) => x.id === id) ?? notFound('Class')
      Object.assign(c, patch)
      commit()
      return c
    },
    async deleteClass(id) {
      await delay(80)
      if (db.annotations.some((a) => a.class_id === id)) {
        throw new ApiError(409, 'This class is used by existing annotations. Reassign or delete them first.')
      }
      db.classes = db.classes.filter((c) => c.id !== id)
      commit()
    },

    async listDatasets(projectId) {
      await delay(60)
      return db.datasets.filter((d) => d.project_id === projectId)
    },
    async getDataset(id) {
      await delay(40)
      return db.datasets.find((d) => d.id === id) ?? notFound('Dataset')
    },
    async createDataset(projectId, { name }) {
      await delay(120)
      const d: Dataset = { id: newId(), project_id: projectId, name, created_at: nowIso() }
      db.datasets.push(d)
      commit()
      return d
    },
    async deleteDataset(id) {
      await delay(120)
      const imageIds = db.images.filter((i) => i.dataset_id === id).map((i) => i.id)
      db.datasets = db.datasets.filter((d) => d.id !== id)
      db.images = db.images.filter((i) => i.dataset_id !== id)
      db.annotations = db.annotations.filter((a) => !imageIds.includes(a.image_id))
      await Promise.all(imageIds.map(idbDelete))
      commit()
    },

    async listImages(datasetId) {
      await delay(80)
      const imgs = db.images.filter((i) => i.dataset_id === datasetId)
      return Promise.all(imgs.map((i) => toRecord(db, i)))
    },
    async getImage(id) {
      await delay(40)
      const img = db.images.find((i) => i.id === id) ?? notFound('Image')
      return toRecord(db, img)
    },
    async uploadImages(datasetId, files) {
      const created: StoredImage[] = []
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          throw new ApiError(415, `${file.name} is not a PNG or JPEG image. DICOM needs to be converted first.`)
        }
        const { width, height } = await imageSize(file)
        const img: StoredImage = {
          id: newId(),
          dataset_id: datasetId,
          file_name: file.name,
          width,
          height,
          status: 'unlabeled',
          created_at: nowIso(),
          source: 'idb',
        }
        await idbPut(img.id, file)
        db.images.push(img)
        created.push(img)
      }
      commit()
      return Promise.all(created.map((i) => toRecord(db, i)))
    },
    async updateImageStatus(id, status: ImageStatus) {
      await delay(60)
      const img = db.images.find((i) => i.id === id) ?? notFound('Image')
      img.status = status
      commit()
      return toRecord(db, img)
    },
    async deleteImage(id) {
      await delay(80)
      db.images = db.images.filter((i) => i.id !== id)
      db.annotations = db.annotations.filter((a) => a.image_id !== id)
      await idbDelete(id)
      commit()
    },

    async listAnnotations(imageId) {
      await delay(60)
      return db.annotations.filter((a) => a.image_id === imageId)
    },
    async saveAnnotations(imageId, annotations) {
      await delay(150)
      const img = db.images.find((i) => i.id === imageId) ?? notFound('Image')
      const clean = annotations.map((a) => ({ ...a, image_id: imageId }))
      db.annotations = [...db.annotations.filter((a) => a.image_id !== imageId), ...clean]
      if (img.status === 'unlabeled' && clean.length > 0) img.status = 'in_progress'
      commit()
      return clean
    },

    async predict(imageId, req: PredictRequest) {
      const img = db.images.find((i) => i.id === imageId) ?? notFound('Image')
      const started = performance.now()
      const { img: gray, scale } = await loadGray(await resolveUrl(img))
      const exemplars = (req.exemplars ?? []).map((e) => ({
        ...e,
        x: e.x * scale,
        y: e.y * scale,
        width: e.width * scale,
        height: e.height * scale,
      }))
      const found = detectObjects(gray, exemplars)
      // feel like a model call even when the math is instant
      const elapsed = performance.now() - started
      if (elapsed < 600) await delay(600 - elapsed)
      const t = nowIso()
      return found.map(
        (d): Annotation => ({
          id: newId(),
          image_id: imageId,
          class_id: req.class_id,
          geometry: {
            type: 'polygon',
            points: d.geometry.points.map(([x, y]) => [Math.round((x / scale) * 10) / 10, Math.round((y / scale) * 10) / 10]),
          },
          source: 'ai',
          confidence: d.confidence,
          status: 'pending',
          created_at: t,
          updated_at: t,
        }),
      )
    },

    async exportDataset(datasetId, format: ExportFormat) {
      await delay(200)
      const ds = db.datasets.find((d) => d.id === datasetId) ?? notFound('Dataset')
      const imgs = db.images.filter((i) => i.dataset_id === datasetId)
      const images = await Promise.all(imgs.map((i) => toRecord(db, i)))
      const input = {
        images,
        classes: db.classes.filter((c) => c.project_id === ds.project_id),
        annotations: db.annotations.filter((a) => imgs.some((i) => i.id === a.image_id)),
      }
      if (format === 'coco') return new Blob([JSON.stringify(toCoco(input), null, 2)], { type: 'application/json' })
      if (format === 'yolo') return new Blob([yoloToText(toYolo(input))], { type: 'text/plain' })
      return new Blob([JSON.stringify(toNativeJson(input), null, 2)], { type: 'application/json' })
    },
  }
}
