import { useEffect, useMemo, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { api } from '../api'
import type { PublicVehicle } from '../types'
import { PublicSiteHeader } from './PublicSiteHeader'
import { PhotoCarousel } from './PhotoCarousel'
import type { CarouselSlide } from './PhotoCarousel'

type VehiclePhoto = {
  id: string
  vehicleId: string
  contentType: string
  originalFileName: string
  sizeBytes: number
  isPrimary: boolean
  displayOrder: number
  createdAt: string
  createdBy: string | null
}

export function PublicCarDetailPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null)
  const [photos, setPhotos] = useState<VehiclePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const vehicleId = window.location.pathname.split('/cars/')[1]

  useEffect(() => {
    (async () => {
      try {
        const [vehicles, vehiclePhotos] = await Promise.all([
          api.get<PublicVehicle[]>(`/api/public/vehicles`),
          api.get<VehiclePhoto[]>(`/api/public/vehicles/${vehicleId}/photos`).catch(() => [])
        ])

        const found = vehicles.find(v => v.id === vehicleId)
        if (found) {
          setVehicle(found)
          setPhotos(vehiclePhotos)
        } else {
          setError('Vehicle not found')
        }
      } catch {
        setError('Could not load vehicle details')
      } finally {
        setLoading(false)
      }
    })()
  }, [vehicleId])

  const title = vehicle ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') : ''

  const carouselSlides = useMemo<CarouselSlide[]>(
    () =>
      photos.map((photo) => ({
        key: photo.id,
        imageUrl: `/api/public/vehicles/${vehicleId}/photos/${photo.id}/content`,
        alt: title || 'Vehicle photo',
      })),
    [photos, vehicleId, title],
  )

  if (loading) {
    return (
      <main className="public-page">
        <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(val => !val)} />
        <section className="public-feature">
          <p className="hint-text">Loading vehicle details...</p>
        </section>
      </main>
    )
  }

  if (error || !vehicle) {
    return (
      <main className="public-page">
        <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(val => !val)} />
        <section className="public-feature">
          <p className="hint-text public-page-alert">
            <CircleAlert size={16} strokeWidth={2.2} />
            <span>{error || 'Vehicle not found'}</span>
          </p>
          <a href="/cars" className="btn btn-secondary" style={{ marginTop: '20px' }}>Back to Fleet</a>
        </section>
      </main>
    )
  }

  const specs = [
    { label: 'Year', value: vehicle.year },
    { label: 'Make', value: vehicle.make },
    { label: 'Model', value: vehicle.model },
    { label: 'Trim', value: vehicle.trim },
    { label: 'Color', value: vehicle.color },
    { label: 'Body Type', value: vehicle.bodyClass },
    { label: 'Transmission', value: vehicle.transmission },
  ].filter(s => s.value !== undefined && s.value !== null)

  return (
    <main className="public-page car-detail-page">
      <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(val => !val)} />

      <section className="car-detail-showcase">
        <div className="car-detail-image-container">
          <PhotoCarousel
            slides={carouselSlides}
            ariaLabel={`${title || 'Vehicle'} photos`}
            emptyLabel="No photos available"
          />
        </div>

        <div className="car-detail-content-wrapper">
          <div className="car-detail-card car-detail-header-card">
            <div className="car-detail-header-box">
              <div className="header-left">
                <h1 className="car-detail-title">{title}</h1>
                {vehicle.trim && <p className="car-detail-subtitle">{vehicle.trim}</p>}
              </div>
              {vehicle.licensePlate && (
                <div className="license-plate-badge">{vehicle.licensePlate}</div>
              )}
            </div>
          </div>

          {vehicle.description && (
            <div className="car-detail-card car-detail-description">
              <h2 className="car-detail-section-title">About this car</h2>
              <p>{vehicle.description}</p>
            </div>
          )}

          {specs.length > 0 && (
            <div className="car-specs-grid">
              {specs.map((spec) => (
                <div key={spec.label} className="car-spec-item">
                  <div className="spec-label">{spec.label}</div>
                  <div className="spec-value">{spec.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="car-detail-cta">
        <a href="/cars" className="btn btn-secondary">Back to Fleet</a>
        {vehicle.turoListingUrl && (
          <a
            href={vehicle.turoListingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-large"
          >
            Visit Us on Turo
          </a>
        )}
      </div>
    </main>
  )
}
