import { defineStore } from 'pinia'
import { ref } from 'vue'

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
    const res = await fetch(`/api/memories/persona/${personaId}`)
    const data = await res.json() as { global: Memory[]; persona: Memory[] }
    globalMemories.value  = data.global
    personaMemories.value = data.persona
  }

  async function deleteMemory(id: string) {
    await fetch(`/api/memories/${id}`, { method: 'DELETE' })
    globalMemories.value  = globalMemories.value.filter(m => m.id !== id)
    personaMemories.value = personaMemories.value.filter(m => m.id !== id)
  }

  async function addMemory(type: 'global' | 'persona', content: string, personaId?: string) {
    const res = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, personaId, source: 'tool' }),
    })
    const mem: Memory = await res.json()
    if (type === 'global') globalMemories.value.push(mem)
    else personaMemories.value.push(mem)
  }

  async function addUserMemory(content: string) {
    const res = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'global', content, source: 'user' }),
    })
    const mem: Memory = await res.json()
    globalMemories.value.push(mem)
    return mem
  }

  return { globalMemories, personaMemories, fetchForPersona, deleteMemory, addMemory, addUserMemory }
})
