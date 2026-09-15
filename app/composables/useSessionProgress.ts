import { pythonSession1, type Locale, type ProgressionMode } from '~/content/python-session-1'

export interface SessionProgress {
  language: Locale
  mode: ProgressionMode
  currentLevelId: string
  masteredLevelIds: string[]
}

const STORAGE_KEY = 'cv-spark-python-session-1-progress-v1'

function createDefaultProgress(): SessionProgress {
  return {
    language: 'en',
    mode: 'guided',
    currentLevelId: pythonSession1.levels[0]?.id || 'level-1',
    masteredLevelIds: [],
  }
}

function isValidProgress(value: unknown): value is SessionProgress {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<SessionProgress>
  return (candidate.language === 'en' || candidate.language === 'th')
    && (candidate.mode === 'guided' || candidate.mode === 'explore')
    && typeof candidate.currentLevelId === 'string'
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
        progress.value = {
          ...createDefaultProgress(),
          ...saved,
          currentLevelId: knownLevelIds.has(saved.currentLevelId) ? saved.currentLevelId : createDefaultProgress().currentLevelId,
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
    progress.value.mode = mode
    save()
  }

  function selectLevel(levelId: string) {
    const index = pythonSession1.levels.findIndex((level) => level.id === levelId)
    if (index < 0 || !isLevelUnlocked(index)) return false
    progress.value.currentLevelId = levelId
    save()
    return true
  }

  function isLevelMastered(levelId: string) {
    return progress.value.masteredLevelIds.includes(levelId)
  }

  function isLevelUnlocked(index: number) {
    if (progress.value.mode === 'explore' || index === 0) return true
    return isLevelMastered(pythonSession1.levels[index - 1]?.id || '')
  }

  function markLevelMastered(levelId: string) {
    if (!isLevelMastered(levelId)) progress.value.masteredLevelIds.push(levelId)
    save()
  }

  function reset() {
    progress.value = createDefaultProgress()
    if (import.meta.client) localStorage.removeItem(STORAGE_KEY)
  }

  if (import.meta.client) {
    onMounted(hydrate)
    watch(progress, save, { deep: true })
  }

  return {
    progress,
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

