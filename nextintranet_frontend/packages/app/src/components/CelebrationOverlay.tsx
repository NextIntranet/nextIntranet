import { useEffect, useRef } from "react"

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#eab308"]
const PARTICLES_PER_BURST = 80
const DURATION_MS = 2600

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  rotationSpeed: number
  shape: "rect" | "circle"
}

const spawnBurst = (height: number, originX: number): Particle[] =>
  Array.from({ length: PARTICLES_PER_BURST }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 2)
    const speed = 9 + Math.random() * 9
    return {
      x: originX,
      y: height + 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 5 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.4,
      shape: Math.random() > 0.5 ? "rect" : "circle",
    }
  })

interface CelebrationOverlayProps {
  /** Increment to fire a confetti burst; 0 renders nothing. */
  trigger: number
}

export function CelebrationOverlay({ trigger }: CelebrationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!trigger) {
      return
    }
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) {
      return
    }
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const particles = [
      ...spawnBurst(canvas.height, canvas.width * 0.2),
      ...spawnBurst(canvas.height, canvas.width * 0.5),
      ...spawnBurst(canvas.height, canvas.width * 0.8),
    ]
    const startedAt = performance.now()
    let frame = 0

    const tick = (now: number) => {
      const elapsed = now - startedAt
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (elapsed > DURATION_MS) {
        return
      }
      const fade = elapsed > DURATION_MS - 600 ? (DURATION_MS - elapsed) / 600 : 1
      for (const particle of particles) {
        particle.x += particle.vx
        particle.y += particle.vy
        particle.vy += 0.35
        particle.vx *= 0.99
        particle.rotation += particle.rotationSpeed
        context.save()
        context.globalAlpha = Math.max(0, fade)
        context.translate(particle.x, particle.y)
        context.rotate(particle.rotation)
        context.fillStyle = particle.color
        if (particle.shape === "rect") {
          context.fillRect(
            -particle.size / 2,
            -particle.size / 4,
            particle.size,
            particle.size / 2,
          )
        } else {
          context.beginPath()
          context.arc(0, 0, particle.size / 2.5, 0, Math.PI * 2)
          context.fill()
        }
        context.restore()
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      context.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [trigger])

  if (!trigger) {
    return null
  }

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-50"
      aria-hidden="true"
    />
  )
}
