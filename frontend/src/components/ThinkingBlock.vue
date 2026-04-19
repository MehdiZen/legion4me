<template>
  <div class="thinking-block" :class="{ 'is-streaming': isStreaming }">
    <button class="thinking-toggle" @click="open = !open">
      <svg
        class="thinking-chevron"
        :class="{ rotated: open }"
        width="11" height="11" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" stroke-width="2.5"
      >
        <polyline points="6 9 12 15 18 9"/>
      </svg>
      <span v-if="isStreaming" class="thinking-dot-wrap">
        <span class="thinking-dot" />
        <span class="thinking-dot" />
        <span class="thinking-dot" />
      </span>
      <span class="thinking-label">{{ isStreaming ? 'Réflexion en cours…' : 'Voir le raisonnement' }}</span>
      <span class="thinking-chars">{{ content.length }} car.</span>
    </button>
    <div v-if="open" class="thinking-body">
      <pre class="thinking-text">{{ content }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ content: string; isStreaming?: boolean }>()
const open = ref(false)
</script>

<style scoped>
.thinking-block {
  margin-bottom: 10px;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 5px 10px;
  cursor: pointer;
  color: var(--text-3);
  font-family: var(--font-mono);
  font-size: 11px;
  transition: border-color 0.15s, color 0.15s;
}

.thinking-toggle:hover {
  border-color: var(--accent);
  color: var(--text-2);
}

.is-streaming .thinking-toggle {
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  color: var(--text-2);
}

.thinking-chevron {
  transition: transform 0.2s ease;
  flex-shrink: 0;
}
.thinking-chevron.rotated { transform: rotate(180deg); }

.thinking-label { flex: 1; text-align: left; }

.thinking-chars {
  color: var(--text-3);
  font-size: 10px;
  opacity: 0.6;
}

/* Animated dots */
.thinking-dot-wrap {
  display: flex;
  gap: 3px;
  align-items: center;
}

.thinking-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
  animation: thinkPulse 1.2s ease-in-out infinite;
}
.thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.thinking-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes thinkPulse {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

/* Thinking content */
.thinking-body {
  margin-top: 6px;
  border-left: 2px solid var(--border);
  padding: 8px 12px;
}

.thinking-text {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
}
</style>
