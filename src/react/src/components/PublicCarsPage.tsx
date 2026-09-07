import { useEffect, useMemo, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { api } from '../api'
import type { PublicVehicle } from '../types'
import { PublicSiteHeader } from './PublicSiteHeader'
import { PhotoCarousel } from './PhotoCarousel'
import type { CarouselSlide } from './PhotoCarousel'

type VehiclePhoto = {
  id: string
}

type VehicleWithImage = PublicVehicle & {
  firstImageId?: string
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
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

        // Fetch primary photo for all vehicles in parallel
        const photoResults = await Promise.allSettled(
          rows.map(v => api.get<VehiclePhoto>(`/api/public/vehicles/${v.id}/photos/primary`).catch(() => null))
        )

        // Map primary image for each vehicle
        const vehiclesWithImages: VehicleWithImage[] = rows.map((vehicle, idx) => {
          const photo = photoResults[idx]?.status === 'fulfilled' ? photoResults[idx].value : null
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

  const carouselSlides = useMemo<CarouselSlide[]>(
    () =>
      shuffled(
        vehicles
          .filter((vehicle) => vehicle.firstImageId)
          .map((vehicle) => ({
            key: vehicle.id,
            imageUrl: `/api/public/vehicles/${vehicle.id}/photos/${vehicle.firstImageId}/content`,
            alt: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle',
            href: `/cars/${vehicle.id}`,
            caption: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' '),
          })),
      ),
    [vehicles],
  )

  return (
    <main className="public-page">
      <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} />

      <section className="public-feature public-page-hero">
        <div className="fleet-carousel-wrap">
          <PhotoCarousel
            slides={carouselSlides}
            autoPlayMs={4500}
            ariaLabel="Fleet photo carousel"
            emptyLabel={loading ? 'Loading fleet photos…' : 'Fleet photos coming soon'}
          />
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
