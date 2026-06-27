import { useState } from 'react'
import { Info, ShieldCheck, Users, Wallet } from 'lucide-react'
import { PublicSiteHeader } from './PublicSiteHeader'

export function PublicAboutTuroPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main className="public-page">
      <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} />

      <section className="public-feature public-page-text">
        <div className="public-copy">
          <p className="public-copy-lead">About Turo</p>
          <p>
            Turo is the marketplace that helps guests find and book cars from real hosts. We’ll use this page to
            explain the booking flow in plain language.
          </p>

          <div className="public-info-grid">
            <article className="public-info-card">
              <Info size={18} strokeWidth={2.2} />
              <strong>What it is</strong>
              <p>A simple way to reserve a car without the usual rental counter feel.</p>
            </article>
            <article className="public-info-card">
              <Users size={18} strokeWidth={2.2} />
              <strong>How it works</strong>
              <p>Guests choose a car, book their dates, and follow the pickup instructions from the host.</p>
            </article>
            <article className="public-info-card">
              <ShieldCheck size={18} strokeWidth={2.2} />
              <strong>Why it helps</strong>
              <p>It gives a clear booking experience while letting us manage the fleet the way we want.</p>
            </article>
            <article className="public-info-card">
              <Wallet size={18} strokeWidth={2.2} />
              <strong>What’s next</strong>
              <p>We’ll add our own links and booking details once the public pages are fully fleshed out.</p>
            </article>
          </div>
        </div>
      </section>
    </main>
  )
}
