import { useEffect, useMemo, useRef, useState } from 'react'
import { Upload, Camera, Link2 } from 'lucide-react'
import { api } from '../api'
import type { DocumentRecord } from '../types'

type Props = {
  vehicleId: string
  documents: DocumentRecord[]
  loading: boolean
  onRefresh: () => Promise<void>
}

function isMobileDevice() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

export function VehiclePublicMediaPanel({ vehicleId, documents, loading, onRefresh }: Props) {
  const [mobile, setMobile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setMobile(isMobileDevice())
  }, [])

  const glamShots = useMemo(
    () => documents.filter((doc) => doc.ownerType === 'Vehicle' && doc.kind === 'CarPhoto'),
    [documents],
  )

  async function uploadPhoto(file: File) {
    if (!file || file.size === 0) return
    setBusy(true)
    setMessage('Saving public photo...')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', 'CarPhoto')
      form.append('description', 'Public glam shot')
      await api.postForm(`/api/vehicles/${vehicleId}/documents`, form)
      await onRefresh()
      setMessage('Photo saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save photo.')
    } finally {
      setBusy(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  return (
    <div className="panel">
      <div className="section-heading">
        <div>
          <h2>Public Listing Media</h2>
          <p>Upload glam shots here. On phones you can take a photo or upload one. On desktop, upload only.</p>
        </div>
        <span className="tag">{glamShots.length}</span>
      </div>

      <div className="public-media-actions">
        {mobile ? (
          <>
            <button
              className="secondary-button"
              type="button"
              disabled={busy || loading}
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera size={16} />
              Take Photo
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy || loading}
              onClick={() => uploadInputRef.current?.click()}
            >
              <Upload size={16} />
              Upload Image
            </button>
          </>
        ) : (
          <button
            className="secondary-button"
            type="button"
            disabled={busy || loading}
            onClick={() => uploadInputRef.current?.click()}
          >
            <Upload size={16} />
            Upload Image
          </button>
        )}
        <span className="hint-text">Add one or more glam shots for the website.</span>
      </div>

      <input
        ref={uploadInputRef}
        className="public-media-input"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          if (file) void uploadPhoto(file)
        }}
      />
      <input
        ref={cameraInputRef}
        className="public-media-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          if (file) void uploadPhoto(file)
        }}
      />

      {message && <p className="hint-text">{message}</p>}

      {glamShots.length === 0 ? (
        <p className="hint-text">No glam shots uploaded yet.</p>
      ) : (
        <div className="public-media-grid">
          {glamShots.map((doc) => (
            <article key={doc.id} className="public-media-card">
              <a href={`/api/documents/${doc.id}/content`} target="_blank" rel="noreferrer">
                <img src={`/api/documents/${doc.id}/content`} alt={doc.description ?? doc.originalFileName} />
              </a>
              <div>
                <strong>{doc.originalFileName}</strong>
                <p className="hint-text">
                  <Link2 size={14} />
                  <span>Used for public listing</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
