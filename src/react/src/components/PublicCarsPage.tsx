import { useEffect, useState } from 'react'
import { CarFront, CircleAlert } from 'lucide-react'
import { api } from '../api'
import type { PublicVehicle } from '../types'
import carHeroAsset from '../assets/kwestkarz-hero-car.jpg'
import { PublicSiteHeader } from './PublicSiteHeader'

export function PublicCarsPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [vehicles, setVehicles] = useState<PublicVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<PublicVehicle[]>('/api/public/vehicles')
      .then((rows) => setVehicles(rows))
      .catch(() => setError('Could not load the public fleet right now.'))
      .finally(() => setLoading(false))
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

        <div className="public-cars-grid">
          {vehicles.map((vehicle) => (
            <article key={vehicle.id} className="public-car-card">
              <div className="public-car-card-top">
                <CarFront size={18} strokeWidth={2.2} />
                <span>{vehicle.status}</span>
              </div>
              <strong>
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
              </strong>
              <p>{vehicle.trim || 'Trim not set'}</p>
              <p>{vehicle.color ? `${vehicle.color} exterior` : 'Color not listed'}</p>
              <p className="hint-text">Turo link coming soon.</p>
            </article>
          ))}
        </div>

        {!loading && vehicles.length === 0 && !error && <p className="hint-text">Fleet showcase will appear here soon.</p>}
      </section>
    </main>
  )
}
