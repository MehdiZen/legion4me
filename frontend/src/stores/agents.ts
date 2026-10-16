import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/lib/api'

export type AgentType = 'email_digest' | 'morning_briefing' | 'veille' | 'meeting_summary' | 'weekly_review'

export interface Agent {
  id: string
  name: string
  type: AgentType
  config: Record<string, unknown>
  personaId: string | null
  createdAt: number
  updatedAt: number
}

export interface AgentRun {
  id: string
  agentId: string
  status: 'running' | 'done' | 'error'
  output: string | null
  createdAt: number
}

export const useAgentsStore = defineStore('agents', () => {
  const agents    = ref<Agent[]>([])
  const agentRuns = ref<Record<string, AgentRun[]>>({})

  async function fetchAgents() {
    agents.value = await api.get<Agent[]>('/agents')
  }

  async function createAgent(data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent> {
    const agent = await api.post<Agent>('/agents', data)
    agents.value.push(agent)
    return agent
  }

  async function updateAgent(id: string, data: Partial<Omit<Agent, 'id' | 'createdAt'>>): Promise<Agent> {
    const updated = await api.put<Agent>(`/agents/${id}`, data)
    const idx = agents.value.findIndex(a => a.id === id)
    if (idx >= 0) agents.value[idx] = updated
    return updated
  }

  async function deleteAgent(id: string) {
    await api.del(`/agents/${id}`)
    agents.value = agents.value.filter(a => a.id !== id)
    delete agentRuns.value[id]
  }

  async function runAgent(id: string, extra?: { transcript?: string }): Promise<string> {
    const { runId } = await api.post<{ runId: string }>(`/agents/${id}/run`, extra ?? {})
    return runId
  }

  async function pollRun(runId: string): Promise<AgentRun> {
    return api.get<AgentRun>(`/agents/runs/${runId}`)
  }

  async function loadRuns(agentId: string): Promise<void> {
    try {
      agentRuns.value[agentId] = await api.get<AgentRun[]>(`/agents/${agentId}/runs`)
    } catch {
      // historique non critique — on laisse l'entrée absente
    }
  }

  async function loadAllRuns(): Promise<void> {
    await Promise.all(agents.value.map(a => loadRuns(a.id)))
  }

  return { agents, agentRuns, fetchAgents, createAgent, updateAgent, deleteAgent, runAgent, pollRun, loadRuns, loadAllRuns }
})
