import { MoonStar, SunMedium } from 'lucide-react'
import { useTheme } from '../ThemeContext'

type ThemeToggleProps = {
  className?: string
}

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      className={`theme-toggle ${className}`.trim()}
      type="button"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggleTheme}
    >
      {isDark ? <SunMedium size={18} strokeWidth={2.2} /> : <MoonStar size={18} strokeWidth={2.2} />}
      <span>{isDark ? 'Light' : 'Dark'}</span>
    </button>
  )
}
