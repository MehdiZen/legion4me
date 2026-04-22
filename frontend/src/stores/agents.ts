import { defineStore } from 'pinia'
import { ref } from 'vue'

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

const API = '/api'

export const useAgentsStore = defineStore('agents', () => {
  const agents    = ref<Agent[]>([])
  const agentRuns = ref<Record<string, AgentRun[]>>({})

  async function fetchAgents() {
    const res = await fetch(`${API}/agents`)
    agents.value = await res.json()
  }

  async function createAgent(data: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>): Promise<Agent> {
    const res = await fetch(`${API}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const agent = await res.json()
    agents.value.push(agent)
    return agent
  }

  async function updateAgent(id: string, data: Partial<Omit<Agent, 'id' | 'createdAt'>>): Promise<Agent> {
    const res = await fetch(`${API}/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const updated = await res.json()
    const idx = agents.value.findIndex(a => a.id === id)
    if (idx >= 0) agents.value[idx] = updated
    return updated
  }

  async function deleteAgent(id: string) {
    await fetch(`${API}/agents/${id}`, { method: 'DELETE' })
    agents.value = agents.value.filter(a => a.id !== id)
    delete agentRuns.value[id]
  }

  async function runAgent(id: string, extra?: { transcript?: string }): Promise<string> {
    const res = await fetch(`${API}/agents/${id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extra ?? {}),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Erreur lors du lancement')
    }
    const { runId } = await res.json()
    return runId
  }

  async function pollRun(runId: string): Promise<AgentRun> {
    const res = await fetch(`${API}/agents/runs/${runId}`)
    return res.json()
  }

  async function loadRuns(agentId: string): Promise<void> {
    const res = await fetch(`${API}/agents/${agentId}/runs`)
    if (!res.ok) return
    agentRuns.value[agentId] = await res.json()
  }

  async function loadAllRuns(): Promise<void> {
    await Promise.all(agents.value.map(a => loadRuns(a.id)))
  }

  return { agents, agentRuns, fetchAgents, createAgent, updateAgent, deleteAgent, runAgent, pollRun, loadRuns, loadAllRuns }
})
