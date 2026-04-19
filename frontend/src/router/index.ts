import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'
import PersonasView from '@/views/PersonasView.vue'
import StatsView from '@/views/StatsView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: ChatView },
    { path: '/personas', component: PersonasView },
    { path: '/stats', component: StatsView },
  ],
})
