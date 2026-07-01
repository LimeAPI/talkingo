"use client"

import { useEffect, useRef } from "react"
import { cn } from "@talkingo/shared/utils"

/* ─── Starfield Background Canvas ─────────────────────────────────────────── */
export function Starfield({ className, density = 120 }: { className?: string; density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
    }
    resize()
    window.addEventListener("resize", resize)

    const stars: { x: number; y: number; r: number; alpha: number; speed: number }[] = []
    for (let i = 0; i < density; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.2 + 0.2,
        alpha: Math.random(),
        speed: Math.random() * 0.003 + 0.001,
      })
    }

    let anim: number
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      stars.forEach((star) => {
        star.alpha += star.speed
        const opacity = 0.3 + Math.abs(Math.sin(star.alpha)) * 0.7
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.8})`
        ctx.fill()
      })
      anim = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(anim)
      window.removeEventListener("resize", resize)
    }
  }, [density])

  return (
    <canvas
      ref={canvasRef}
      className={cn("absolute inset-0 w-full h-full pointer-events-none", className)}
      aria-hidden="true"
    />
  )
}
