import { ref, onMounted } from 'vue'
import { api } from '@/lib/api'

// État partagé entre tous les appelants : la liste des modèles Ollama est
// globale, la charger une fois suffit (plusieurs composants l'utilisent).
const models  = ref<string[]>([])
const loading = ref(false)
const error   = ref<string | null>(null)
let loaded = false

async function fetchModels() {
  loading.value = true
  error.value = null
  try {
    models.value = await api.get<string[]>('/models')
    loaded = true
  } catch {
    error.value = 'Impossible de contacter Ollama'
  } finally {
    loading.value = false
  }
}

export function useModels() {
  onMounted(() => {
    if (!loaded && !loading.value) fetchModels()
  })

  return { models, loading, error, fetchModels }
}
