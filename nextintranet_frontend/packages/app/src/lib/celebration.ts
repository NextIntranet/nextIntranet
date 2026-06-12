const SESSION_COUNT_KEY = "inventory-session-count"
export const CELEBRATION_MILESTONE = 50

export const getInventorySessionCount = (): number => {
  if (typeof window === "undefined") {
    return 0
  }
  const raw = window.sessionStorage.getItem(SESSION_COUNT_KEY)
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

/**
 * Bump the per-browser-session counter of recorded inventories. Returns the
 * new count and whether a celebration milestone (every 50 items) was hit.
 */
export const incrementInventoryCount = (): { count: number; milestone: boolean } => {
  const count = getInventorySessionCount() + 1
  try {
    window.sessionStorage.setItem(SESSION_COUNT_KEY, String(count))
  } catch {
    // Counting is best-effort; never block the inventory flow.
  }
  return { count, milestone: count % CELEBRATION_MILESTONE === 0 }
}

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") {
    return null
  }
  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof window.AudioContext })
      .webkitAudioContext
  if (!Ctx) {
    return null
  }
  try {
    return new Ctx()
  } catch {
    return null
  }
}

export const playAlertTone = () => {
  const context = getAudioContext()
  if (!context) {
    return
  }
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = "triangle"
  oscillator.frequency.value = 880
  gain.gain.value = 0.08
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.25)
  oscillator.stop(context.currentTime + 0.27)
  oscillator.onended = () => {
    context.close()
  }
}

export const playSuccessTone = () => {
  const context = getAudioContext()
  if (!context) {
    return
  }
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = "sine"
  oscillator.frequency.setValueAtTime(660, context.currentTime)
  oscillator.frequency.setValueAtTime(990, context.currentTime + 0.12)
  gain.gain.value = 0.08
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3)
  oscillator.stop(context.currentTime + 0.32)
  oscillator.onended = () => {
    context.close()
  }
}

/** Short ascending fanfare for celebration milestones (C5-E5-G5-C6 + chord). */
export const playFanfare = () => {
  const context = getAudioContext()
  if (!context) {
    return
  }
  const master = context.createGain()
  master.gain.value = 0.12
  master.connect(context.destination)

  const note = (frequency: number, start: number, duration: number) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "triangle"
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, context.currentTime + start)
    gain.gain.exponentialRampToValueAtTime(1, context.currentTime + start + 0.02)
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + start + duration,
    )
    oscillator.connect(gain)
    gain.connect(master)
    oscillator.start(context.currentTime + start)
    oscillator.stop(context.currentTime + start + duration + 0.05)
  }

  // C5, E5, G5 run + closing C6 major chord.
  note(523.25, 0, 0.18)
  note(659.25, 0.14, 0.18)
  note(783.99, 0.28, 0.18)
  note(1046.5, 0.42, 0.6)
  note(659.25, 0.42, 0.6)
  note(783.99, 0.42, 0.6)

  window.setTimeout(() => {
    context.close()
  }, 1400)
}
