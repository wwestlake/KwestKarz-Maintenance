import { useState } from 'react'
import carHeroAsset from '../assets/kwestkarz-hero-car.jpg'
import qrAsset from '../assets/kwestkarz-qr.jpg'
import { PublicSiteHeader } from './PublicSiteHeader'

export function PublicLandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main className="public-page">
      <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} />

      <div className="public-cache-test-banner">
        <strong>Build marker:</strong> the latest root page is live.
        <span> Refresh this page and you should still see this message.</span>
      </div>

      <section className="public-feature">
        <div className="public-hero-image-wrap">
          <img className="public-hero-image" src={carHeroAsset} alt="KwestKarz vehicle" />
          <img className="public-hero-qr" src={qrAsset} alt="Scan to open the Turo profile" />
        </div>

        <div className="public-copy">
          <a
            className="public-copy-lead public-copy-lead-link"
            href="https://turo.com/us/en/drivers/45519639"
            target="_blank"
            rel="noreferrer"
          >
            Check out my cars on Turo and grab the keys for your next trip.
          </a>
          <p>
            KwestKarz keeps a clean, ready-to-book fleet with quick turnarounds, clear handoffs, and straightforward
            booking. The focus is simple: solid cars, simple access, and a better trip for the guest.
          </p>
          <p>
            Scan the code or open the profile to see current availability. If you’re on the team, use employee login
            to open the maintenance app.
          </p>
          <p>
            We keep the process tight behind the scenes so the public side stays easy to use and the internal side
            stays organized.
          </p>
        </div>
      </section>
    </main>
  )
}
