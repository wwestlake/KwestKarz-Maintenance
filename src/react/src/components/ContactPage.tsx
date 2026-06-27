import { useState } from 'react'
import { ExternalLink, LogIn, Mail } from 'lucide-react'
import { PublicSiteHeader } from './PublicSiteHeader'

export function ContactPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main className="public-page">
      <PublicSiteHeader menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((value) => !value)} />

      <section className="public-feature public-contact">
        <div className="public-copy">
          <p className="public-copy-lead">Contact KwestKarz</p>
          <p>
            For bookings and public questions, use the Turo profile. For internal help, use employee login and the
            maintenance app.
          </p>

          <div className="public-contact-links">
            <a
              className="public-contact-link"
              href="https://turo.com/us/en/drivers/45519639"
              target="_blank"
              rel="noreferrer"
            >
              <span className="public-menu-link-icon" aria-hidden="true">
                <ExternalLink size={18} strokeWidth={2.2} />
              </span>
              <span>Open Turo profile</span>
            </a>
            <a className="public-contact-link" href="/employee">
              <span className="public-menu-link-icon" aria-hidden="true">
                <LogIn size={18} strokeWidth={2.2} />
              </span>
              <span>Employee Login</span>
            </a>
            <a className="public-contact-link" href="https://help.turo.com" target="_blank" rel="noreferrer">
              <span className="public-menu-link-icon" aria-hidden="true">
                <Mail size={18} strokeWidth={2.2} />
              </span>
              <span>Help center</span>
            </a>
          </div>
        </div>
      </section>
    </main>
  )
}
