import { useState, useEffect } from 'react'
import styles from './ColdStartBanner.module.css'

const COLD_START_THRESHOLD_MS = 3000
const EXPECTED_COLD_START_MS = 50000

interface ColdStartBannerProps {
  isConnecting: boolean
}

export function ColdStartBanner({ isConnecting }: ColdStartBannerProps) {
  const [showBanner, setShowBanner] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isConnecting) {
      setShowBanner(false)
      setElapsedMs(0)
      return
    }

    const thresholdTimer = setTimeout(() => {
      setShowBanner(true)
    }, COLD_START_THRESHOLD_MS)

    const intervalId = setInterval(() => {
      setElapsedMs((prev) => prev + 1000)
    }, 1000)

    return () => {
      clearTimeout(thresholdTimer)
      clearInterval(intervalId)
    }
  }, [isConnecting])

  if (!showBanner || dismissed) return null

  const progressPercent = Math.min(
    95,
    (elapsedMs / EXPECTED_COLD_START_MS) * 100,
  )
  const elapsedSeconds = Math.floor(elapsedMs / 1000)

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <div className={styles.inner}>
        <div className={styles.headerRow}>
          <div className={styles.dot} />
          <span className={styles.title}>Server wird gestartet</span>
          <button
            className={styles.dismiss}
            onClick={() => setDismissed(true)}
            aria-label="Hinweis schließen"
          >
            &times;
          </button>
        </div>
        <p className={styles.message}>
          Der kostenlose Server benötigt beim ersten Aufruf ca. 30–60 Sekunden
          zum Aufwachen. Bitte einen Moment Geduld.
        </p>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressBar}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className={styles.timer}>{elapsedSeconds}s</span>
      </div>
    </div>
  )
}
