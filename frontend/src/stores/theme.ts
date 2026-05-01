import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeId = 'grimoire' | 'signal' | 'onyx' | 'gpt' | 'gemini' | 'claude' | 'cosmos'
export type ThemeGroup = 'original' | 'inspired'

export interface Theme {
  id:     ThemeId
  name:   string
  label:  string
  group:  ThemeGroup
  accent: string
  bg:     string
  s1:     string
  s2:     string
  s3:     string
  border: string
  text:   string
}

// ─── Register themes here ─────────────────────────────────────────────────
export const THEMES: Theme[] = [
  {
    id:     'grimoire',
    name:   'Grimoire',
    label:  'Arcane',
    group:  'original',
    accent: '#c8a45a',
    bg:     '#080810',
    s1:     '#0c0c18',
    s2:     '#10101e',
    s3:     '#161628',
    border: '#26263d',
    text:   '#e4dfd5',
  },
  {
    id:     'signal',
    name:   'Signal',
    label:  'Terminal',
    group:  'original',
    accent: '#00e5b0',
    bg:     '#050908',
    s1:     '#090e0c',
    s2:     '#0d1410',
    s3:     '#121b16',
    border: '#1d2c24',
    text:   '#c5d8cf',
  },
  {
    id:     'onyx',
    name:   'Onyx',
    label:  'Minimal',
    group:  'inspired',
    accent: '#a78bfa',
    bg:     '#0c0c0c',
    s1:     '#111111',
    s2:     '#191919',
    s3:     '#222222',
    border: '#333333',
    text:   '#f2f2f2',
  },
  {
    id:     'gpt',
    name:   'GPT',
    label:  'OpenAI',
    group:  'inspired',
    accent: '#acacac',
    bg:     '#212121',
    s1:     '#171717',
    s2:     '#2f2f2f',
    s3:     '#383838',
    border: '#4a4a4a',
    text:   '#ececec',
  },
  {
    id:     'gemini',
    name:   'Gemini',
    label:  'Google',
    group:  'inspired',
    accent: '#4f8ef5',
    bg:     '#0f0f14',
    s1:     '#14141c',
    s2:     '#1b1b26',
    s3:     '#232330',
    border: '#38384e',
    text:   '#e8e8f2',
  },
  {
    id:     'claude',
    name:   'Claude',
    label:  'Anthropic',
    group:  'inspired',
    accent: '#b84a28',
    bg:     '#e8ddd0',
    s1:     '#ddd0c0',
    s2:     '#e8ddd0',
    s3:     '#d4c6b4',
    border: '#bfae98',
    text:   '#1c1510',
  },
  {
    id:     'cosmos',
    name:   'Cosmos',
    label:  'Deep Space',
    group:  'original',
    accent: '#a855f7',
    bg:     '#00010c',
    s1:     '#02071a',
    s2:     '#040c22',
    s3:     '#07122e',
    border: 'rgba(168,85,247,0.10)',
    text:   '#dde4ff',
  },
]
// ──────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'asmodeus-theme'

export const useThemeStore = defineStore('theme', () => {
  const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null
  const validIds = THEMES.map(t => t.id)
  const initial: ThemeId = stored && validIds.includes(stored) ? stored : 'grimoire'

  const current = ref<ThemeId>(initial)

  function apply(id: ThemeId) {
    current.value = id
    document.documentElement.setAttribute('data-theme', id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  apply(initial)

  return { current, themes: THEMES, apply }
})
