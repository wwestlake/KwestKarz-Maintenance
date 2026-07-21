import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleAlert } from 'lucide-react'
import { api } from '../api'
import type { PublicVehicle } from '../types'
import { PublicSiteHeader } from './PublicSiteHeader'

export function PublicCarDetailPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [vehicle, setVehicle] = useState<PublicVehicle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const vehicleId = window.location.pathname.split('/cars/')[1]

  useEffect(() => {
    api.get<PublicVehicle[]>(`/api/public/vehicles`)
      .then((vehicles) => {
        const found = vehicles.find(v => v.id === vehicleId)
        if (found) {
          setVehicle(found)
        } else {
          setError('Vehicle not found')
        }
      })
      .catch(() => setError('Could not load vehicle details'))
      .finally(() => setLoading(false))
  }, [vehicleId])

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

  const images = vehicle.primaryImageUrl ? [vehicle.primaryImageUrl] : []
  const hasImages = images.length > 0
  const title = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')

  const handlePrevImage = () => {
    setCurrentImageIndex(prev => (prev - 1 + images.length) % images.length)
  }

  const handleNextImage = () => {
    setCurrentImageIndex(prev => (prev + 1) % images.length)
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
        {/* Hero Image */}
        <div className="car-detail-hero-section">
          <div className="car-detail-image-container">
            {hasImages ? (
              <>
                <img
                  src={images[currentImageIndex]}
                  alt={title}
                  className="car-detail-image"
                />
                {images.length > 1 && (
                  <>
                    <button className="car-detail-nav-btn car-detail-nav-prev" onClick={handlePrevImage}>
                      <ChevronLeft size={28} />
                    </button>
                    <button className="car-detail-nav-btn car-detail-nav-next" onClick={handleNextImage}>
                      <ChevronRight size={28} />
                    </button>
                    <div className="car-detail-image-counter">
                      {currentImageIndex + 1} / {images.length}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="car-detail-image-placeholder">No image available</div>
            )}
          </div>
        </div>

        {/* Vehicle Header */}
        <div className="car-detail-content-wrapper">
          <div className="car-detail-header-box">
            <div className="header-left">
              <h1 className="car-detail-title">{title}</h1>
              {vehicle.trim && <p className="car-detail-subtitle">{vehicle.trim}</p>}
            </div>
            {vehicle.licensePlate && (
              <div className="license-plate-badge">{vehicle.licensePlate}</div>
            )}
          </div>

          {/* Specs Grid */}
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

          {/* CTA Buttons */}
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
        </div>
      </section>
    </main>
  )
}
