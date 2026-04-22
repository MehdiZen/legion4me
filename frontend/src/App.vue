<template>
  <div class="app-shell">
    <AppRail />
    <div class="app-content">
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { usePersonaStore } from '@/stores/persona'
import { useConversationStore } from '@/stores/conversation'
import { useThemeStore } from '@/stores/theme'
import AppRail from '@/components/AppRail.vue'

const personaStore = usePersonaStore()
const convStore    = useConversationStore()
const themeStore   = useThemeStore()

async function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return
  // Refetch la conversation active pour récupérer les réponses arrivées pendant l'absence
  if (convStore.active && !convStore.isStreaming) {
    await convStore.selectConversation(convStore.active)
  }
}

onMounted(async () => {
  document.documentElement.setAttribute('data-theme', themeStore.current)
  await Promise.all([personaStore.fetchPersonas(), convStore.fetchConversations()])
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.app-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
</style>
