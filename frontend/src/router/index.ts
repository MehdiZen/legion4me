import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'
import PersonasView from '@/views/PersonasView.vue'
import StatsView from '@/views/StatsView.vue'
import AgentsView from '@/views/AgentsView.vue'
import SettingsView from '@/views/SettingsView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: ChatView },
    { path: '/agents', component: AgentsView },
    { path: '/personas', component: PersonasView },
    { path: '/stats', component: StatsView },
    { path: '/settings', component: SettingsView },
  ],
})
