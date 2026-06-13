const SESSION_COUNT_KEY = "inventory-session-count"
const SESSION_NEXT_MILESTONE_KEY = "inventory-next-milestone"

export const getInventorySessionCount = (): number => {
  if (typeof window === "undefined") {
    return 0
  }
  const raw = window.sessionStorage.getItem(SESSION_COUNT_KEY)
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

const getNextMilestone = (): number => {
  const raw = window.sessionStorage.getItem(SESSION_NEXT_MILESTONE_KEY)
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

const scheduleNextMilestone = (afterCount: number) => {
  const gap = 15 + Math.floor(Math.random() * 26) // 15–40
  try {
    window.sessionStorage.setItem(SESSION_NEXT_MILESTONE_KEY, String(afterCount + gap))
  } catch {
    // best-effort
  }
}

/**
 * Bump the per-browser-session counter of recorded inventories. Returns the
 * new count and whether a celebration milestone was hit. Milestones fire at
 * random intervals of 15–40 scans.
 */
export const incrementInventoryCount = (): { count: number; milestone: boolean } => {
  const count = getInventorySessionCount() + 1
  try {
    window.sessionStorage.setItem(SESSION_COUNT_KEY, String(count))
  } catch {
    // Counting is best-effort; never block the inventory flow.
  }

  const nextMilestone = getNextMilestone()
  if (nextMilestone === 0) {
    // First scan — pick the first milestone.
    scheduleNextMilestone(count)
    return { count, milestone: false }
  }

  if (count >= nextMilestone) {
    scheduleNextMilestone(count)
    return { count, milestone: true }
  }

  return { count, milestone: false }
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

/** Full ascending fanfare: C5-E5-G5 run, held C6 major chord + bass, then a triumphant sting. */
export const playFanfare = () => {
  const context = getAudioContext()
  if (!context) {
    return
  }
  const master = context.createGain()
  master.gain.value = 0.22
  master.connect(context.destination)

  const note = (
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType = "triangle",
    gainScale = 1,
  ) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = type
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, context.currentTime + start)
    gain.gain.exponentialRampToValueAtTime(gainScale, context.currentTime + start + 0.02)
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + start + duration,
    )
    oscillator.connect(gain)
    gain.connect(master)
    oscillator.start(context.currentTime + start)
    oscillator.stop(context.currentTime + start + duration + 0.05)
  }

  // Rising run: C5 → E5 → G5
  note(523.25, 0, 0.16)
  note(659.25, 0.13, 0.16)
  note(783.99, 0.26, 0.16)

  // Held C6 major chord
  note(1046.5, 0.40, 0.7)
  note(783.99, 0.40, 0.7)
  note(659.25, 0.40, 0.7)

  // Bass punch
  note(130.81, 0.40, 0.4, "sine", 0.8)

  // Triumphant sting (E6 flash)
  note(1318.5, 0.48, 0.25, "sine", 0.6)

  // Resolution chord
  note(1046.5, 1.15, 0.55)
  note(830.61, 1.15, 0.55)
  note(659.25, 1.15, 0.55)
  note(523.25, 1.15, 0.55)

  window.setTimeout(() => {
    context.close()
  }, 2200)
}
