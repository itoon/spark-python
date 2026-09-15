import { pythonSession1, type Locale, type ProgressionMode } from '~/content/python-session-1'

export interface SessionProgress {
  language: Locale
  mode: ProgressionMode
  guidedLevelId: string
  exploreLevelId: string
  masteredLevelIds: string[]
}

const STORAGE_KEY = 'cv-spark-python-session-1-progress-v1'

function createDefaultProgress(): SessionProgress {
  const firstLevelId = pythonSession1.levels[0]?.id || 'level-1'
  return {
    language: 'en',
    mode: 'guided',
    guidedLevelId: firstLevelId,
    exploreLevelId: firstLevelId,
    masteredLevelIds: [],
  }
}

function getSavedLevelIds(value: Record<string, unknown>, fallback: string) {
  const guidedLevelId = typeof value.guidedLevelId === 'string'
    ? value.guidedLevelId
    : typeof value.currentLevelId === 'string' ? value.currentLevelId : fallback
  const exploreLevelId = typeof value.exploreLevelId === 'string' ? value.exploreLevelId : guidedLevelId
  return { guidedLevelId, exploreLevelId }
}

function isValidProgress(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (candidate.language === 'en' || candidate.language === 'th')
    && (candidate.mode === 'guided' || candidate.mode === 'explore')
    && Array.isArray(candidate.masteredLevelIds)
    && candidate.masteredLevelIds.every((id) => typeof id === 'string')
}

export function useSessionProgress() {
  const progress = useState<SessionProgress>('spark-python-session-1-progress', createDefaultProgress)
  const hydrated = useState('spark-python-session-1-progress-hydrated', () => false)

  function save() {
    if (!import.meta.client) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress.value))
  }

  function hydrate() {
    if (!import.meta.client || hydrated.value) return
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
      if (isValidProgress(saved)) {
        const knownLevelIds = new Set(pythonSession1.levels.map((level) => level.id))
        const defaults = createDefaultProgress()
        const savedLevelIds = getSavedLevelIds(saved, defaults.guidedLevelId)
        progress.value = {
          ...defaults,
          ...saved,
          guidedLevelId: knownLevelIds.has(savedLevelIds.guidedLevelId) ? savedLevelIds.guidedLevelId : defaults.guidedLevelId,
          exploreLevelId: knownLevelIds.has(savedLevelIds.exploreLevelId) ? savedLevelIds.exploreLevelId : defaults.exploreLevelId,
          masteredLevelIds: saved.masteredLevelIds.filter((id) => knownLevelIds.has(id)),
        }
      }
    } catch {
      // localStorage may be unavailable in private browsing.
    }
    hydrated.value = true
  }

  function setLanguage(language: Locale) {
    progress.value.language = language
    save()
  }

  function setMode(mode: ProgressionMode) {
    if (mode === 'explore') progress.value.exploreLevelId = progress.value.guidedLevelId
    if (mode === 'guided') {
      const guidedIndex = pythonSession1.levels.findIndex((level) => level.id === progress.value.guidedLevelId)
      if (!isLevelUnlockedAt(guidedIndex, 'guided')) progress.value.guidedLevelId = getFirstUnlockedLevelId()
    }
    progress.value.mode = mode
    save()
  }

  function selectLevel(levelId: string) {
    const index = pythonSession1.levels.findIndex((level) => level.id === levelId)
    if (index < 0 || !isLevelUnlocked(index)) return false
    if (progress.value.mode === 'explore') progress.value.exploreLevelId = levelId
    else progress.value.guidedLevelId = levelId
    save()
    return true
  }

  function isLevelMastered(levelId: string) {
    return progress.value.masteredLevelIds.includes(levelId)
  }

  function isLevelUnlockedAt(index: number, mode: ProgressionMode) {
    if (mode === 'explore' || index === 0) return true
    return isLevelMastered(pythonSession1.levels[index - 1]?.id || '')
  }

  function isLevelUnlocked(index: number) {
    return isLevelUnlockedAt(index, progress.value.mode)
  }

  function getFirstUnlockedLevelId() {
    const index = pythonSession1.levels.findIndex((_, levelIndex) => isLevelUnlockedAt(levelIndex, 'guided'))
    return pythonSession1.levels[index < 0 ? 0 : index]?.id || createDefaultProgress().guidedLevelId
  }

  function markLevelMastered(levelId: string) {
    if (progress.value.mode === 'explore') return
    if (!isLevelMastered(levelId)) progress.value.masteredLevelIds.push(levelId)
    save()
  }

  function reset() {
    const { language, mode } = progress.value
    progress.value = { ...createDefaultProgress(), language, mode }
    if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
  }

  if (import.meta.client) {
    onMounted(hydrate)
    watch(progress, save, { deep: true })
  }

  return {
    progress,
    activeLevelId: computed(() => progress.value.mode === 'explore' ? progress.value.exploreLevelId : progress.value.guidedLevelId),
    hydrate,
    setLanguage,
    setMode,
    selectLevel,
    isLevelMastered,
    isLevelUnlocked,
    markLevelMastered,
    reset,
  }
}
