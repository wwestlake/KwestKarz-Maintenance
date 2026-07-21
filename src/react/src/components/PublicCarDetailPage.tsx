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
    api.get<PublicVehicle>(`/api/public/vehicles`)
      .then((vehicles: PublicVehicle[]) => {
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

  const handlePrevImage = () => {
    setCurrentImageIndex(prev => (prev - 1 + images.length) % images.length)
  }

  const handleNextImage = () => {
    setCurrentImageIndex(prev => (prev + 1) % images.length)
  }

  return (
    <main className="public-page">
      <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen(val => !val)} />

      <section className="car-detail-hero">
        <div className="car-detail-image-container">
          {hasImages ? (
            <>
              <img
                src={images[currentImageIndex]}
                alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                className="car-detail-image"
              />
              {images.length > 1 && (
                <>
                  <button className="car-detail-nav-btn car-detail-nav-prev" onClick={handlePrevImage}>
                    <ChevronLeft size={24} />
                  </button>
                  <button className="car-detail-nav-btn car-detail-nav-next" onClick={handleNextImage}>
                    <ChevronRight size={24} />
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

        <div className="car-detail-content">
          <div className="car-detail-header">
            <div>
              <h1 className="car-detail-title">
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
              </h1>
              {vehicle.trim && <p className="car-detail-trim">{vehicle.trim}</p>}
            </div>
            {vehicle.licensePlate && <div className="car-detail-plate">{vehicle.licensePlate}</div>}
          </div>

          <div className="car-detail-specs">
            {vehicle.color && (
              <div className="spec-row">
                <span className="spec-label">Exterior Color</span>
                <span className="spec-value">{vehicle.color}</span>
              </div>
            )}
            {vehicle.year && (
              <div className="spec-row">
                <span className="spec-label">Year</span>
                <span className="spec-value">{vehicle.year}</span>
              </div>
            )}
          </div>

          <div className="car-detail-actions">
            <a href="/cars" className="btn btn-secondary">Back to Fleet</a>
            <a
              href="https://turo.com/us/en/host/45519639"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Visit Us on Turo
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
