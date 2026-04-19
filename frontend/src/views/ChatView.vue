<template>
  <div class="h-screen flex overflow-hidden" @keydown="onKey">
    <Sidebar ref="sidebarRef" />
    <div class="flex-1 flex flex-col min-w-0 bg-surface">
      <ChatHeader />
      <ChatWindow />
      <MessageInput ref="inputRef" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePersonaStore } from '@/stores/persona'
import { useConversationStore } from '@/stores/conversation'
import Sidebar from '@/components/Sidebar.vue'
import ChatHeader from '@/components/ChatHeader.vue'
import ChatWindow from '@/components/ChatWindow.vue'
import MessageInput from '@/components/MessageInput.vue'

const personaStore = usePersonaStore()
const convStore    = useConversationStore()
const inputRef     = ref<InstanceType<typeof MessageInput> | null>(null)

function onKey(e: KeyboardEvent) {
  const ctrl = e.ctrlKey || e.metaKey

  // Ctrl+K — nouvelle conversation
  if (ctrl && e.key === 'k') {
    e.preventDefault()
    if (personaStore.activePersona && !convStore.isStreaming) {
      convStore.createConversation(personaStore.activePersona.id)
        .then(conv => convStore.selectConversation(conv))
    }
  }

  // Ctrl+/ — focus input
  if (ctrl && e.key === '/') {
    e.preventDefault()
    inputRef.value?.focus()
  }

  // Echap — blur input
  if (e.key === 'Escape') {
    (document.activeElement as HTMLElement)?.blur()
  }
}

onMounted(()  => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>
