import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Persona } from '@/types'

export const usePersonaStore = defineStore('persona', () => {
  const personas = ref<Persona[]>([])
  const activePersona = ref<Persona | null>(null)

  async function fetchPersonas() {
    const res = await fetch('/api/personas')
    personas.value = await res.json()
  }

  async function createPersona(data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>): Promise<Persona> {
    const res = await fetch('/api/personas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const persona: Persona = await res.json()
    personas.value.push(persona)
    return persona
  }

  async function updatePersona(id: string, data: Partial<Persona>): Promise<Persona> {
    const res = await fetch(`/api/personas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const updated: Persona = await res.json()
    const idx = personas.value.findIndex(p => p.id === id)
    if (idx !== -1) personas.value[idx] = updated
    if (activePersona.value?.id === id) activePersona.value = updated
    return updated
  }

  async function deletePersona(id: string) {
    await fetch(`/api/personas/${id}`, { method: 'DELETE' })
    personas.value = personas.value.filter(p => p.id !== id)
    if (activePersona.value?.id === id) activePersona.value = null
  }

  function setActivePersona(persona: Persona | null) {
    activePersona.value = persona
  }

  return {
    personas,
    activePersona,
    fetchPersonas,
    createPersona,
    updatePersona,
    deletePersona,
    setActivePersona,
  }
})
