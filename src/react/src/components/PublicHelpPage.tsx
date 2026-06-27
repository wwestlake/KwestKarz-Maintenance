import { useState } from 'react'
import { HelpCircle, PhoneCall, ClipboardList, Clock3 } from 'lucide-react'
import { PublicSiteHeader } from './PublicSiteHeader'

export function PublicHelpPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main className="public-page">
      <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} />

      <section className="public-feature public-page-text">
        <div className="public-copy">
          <p className="public-copy-lead">Help</p>
          <p>
            This page will collect the common questions guests and staff ask most often, with answers that stay short
            and useful.
          </p>

          <div className="public-info-grid">
            <article className="public-info-card">
              <HelpCircle size={18} strokeWidth={2.2} />
              <strong>Booking help</strong>
              <p>We’ll explain what to expect when reserving a car and how to get ready for pickup.</p>
            </article>
            <article className="public-info-card">
              <ClipboardList size={18} strokeWidth={2.2} />
              <strong>Pickup and return</strong>
              <p>We’ll cover check-in, handoff, and the return process so it stays predictable.</p>
            </article>
            <article className="public-info-card">
              <Clock3 size={18} strokeWidth={2.2} />
              <strong>Timing and changes</strong>
              <p>We’ll add guidance for late arrivals, reschedules, and trip changes here.</p>
            </article>
            <article className="public-info-card">
              <PhoneCall size={18} strokeWidth={2.2} />
              <strong>Contact path</strong>
              <p>Employee login stays in the menu for the team, and contact details can grow from there later.</p>
            </article>
          </div>
        </div>
      </section>
    </main>
  )
}
