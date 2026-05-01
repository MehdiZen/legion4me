<template>
  <div class="ambient-scene" aria-hidden="true">

    <!-- GRIMOIRE -->
    <canvas v-if="theme === 'grimoire'" ref="canvasRef" class="ambient-canvas" />

    <!-- SIGNAL -->
    <template v-else-if="theme === 'signal'">
      <div class="scanline-sweep" />
      <div
        v-for="bar in glitchBars"
        :key="bar.id"
        class="glitch-bar"
        :style="{ top: bar.top + '%', opacity: bar.opacity, height: bar.height + 'px' }"
      />
      <div class="phosphor-text">{{ phosphorText }}</div>
    </template>

    <!-- COSMOS -->
    <template v-else-if="theme === 'cosmos'">
      <div
        v-for="star in stars"
        :key="star.id"
        class="ambient-star"
        :style="{
          left: star.x + '%',
          top:  star.y + '%',
          width:  star.size + 'px',
          height: star.size + 'px',
          background: star.color,
          '--star-dur':   star.dur   + 's',
          '--star-delay': star.delay + 's',
          boxShadow: star.size > 1.5 ? `0 0 ${star.size * 2}px ${star.color}` : undefined,
        }"
      />
      <div class="planet-wrap">
        <svg width="110" height="75" viewBox="0 0 110 75" fill="none">
          <ellipse cx="55" cy="40" rx="52" ry="13" stroke="#6d28d9" stroke-width="1.5" fill="none" stroke-dasharray="3 1.5" opacity="0.6"/>
          <circle cx="55" cy="38" r="28" fill="url(#pg)"/>
          <circle cx="55" cy="38" r="28" fill="url(#ps)" opacity="0.4"/>
          <defs>
            <radialGradient id="pg" cx="40%" cy="35%">
              <stop offset="0%"   stop-color="#7c3aed"/>
              <stop offset="100%" stop-color="#1e1060"/>
            </radialGradient>
            <radialGradient id="ps" cx="30%" cy="25%">
              <stop offset="0%"   stop-color="#e9d5ff" stop-opacity="0.5"/>
              <stop offset="100%" stop-color="transparent" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <ellipse cx="55" cy="40" rx="52" ry="13" stroke="#8b5cf6" stroke-width="1" fill="none" stroke-dasharray="3 1.5" opacity="0.9" clip-path="url(#pc)"/>
          <clipPath id="pc"><ellipse cx="55" cy="40" rx="55" ry="38"/></clipPath>
          <circle cx="45" cy="30" r="5" fill="#2d1580" opacity="0.6"/>
          <circle cx="65" cy="44" r="3" fill="#2d1580" opacity="0.5"/>
        </svg>
      </div>
      <div
        v-if="ufoActive"
        class="ufo-wrap"
        :style="{
          top: ufo.top + '%',
          animation: `${ufo.fromLeft ? 'saucerRight' : 'saucerLeft'} 9s linear forwards`,
          transform: ufo.fromLeft ? 'none' : 'scaleX(-1)',
        }"
      >
        <svg width="80" height="55" viewBox="0 0 80 55" fill="none">
          <path d="M22 26 L10 52 L70 52 L58 26Z" fill="url(#beam2)" opacity="0.4"/>
          <defs>
            <linearGradient id="beam2" x1="40" y1="26" x2="40" y2="52" gradientUnits="userSpaceOnUse">
              <stop offset="0%"   stop-color="#a855f7" stop-opacity="0.9"/>
              <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <ellipse cx="40" cy="28" rx="24" ry="8" fill="#1e1060" stroke="#a855f7" stroke-width="1"/>
          <ellipse cx="40" cy="22" rx="14" ry="9" fill="#2d1580" stroke="#7c3aed" stroke-width="0.8"/>
          <circle cx="28" cy="27" r="2.5" fill="#38bdf8" opacity="0.9"/>
          <circle cx="40" cy="29" r="2.5" fill="#a855f7"/>
          <circle cx="52" cy="27" r="2.5" fill="#38bdf8" opacity="0.9"/>
          <circle cx="17" cy="29" r="1.5" fill="#a855f7" opacity="0.7"/>
          <circle cx="63" cy="29" r="1.5" fill="#a855f7" opacity="0.7"/>
        </svg>
      </div>
    </template>

    <!-- CLAUDE -->
    <template v-else-if="theme === 'claude'">
      <div class="page-edge-left" />
      <div class="page-edge-right" />
      <div class="page-edge-top" />
      <div
        v-for="blob in inkBlobs"
        :key="blob.id"
        class="ink-blob"
        :style="{ left: blob.x + '%', top: blob.y + '%', width: blob.w + 'px', height: blob.h + 'px' }"
      />
      <div
        v-for="line in inkLines"
        :key="line.id"
        class="ink-line"
        :style="{ left: line.x + '%', top: line.y + '%', width: line.w + 'px' }"
      />
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useGrimoireCanvas } from '@/composables/useGrimoireCanvas'

const props = defineProps<{ theme: string }>()

