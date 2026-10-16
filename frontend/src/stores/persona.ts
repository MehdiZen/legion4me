import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Persona } from '@/types'
import { api } from '@/lib/api'

export const usePersonaStore = defineStore('persona', () => {
  const personas = ref<Persona[]>([])
  const activePersona = ref<Persona | null>(null)

  async function fetchPersonas() {
    personas.value = await api.get<Persona[]>('/personas')
  }

  async function createPersona(data: Omit<Persona, 'id' | 'createdAt' | 'updatedAt'>): Promise<Persona> {
    const persona = await api.post<Persona>('/personas', data)
    personas.value.push(persona)
    return persona
  }

  async function updatePersona(id: string, data: Partial<Persona>): Promise<Persona> {
    const updated = await api.put<Persona>(`/personas/${id}`, data)
    const idx = personas.value.findIndex(p => p.id === id)
    if (idx !== -1) personas.value[idx] = updated
    if (activePersona.value?.id === id) activePersona.value = updated
    return updated
  }

  async function deletePersona(id: string) {
    await api.del(`/personas/${id}`)
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
