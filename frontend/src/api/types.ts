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

/**
 * Everything the frontend needs from the backend.
 * Two implementations: mockApi (in-browser, for building without a server)
 * and httpApi (talks to FastAPI). docs/api-contract.md maps each method to
 * its REST route.
 */
export interface LabelAIApi {
  listProjects(): Promise<Project[]>
  getProject(id: Id): Promise<Project>
  createProject(input: { name: string; description: string }): Promise<Project>
  deleteProject(id: Id): Promise<void>

  listClasses(projectId: Id): Promise<LabelClass[]>
  createClass(projectId: Id, input: { name: string; color: string }): Promise<LabelClass>
  updateClass(id: Id, input: { name?: string; color?: string }): Promise<LabelClass>
  deleteClass(id: Id): Promise<void>

  listDatasets(projectId: Id): Promise<Dataset[]>
  getDataset(id: Id): Promise<Dataset>
  createDataset(projectId: Id, input: { name: string }): Promise<Dataset>
  deleteDataset(id: Id): Promise<void>

  listImages(datasetId: Id): Promise<ImageRecord[]>
  getImage(id: Id): Promise<ImageRecord>
  uploadImages(datasetId: Id, files: File[]): Promise<ImageRecord[]>
  updateImageStatus(id: Id, status: ImageStatus): Promise<ImageRecord>
  deleteImage(id: Id): Promise<void>

  listAnnotations(imageId: Id): Promise<Annotation[]>
  /** Replaces the full annotation set for one image (what autosave sends). */
  saveAnnotations(imageId: Id, annotations: Annotation[]): Promise<Annotation[]>

  /** Runs the model. Returns suggestions with source "ai" and status "pending"; not saved yet. */
  predict(imageId: Id, request: PredictRequest): Promise<Annotation[]>

  exportDataset(datasetId: Id, format: ExportFormat): Promise<Blob>
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
