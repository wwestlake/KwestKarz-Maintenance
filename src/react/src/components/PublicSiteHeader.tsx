import type { ReactNode } from 'react'
import { CarFront, CircleHelp, Info, LogIn, Mail } from 'lucide-react'
import logoAsset from '../assets/kwestkarz-logo.jpg'
import { ThemeToggle } from './ThemeToggle'

type PublicSiteHeaderProps = {
  menuOpen: boolean
  onToggleMenu: () => void
}

type PublicMenuItem = {
  href: string
  label: string
  icon: ReactNode
  external?: boolean
}

const publicMenuItems: PublicMenuItem[] = [
  {
    href: '/cars',
    label: 'Our Cars',
    icon: <CarFront size={18} strokeWidth={2.2} />,
  },
  {
    href: '/about-turo',
    label: 'About Turo',
    icon: <Info size={18} strokeWidth={2.2} />,
  },
  {
    href: '/help',
    label: 'Help',
    icon: <CircleHelp size={18} strokeWidth={2.2} />,
  },
  {
    href: '/contact',
    label: 'Contact Us',
    icon: <Mail size={18} strokeWidth={2.2} />,
  },
]

export function PublicSiteHeader({ menuOpen, onToggleMenu }: PublicSiteHeaderProps) {
  return (
    <header className="public-topbar">
      <div className="public-topbar-left">
        <button
          className="public-menu-toggle"
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          aria-controls="public-mobile-menu"
          onClick={onToggleMenu}
        >
          <span className="public-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <a className="public-brand-link" href="/" aria-label="KwestKarz home">
          <img className="public-logo" src={logoAsset} alt="KwestKarz" />
        </a>
      </div>

      <div className="public-topbar-actions">
        <ThemeToggle />
      </div>

      <nav className="public-desktop-nav" aria-label="Primary">
        {publicMenuItems.map((item) => (
          <a
            key={item.href}
            className="public-menu-link"
            href={item.href}
          >
            <span className="public-menu-link-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </a>
        ))}
        <span className="public-menu-divider" aria-hidden="true" />
        <a className="public-menu-link" href="/employee">
          <span className="public-menu-link-icon" aria-hidden="true">
            <LogIn size={18} strokeWidth={2.2} />
          </span>
          <span>Employee Login</span>
        </a>
      </nav>

      <nav
        id="public-mobile-menu"
        className={`public-mobile-nav${menuOpen ? ' is-open' : ''}`}
        aria-label="Mobile"
      >
        <ul className="public-menu-list">
          {publicMenuItems.map((item) => (
            <li key={item.href} className="public-menu-item">
              <a
                className="public-menu-link"
                href={item.href}
              >
                <span className="public-menu-link-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </a>
            </li>
          ))}
          <li className="public-menu-divider-row" aria-hidden="true">
            <span className="public-menu-divider" />
          </li>
          <li className="public-menu-item">
            <a className="public-menu-link" href="/employee">
              <span className="public-menu-link-icon" aria-hidden="true">
                <LogIn size={18} strokeWidth={2.2} />
              </span>
              <span>Employee Login</span>
            </a>
          </li>
        </ul>
      </nav>
    </header>
  )
}
