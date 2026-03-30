import { useState, useEffect, useRef } from 'react'
import styles from './ColdStartBanner.module.css'

const COLD_START_THRESHOLD_MS = 3000
const EXPECTED_COLD_START_MS = 50000
const SESSION_KEY = 'steuerpilot_cold_start'

function getStartTime(): number {
  const stored = sessionStorage.getItem(SESSION_KEY)
  if (stored) return Number(stored)
  const now = Date.now()
  sessionStorage.setItem(SESSION_KEY, String(now))
  return now
}

interface ColdStartBannerProps {
  isConnecting: boolean
}

export function ColdStartBanner({ isConnecting }: ColdStartBannerProps) {
  const [showBanner, setShowBanner] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    if (!isConnecting) {
      setShowBanner(false)
      sessionStorage.removeItem(SESSION_KEY)
      return
    }

    startTimeRef.current = getStartTime()
    const elapsed = Date.now() - startTimeRef.current

    if (elapsed >= COLD_START_THRESHOLD_MS) {
      setShowBanner(true)
    }
    setElapsedMs(elapsed)

    const thresholdTimer = elapsed < COLD_START_THRESHOLD_MS
      ? setTimeout(() => setShowBanner(true), COLD_START_THRESHOLD_MS - elapsed)
      : undefined

    const intervalId = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current)
    }, 1000)

    return () => {
      if (thresholdTimer) clearTimeout(thresholdTimer)
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
