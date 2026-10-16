/**
 * Migration des clés localStorage héritées du nom « asmodeus ».
 *
 * Renommer l'app ne doit pas réinitialiser les préférences locales : on
 * transfère une fois pour toutes les anciennes clés vers les nouvelles.
 * À supprimer quand plus aucune installation ne porte les anciennes.
 */
const LEGACY_KEYS: Record<string, string> = {
  'asmodeus-theme':               'legion4me-theme',
  'asmodeus:lastConversationId':  'legion4me:lastConversationId',
}

export function migrateLegacyStorage(): void {
  for (const [oldKey, newKey] of Object.entries(LEGACY_KEYS)) {
    try {
      const value = localStorage.getItem(oldKey)
      if (value === null) continue
      // Ne jamais écraser une valeur déjà migrée
      if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, value)
      localStorage.removeItem(oldKey)
    } catch {
      // localStorage indisponible (mode privé, quota) — sans effet
    }
  }
}
