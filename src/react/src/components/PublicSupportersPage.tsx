import { useState } from 'react'
import { HeartHandshake, Share2, Users, ExternalLink } from 'lucide-react'
import carHeroAsset from '../assets/kwestkarz-hero-car.jpg'
import { PublicSiteHeader } from './PublicSiteHeader'

export function PublicSupportersPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main className="public-page">
      <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} />

      <section className="public-feature public-page-hero">
        <div className="public-hero-image-wrap public-hero-image-wrap--tall">
          <img className="public-hero-image" src={carHeroAsset} alt="KwestKarz vehicle" />
        </div>

        <div className="public-copy">
          <p className="public-copy-lead">Supporters</p>
          <p>
            This page is for the people who help KwestKarz stay visible, organized, and easy to book. It keeps the
            public side simple while giving supporters a clear place to start.
          </p>

          <div className="public-actions">
            <a
              className="public-primary-link"
              href="https://turo.com/us/en/drivers/45519639"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} strokeWidth={2.2} />
              Open the Turo profile
            </a>
            <a className="public-secondary-link" href="/cars">
              <Users size={16} strokeWidth={2.2} />
              Browse our cars
            </a>
            <a className="public-secondary-link" href="/contact">
              <HeartHandshake size={16} strokeWidth={2.2} />
              Contact the team
            </a>
          </div>

          <div className="public-info-grid">
            <article className="public-info-card">
              <HeartHandshake size={18} strokeWidth={2.2} />
              <strong>Stay connected</strong>
              <p>Use this page to keep up with the fleet and share the public entry point with others.</p>
            </article>
            <article className="public-info-card">
              <Share2 size={18} strokeWidth={2.2} />
              <strong>Share the page</strong>
              <p>Everything important is grouped here so it is easy to pass along without digging through menus.</p>
            </article>
          </div>
        </div>
      </section>
    </main>
  )
}
