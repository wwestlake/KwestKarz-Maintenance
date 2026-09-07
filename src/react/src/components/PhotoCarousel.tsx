import { useEffect, useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type CarouselSlide = {
  key: string
  imageUrl: string
  alt: string
  href?: string
  caption?: string
}

type Props = {
  slides: CarouselSlide[]
  autoPlayMs?: number
  ariaLabel: string
  emptyLabel?: string
}

export function PhotoCarousel({ slides, autoPlayMs, ariaLabel, emptyLabel }: Props) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!autoPlayMs || slides.length < 2 || paused || interacting || reducedMotion) return
    const id = setInterval(() => setIndex((current) => (current + 1) % slides.length), autoPlayMs)
    return () => clearInterval(id)
  }, [autoPlayMs, slides.length, paused, interacting, reducedMotion])

  if (slides.length === 0) {
    return <div className="photo-carousel-empty">{emptyLabel ?? 'No photos available'}</div>
  }

  const activeIndex = index % slides.length
  const goTo = (next: number) => { setPaused(true); setIndex(((next % slides.length) + slides.length) % slides.length) }
  const showPrev = () => goTo(activeIndex - 1)
  const showNext = () => goTo(activeIndex + 1)

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current == null) return
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current
    const delta = endX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(delta) < 40) return
    if (delta > 0) showPrev()
    else showNext()
  }

  const active = slides[activeIndex]
  const image = <img className="photo-carousel-image" src={active.imageUrl} alt={active.alt} />

  return (
    <div className="photo-carousel" role="region" aria-roledescription="carousel" aria-label={ariaLabel}
      onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setPaused(true)}>
      <div className="photo-carousel-viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {active.href ? (
          <a className="photo-carousel-slide-link" href={active.href}>
            {image}
          </a>
        ) : (
          image
        )}

        {active.caption && <div className="photo-carousel-caption">{active.caption}</div>}

        {slides.length > 1 && (
          <>
            <button
              type="button"
              className="photo-carousel-nav photo-carousel-nav-prev"
              onClick={showPrev}
              aria-label="Previous photo"
            >
              <ChevronLeft size={24} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="photo-carousel-nav photo-carousel-nav-next"
              onClick={showNext}
              aria-label="Next photo"
            >
              <ChevronRight size={24} strokeWidth={2.4} />
            </button>
          </>
        )}
      </div>

      {autoPlayMs && slides.length > 1 && !reducedMotion && (
        <button type="button" className="photo-carousel-pause" onClick={() => setPaused(value => !value)}>
          {paused ? 'Play slideshow' : 'Pause slideshow'}
        </button>
      )}

      {slides.length > 1 && (
        <div className="photo-carousel-dots">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.key}
              type="button"
              className={`photo-carousel-dot${slideIndex === activeIndex ? ' is-active' : ''}`}
              aria-current={slideIndex === activeIndex ? 'true' : undefined}
              onClick={() => goTo(slideIndex)}
              aria-label={`Show photo ${slideIndex + 1} of ${slides.length}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