// ── Grimoire canvas ──────────────────────────────────────────────
const canvasRef  = ref<HTMLCanvasElement | null>(null)
const isGrimoire = computed(() => props.theme === 'grimoire')
useGrimoireCanvas(canvasRef, isGrimoire)

// ── Signal ───────────────────────────────────────────────────────
const glitchBars   = ref<{ id: number; top: number; opacity: number; height: number }[]>([])
const phosphorText = ref('> SYSTEM READY_')
const SIGNAL_LINES = [
  '> PROCESSING REQUEST...',
  '> STREAM ACTIVE_',
  '> MEMORY STABLE_',
  '> MODEL LOADED_',
  '> CONTEXT: 8192 tok',
  '> OLLAMA: CONNECTED',
]
let glitchTimer:   ReturnType<typeof setInterval> | null = null
let phosphorTimer: ReturnType<typeof setInterval> | null = null

function startSignal() {
  let lineIdx = 0
  glitchTimer = setInterval(() => {
    glitchBars.value = Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => ({
      id:      Math.random(),
      top:     Math.random() * 100,
      opacity: 0.15 + Math.random() * 0.25,
      height:  2 + Math.random() * 6,
    }))
    setTimeout(() => { glitchBars.value = [] }, 80 + Math.random() * 120)
  }, 3500 + Math.random() * 4000)
  phosphorTimer = setInterval(() => {
    lineIdx = (lineIdx + 1) % SIGNAL_LINES.length
    phosphorText.value = SIGNAL_LINES[lineIdx]
  }, 4000)
}

function stopSignal() {
  if (glitchTimer)   { clearInterval(glitchTimer);   glitchTimer = null }
  if (phosphorTimer) { clearInterval(phosphorTimer); phosphorTimer = null }
  glitchBars.value = []
}

// ── Cosmos ───────────────────────────────────────────────────────
const STAR_COLORS = ['#ffffff', '#c4b5fd', '#bfdbfe', '#fde68a']
const stars = Array.from({ length: 55 }, (_, i) => ({
  id:    i,
  x:     Math.random() * 100,
  y:     Math.random() * 100,
  size:  0.5 + Math.random() * 2.5,
  dur:   2 + Math.random() * 4,
  delay: Math.random() * 5,
  color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
}))

interface Ufo { top: number; fromLeft: boolean }
const ufo       = ref<Ufo>({ top: 30, fromLeft: true })
const ufoActive = ref(false)
let ufoTimer: ReturnType<typeof setInterval> | null = null

function startCosmos() {
  const launch = () => {
    ufo.value = { top: 8 + Math.random() * 55, fromLeft: Math.random() > 0.5 }
    ufoActive.value = true
    setTimeout(() => { ufoActive.value = false }, 9200)
  }
  launch()
  ufoTimer = setInterval(launch, 14000)
}

function stopCosmos() {
  if (ufoTimer) { clearInterval(ufoTimer); ufoTimer = null }
  ufoActive.value = false
}

// ── Claude ───────────────────────────────────────────────────────
const inkBlobs = ref<{ id: number; x: number; y: number; w: number; h: number }[]>([])
const inkLines = ref<{ id: number; x: number; y: number; w: number }[]>([])
let inkBlobTimer: ReturnType<typeof setInterval> | null = null
let inkLineTimer: ReturnType<typeof setInterval> | null = null

function startClaude() {
  const spawnBlob = () => {
    const blob = { id: Date.now(), x: 5 + Math.random() * 85, y: 5 + Math.random() * 85, w: 40 + Math.random() * 80, h: 30 + Math.random() * 60 }
    inkBlobs.value = [...inkBlobs.value.slice(-5), blob]
    setTimeout(() => { inkBlobs.value = inkBlobs.value.filter(b => b.id !== blob.id) }, 4200)
  }
  const spawnLine = () => {
    const line = { id: Date.now(), x: 2 + Math.random() * 15, y: 10 + Math.random() * 80, w: 40 + Math.random() * 140 }
    inkLines.value = [...inkLines.value.slice(-4), line]
    setTimeout(() => { inkLines.value = inkLines.value.filter(l => l.id !== line.id) }, 3200)
  }
  spawnBlob(); spawnLine()
  inkBlobTimer = setInterval(spawnBlob, 6000 + Math.random() * 5000)
  inkLineTimer = setInterval(spawnLine, 5000 + Math.random() * 4000)
}

function stopClaude() {
  if (inkBlobTimer) { clearInterval(inkBlobTimer); inkBlobTimer = null }
  if (inkLineTimer) { clearInterval(inkLineTimer); inkLineTimer = null }
  inkBlobs.value = []; inkLines.value = []
}

// ── Lifecycle ────────────────────────────────────────────────────
function startScene(theme: string) {
  if (theme === 'signal') startSignal()
  if (theme === 'cosmos') startCosmos()
  if (theme === 'claude') startClaude()
}

function stopAll() {
  stopSignal(); stopCosmos(); stopClaude()
}

onMounted(() => startScene(props.theme))
onUnmounted(() => stopAll())

watch(() => props.theme, (next, prev) => {
  if (prev === 'signal') stopSignal()
  if (prev === 'cosmos') stopCosmos()
  if (prev === 'claude') stopClaude()
  startScene(next)
})
</script>
