import { useEffect, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { api } from '../api'
import type { PublicVehicle, DocumentRecord } from '../types'
import carHeroAsset from '../assets/kwestkarz-hero-car.jpg'
import { PublicSiteHeader } from './PublicSiteHeader'

type VehicleWithImage = PublicVehicle & {
  firstImageId?: string
}

export function PublicCarsPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [vehicles, setVehicles] = useState<VehicleWithImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const rows = await api.get<PublicVehicle[]>('/api/public/vehicles')

        // Fetch photos for all vehicles in parallel
        const photosResults = await Promise.allSettled(
          rows.map(v => api.get<any[]>(`/api/public/vehicles/${v.id}/photos/primary`).catch(() => null))
        )

        // Map first image for each vehicle
        const vehiclesWithImages: VehicleWithImage[] = rows.map((vehicle, idx) => {
          const photo = photosResults[idx]?.status === 'fulfilled' ? photosResults[idx].value : null
          return {
            ...vehicle,
            firstImageId: photo?.id
          }
        })

        setVehicles(vehiclesWithImages)
      } catch {
        setError('Could not load the public fleet right now.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <main className="public-page">
      <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} />

      <section className="public-feature public-page-hero">
        <div className="public-hero-image-wrap public-hero-image-wrap--tall">
          <img className="public-hero-image" src={carHeroAsset} alt="KwestKarz vehicle" />
        </div>

        <div className="public-copy">
          <p className="public-copy-lead">Our Cars</p>
          <p>
            This is the fleet showcase for KwestKarz. Each car gets a clean presentation here so guests can browse
            what we have available before booking.
          </p>
        </div>

        {loading && <p className="hint-text">Loading fleet...</p>}
        {error && (
          <p className="hint-text public-page-alert">
            <CircleAlert size={16} strokeWidth={2.2} />
            <span>{error}</span>
          </p>
        )}

        <div className="fleet-grid">
          {vehicles.map((vehicle) => (
            <article key={vehicle.id} className="fleet-card">
              {vehicle.firstImageId && (
                <div className="fleet-card-image">
                  <img
                    src={`/api/public/vehicles/${vehicle.id}/photos/${vehicle.firstImageId}/content`}
                    alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                  />
                </div>
              )}
              <div className="fleet-card-content">
                <div className="fleet-card-header">
                  <div>
                    <h3 className="fleet-card-title">
                      {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
                    </h3>
                    {vehicle.color && <p className="fleet-card-color">{vehicle.color}</p>}
                  </div>
                  <div className="fleet-card-plate">{vehicle.licensePlate || '—'}</div>
                </div>

                {vehicle.trim && <p className="fleet-card-trim">{vehicle.trim}</p>}

                <div className="fleet-card-actions">
                  <a href={`/cars/${vehicle.id}`} className="btn btn-primary">
                    Details
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>

        {!loading && vehicles.length === 0 && !error && <p className="hint-text">Fleet showcase will appear here soon.</p>}
      </section>
    </main>
  )
}
