import { ref, onMounted } from 'vue'

export function useModels() {
  const models = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchModels() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch('/api/models')
      if (!res.ok) throw new Error('Ollama unreachable')
      models.value = await res.json()
    } catch {
      error.value = 'Impossible de contacter Ollama'
    } finally {
      loading.value = false
    }
  }

  onMounted(fetchModels)

  return { models, loading, error, fetchModels }
}
