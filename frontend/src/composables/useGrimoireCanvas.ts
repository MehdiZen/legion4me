import { watch, onUnmounted, type Ref, type ComputedRef } from 'vue'

interface Dragon    { x: number; y: number; dir: number; speed: number; wingPhase: number; size: number }
interface Fireball  { x: number; y: number; vx: number; vy: number; life: number; size: number }
interface WizardState { x: number; y: number; casting: boolean; spellTimer: number }

export function useGrimoireCanvas(
  canvasRef: Ref<HTMLCanvasElement | null>,
  isActive: ComputedRef<boolean>,
) {
  let raf:            number | null = null
  let dragonInterval: ReturnType<typeof setInterval> | null = null
  let castInterval:   ReturnType<typeof setInterval> | null = null
  let resizeHandler:  (() => void) | null = null

  const state: { dragons: Dragon[]; fireballs: Fireball[]; wizard: WizardState; t: number } = {
    dragons: [],
    fireballs: [],
    wizard: { x: 0, y: 0, casting: false, spellTimer: 0 },
    t: 0,
  }

  function spawnDragon(canvas: HTMLCanvasElement) {
    const fromLeft = Math.random() > 0.5
    state.dragons.push({
      x: fromLeft ? -80 : canvas.width + 80,
      y: canvas.height * 0.15 + Math.random() * canvas.height * 0.35,
      dir: fromLeft ? 1 : -1,
      speed: 0.9 + Math.random() * 0.6,
      wingPhase: Math.random() * Math.PI * 2,
      size: 1.4 + Math.random() * 0.8,
    })
  }

  function spawnFireball(fromX: number, fromY: number) {
    state.fireballs.push({
      x: fromX, y: fromY,
      vx: (Math.random() - 0.5) * 3 - 2,
      vy: -2 - Math.random() * 2,
      life: 1,
      size: 6 + Math.random() * 5,
    })
  }

  function drawPixelDragon(
    ctx: CanvasRenderingContext2D, x: number, y: number,
    dir: number, wing: number, size: number,
  ) {
    const px = 3 * size
    ctx.save()
    ctx.translate(x, y)
    if (dir < 0) ctx.scale(-1, 1)

    const body:     [number, number][] = [[2,2],[2,3],[3,2],[3,3],[4,2],[4,3],[5,2],[5,3],[6,2],[6,3]]
    const head:     [number, number][] = [[7,1],[7,2],[7,3],[8,1],[8,2],[8,3],[9,2]]
    const tail:     [number, number][] = [[0,3],[1,3],[1,2]]
    const wingUp:   [number, number][] = [
      [2,-3],[3,-3],[4,-3],[5,-3],[6,-3],
      [2,-2],[3,-2],[4,-2],[5,-2],
      [3,-1],[4,-1],[5,-1],
      [3, 0],[4, 0],
    ]
    const wingDown: [number, number][] = [
      [2, 4],[3, 4],[4, 4],[5, 4],[6, 4],
      [2, 5],[3, 5],[4, 5],[5, 5],
      [3, 6],[4, 6],[5, 6],
      [3, 7],[4, 7],
    ]

    const wFrame = Math.floor((wing / (Math.PI * 2)) * 4) % 2
    const wingPixels = wFrame === 0 ? wingUp : wingDown

    ctx.fillStyle = '#5a2a80'
    for (const [px2, py] of [...body, ...head, ...tail, ...wingPixels]) {
      ctx.fillRect(px2 * px, py * px, px, px)
    }
    ctx.fillStyle = '#e8c978'
    ctx.fillRect(8 * px, 1 * px, px, px)

    if (Math.random() > 0.7) {
      const fireColors = ['#ff6600', '#ffaa00', '#ffee00']
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = fireColors[i]
        ctx.fillRect((10 + i) * px + Math.random() * px * 0.5, 1 * px + Math.random() * px, px, px)
      }
    }
    ctx.restore()
  }

  function drawWizard(ctx: CanvasRenderingContext2D, x: number, y: number, casting: boolean) {
    const px = 4
    ctx.save()
    ctx.translate(x, y)

    const robe: [number, number][] = [[1,6],[2,5],[2,6],[2,7],[3,4],[3,5],[3,6],[3,7],[4,4],[4,5],[4,6],[4,7],[5,5],[5,6],[5,7],[1,7]]
    ctx.fillStyle = '#3a1a60'
    for (const [px2, py] of robe) ctx.fillRect(px2 * px, py * px, px, px)

    ctx.fillStyle = '#2a1045'
    const hat: [number, number][] = [[2,2],[3,1],[3,2],[3,3],[4,2],[4,3],[2,3],[4,1],[1,4],[2,4],[3,4],[4,4],[5,4]]
    for (const [a, b] of hat) ctx.fillRect(a * px, b * px, px, px)

    ctx.fillStyle = '#c9a87c'
    for (const [a, b] of [[3,5],[4,5]] as [number,number][]) ctx.fillRect(a * px, b * px, px, px)

    ctx.fillStyle = '#e8c978'
    ctx.fillRect(3 * px, 1 * px, px, px)

    ctx.fillStyle = '#7c5cbf'
    for (const [a, b] of [[6,2],[6,3],[6,4],[6,5],[6,6],[6,7]] as [number,number][]) ctx.fillRect(a * px, b * px, px, px)

    if (casting) {
      ctx.fillStyle = '#c084fc'
      ctx.fillRect(6 * px, 1 * px, px, px)
      ctx.fillRect(7 * px, 1 * px, px, px)
      ctx.fillStyle = 'rgba(192,132,252,0.7)'
      for (let i = 0; i < 4; i++) {
        ctx.fillRect((7 + Math.floor(Math.random() * 3)) * px, Math.floor(Math.random() * 3) * px, px, px)
      }
    } else {
      ctx.fillStyle = '#a78bfa'
      ctx.fillRect(6 * px, 1 * px, px, px)
    }
    ctx.restore()
  }

  function stop() {
    if (raf !== null)            { cancelAnimationFrame(raf); raf = null }
    if (dragonInterval !== null) { clearInterval(dragonInterval); dragonInterval = null }
    if (castInterval !== null)   { clearInterval(castInterval);   castInterval = null }
    if (resizeHandler !== null)  { window.removeEventListener('resize', resizeHandler); resizeHandler = null }
    state.dragons   = []
    state.fireballs = []
  }

  function start() {
    stop()
    const maybeCanvas = canvasRef.value
    if (!maybeCanvas) return
    const canvas: HTMLCanvasElement = maybeCanvas

    const ctx = canvas.getContext('2d')!

    resizeHandler = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    resizeHandler()
    window.addEventListener('resize', resizeHandler)

    state.wizard = { x: canvas.width - 90, y: canvas.height - 110, casting: false, spellTimer: 0 }

    setTimeout(() => { if (isActive.value) spawnDragon(canvas) }, 1200)
    dragonInterval = setInterval(() => spawnDragon(canvas), 12000 + Math.random() * 8000)
    castInterval = setInterval(() => {
      state.wizard.casting = true
      setTimeout(() => { state.wizard.casting = false }, 1600)
    }, 5000)

    function draw() {
      if (!isActive.value) {
        raf = null
        return
      }
      state.t += 0.016
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (let i = state.dragons.length - 1; i >= 0; i--) {
        const d = state.dragons[i]
        d.x += d.speed * d.dir
        d.wingPhase += 0.12
        drawPixelDragon(ctx, d.x, d.y, d.dir, d.wingPhase, d.size)
        if (d.x > canvas.width + 120 || d.x < -120) state.dragons.splice(i, 1)
      }

      for (let i = state.fireballs.length - 1; i >= 0; i--) {
        const f = state.fireballs[i]
        f.x += f.vx; f.y += f.vy; f.vy += 0.12; f.life -= 0.025
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * f.life * 2)
        g.addColorStop(0, `rgba(255,220,50,${f.life})`)
        g.addColorStop(0.5, `rgba(255,100,0,${f.life * 0.8})`)
        g.addColorStop(1, 'rgba(255,50,0,0)')
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.size * f.life * 2, 0, Math.PI * 2)
        ctx.fillStyle = g
        ctx.fill()
        if (f.life <= 0) state.fireballs.splice(i, 1)
      }

      if (state.wizard.casting && Math.random() < 0.15) {
        spawnFireball(state.wizard.x + 24, state.wizard.y + 8)
      }

      drawWizard(ctx, canvas.width - 120, canvas.height - 130, state.wizard.casting)

      if (state.wizard.casting) {
        state.wizard.spellTimer += 0.06
        ctx.save()
        ctx.translate(canvas.width - 100, canvas.height - 100)
        ctx.strokeStyle = `rgba(192,132,252,${0.4 + 0.2 * Math.sin(state.wizard.spellTimer)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(0, 0, 25 + 5 * Math.sin(state.wizard.spellTimer * 2), 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, 0, 38, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      } else {
        state.wizard.spellTimer = 0
      }

      raf = requestAnimationFrame(draw)
    }
    draw()
  }

  // Démarre quand le thème passe à grimoire, arrête sinon
  watch(isActive, (active) => {
    if (active) start()
    else stop()
  }, { immediate: true })

  // Gère le cas où le canvas est monté après le watch
  watch(canvasRef, (el) => {
    if (el && isActive.value) start()
  })

  onUnmounted(() => stop())
}
