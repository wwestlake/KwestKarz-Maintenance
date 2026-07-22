import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Camera, Star } from 'lucide-react'
import { api } from '../api'
import type { VehiclePhotoRecord } from '../types'

type Props = {
  vehicleId: string
  loading: boolean
}

function isMobileDevice() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

export function VehiclePublicMediaPanel({ vehicleId, loading }: Props) {
  const [mobile, setMobile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [photos, setPhotos] = useState<VehiclePhotoRecord[]>([])
  const [photosLoading, setPhotosLoading] = useState(true)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const cameraInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setMobile(isMobileDevice())
  }, [])

  const refreshPhotos = useCallback(async () => {
    setPhotosLoading(true)
    try {
      const rows = await api.get<VehiclePhotoRecord[]>(`/api/vehicles/${vehicleId}/photos`)
      setPhotos(rows)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load public photos.')
    } finally {
      setPhotosLoading(false)
    }
  }, [vehicleId])

  useEffect(() => {
    void refreshPhotos()
  }, [refreshPhotos])

  async function uploadPhoto(file: File) {
    if (!file || file.size === 0) return
    setBusy(true)
    setMessage('Saving public photo...')
    try {
      const form = new FormData()
      form.append('photo', file)
      form.append('isPrimary', photos.length === 0 ? 'true' : 'false')
      await api.postForm(`/api/vehicles/${vehicleId}/photos`, form)
      await refreshPhotos()
      setMessage('Photo saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save photo.')
    } finally {
      setBusy(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      if (cameraInputRef.current) cameraInputRef.current.value = ''
    }
  }

  async function makePrimary(photoId: string) {
    setBusy(true)
    setMessage('Updating primary photo...')
    try {
      await api.put(`/api/vehicles/${vehicleId}/photos/${photoId}/primary`, {})
      await refreshPhotos()
      setMessage('Primary photo updated.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update primary photo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div className="section-heading">
        <div>
          <h2>Public Listing Media</h2>
          <p>Upload glam shots here. On phones you can take a photo or upload one. On desktop, upload only.</p>
        </div>
        <span className="tag">{photos.length}</span>
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

      {photosLoading ? (
        <p className="hint-text">Loading public photos...</p>
      ) : photos.length === 0 ? (
        <p className="hint-text">No glam shots uploaded yet.</p>
      ) : (
        <div className="public-media-grid">
          {photos.map((photo) => (
            <article key={photo.id} className="public-media-card">
              <a href={`/api/public/vehicles/${vehicleId}/photos/${photo.id}/content`} target="_blank" rel="noreferrer">
                <img
                  src={`/api/public/vehicles/${vehicleId}/photos/${photo.id}/content`}
                  alt={photo.originalFileName}
                />
              </a>
              <div>
                <strong>{photo.originalFileName}</strong>
                {photo.isPrimary ? (
                  <p className="hint-text">
                    <Star size={14} />
                    <span>Primary photo</span>
                  </p>
                ) : (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy || loading}
                    onClick={() => void makePrimary(photo.id)}
                  >
                    <Star size={14} />
                    Make primary
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
