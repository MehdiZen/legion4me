import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import { migrateLegacyStorage } from '@/lib/storage'
import './themes/index.css'
import './style.css'

migrateLegacyStorage()

createApp(App).use(createPinia()).use(router).mount('#app')
