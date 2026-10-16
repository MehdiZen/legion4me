import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'

export interface Memory {
  id: string
  type: 'global' | 'persona'
  source: 'tool' | 'user'
  personaId: string | null
  content: string
  createdAt: number
}

export const useMemoryStore = defineStore('memory', () => {
  const globalMemories  = ref<Memory[]>([])
  const personaMemories = ref<Memory[]>([])

  async function fetchForPersona(personaId: string) {
    const data = await api.get<{ global: Memory[]; persona: Memory[] }>(`/memories/persona/${personaId}`)
    globalMemories.value  = data.global
    personaMemories.value = data.persona
  }

  async function deleteMemory(id: string) {
    await api.del(`/memories/${id}`)
    globalMemories.value  = globalMemories.value.filter(m => m.id !== id)
    personaMemories.value = personaMemories.value.filter(m => m.id !== id)
  }

  async function addMemory(type: 'global' | 'persona', content: string, personaId?: string) {
    const mem = await api.post<Memory>('/memories', { type, content, personaId, source: 'tool' })
    if (type === 'global') globalMemories.value.push(mem)
    else personaMemories.value.push(mem)
  }

  async function addUserMemory(content: string) {
    const mem = await api.post<Memory>('/memories', { type: 'global', content, source: 'user' })
    globalMemories.value.push(mem)
    return mem
  }

  return { globalMemories, personaMemories, fetchForPersona, deleteMemory, addMemory, addUserMemory }
})
