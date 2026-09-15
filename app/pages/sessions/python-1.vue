<script setup lang="ts">
import { pythonSession1, type SessionStage } from '~/content/python-session-1'
import { getSessionUiCopy } from '~/content/session-ui-copy'

useHead({ title: pythonSession1.title.en })

const { progress, activeLevelId, setLanguage, setMode, selectLevel, isLevelMastered, isLevelUnlocked, reset, hydrate } = useSessionProgress()
const settingsOpen = ref(false)
const activeStage = ref<SessionStage>('play')
const firstLevel = pythonSession1.levels[0]!
const route = useRoute()
const router = useRouter()
const urlIsReady = ref(false)

const currentLevel = computed(() => pythonSession1.levels.find((level) => level.id === activeLevelId.value) || firstLevel)
const masteryCount = computed(() => pythonSession1.levels.filter((level) => isLevelMastered(level.id)).length)
const progressWidth = computed(() => `${(masteryCount.value / pythonSession1.levels.length) * 100}%`)
const stageLabels: Record<SessionStage, { en: string; th: string }> = {
  play: { en: 'Play', th: 'Play' },
  predict: { en: 'Think / Predict', th: 'Think / Predict' },
  code: { en: 'Code', th: 'Code' },
  test: { en: 'Test', th: 'Test' },
}
const copy = computed(() => getSessionUiCopy(progress.value.language))

function getLocalizedText(value: { en: string; th: string }) {
  return value[progress.value.language]
}

function chooseLevel(levelId: string, index: number) {
  if (!isLevelUnlocked(index)) return
  selectLevel(levelId)
  activeStage.value = pythonSession1.levels[index]?.availableStages[0] || 'play'
}

function chooseStage(stage: SessionStage) {
  if (currentLevel.value.availableStages.includes(stage)) activeStage.value = stage
}

function resetProgress() {
  if (confirm(copy.value.resetConfirmation)) reset()
}

function syncLevelToUrl(levelId: string) {
  if (route.query.level === levelId) return
  router.replace({ query: { ...route.query, level: levelId } })
}

onMounted(() => {
  hydrate()
  const requestedLevelId = typeof route.query.level === 'string' ? route.query.level : null
  const requestedIndex = requestedLevelId ? pythonSession1.levels.findIndex((level) => level.id === requestedLevelId) : -1
  if (requestedLevelId && requestedIndex >= 0 && isLevelUnlocked(requestedIndex)) selectLevel(requestedLevelId)
  urlIsReady.value = true
  syncLevelToUrl(activeLevelId.value)
})

watch(activeLevelId, (levelId) => {
  if (!urlIsReady.value) return
  syncLevelToUrl(levelId)
})
</script>

<template>
  <main class="session-page" data-testid="session-shell">
    <header class="session-header">
      <div class="session-header-left"><NuxtLink class="session-back" to="/spark-journey">← {{ copy.backToJourney }}</NuxtLink><div class="session-title"><span class="course-icon">PY</span><div><span class="journey-eyebrow">SPARK JOURNEY</span><h1>{{ pythonSession1.title[progress.language] }}</h1></div></div></div>
      <div class="session-header-actions"><div class="mastery-summary"><span>{{ masteryCount }}/{{ pythonSession1.levels.length }}</span><small>{{ copy.progress }}</small></div><button class="session-settings-button" type="button" :aria-expanded="settingsOpen" data-testid="session-settings" @click="settingsOpen = !settingsOpen">⚙ <span>{{ copy.sessionSettings }}</span></button></div>
      <div v-if="settingsOpen" class="session-settings-panel" data-testid="settings-panel">
        <div class="settings-panel-title">{{ copy.sessionSettings }}</div>
        <fieldset><legend>{{ copy.language }}</legend><div class="segmented-control"><button type="button" :class="{ selected: progress.language === 'en' }" data-testid="language-en" :aria-pressed="progress.language === 'en'" @click="setLanguage('en')">English</button><button type="button" :class="{ selected: progress.language === 'th' }" data-testid="language-th" :aria-pressed="progress.language === 'th'" @click="setLanguage('th')">ไทย</button></div></fieldset>
        <fieldset><legend>{{ copy.progression }}</legend><label class="mode-option"><input type="radio" name="progression-mode" value="guided" :checked="progress.mode === 'guided'" data-testid="mode-guided" @change="setMode('guided')"><span><strong>{{ copy.guided }}</strong><small>{{ copy.guidedHelp }}</small></span></label><label class="mode-option"><input type="radio" name="progression-mode" value="explore" :checked="progress.mode === 'explore'" data-testid="mode-explore" @change="setMode('explore')"><span><strong>{{ copy.explore }}</strong><small>{{ copy.exploreHelp }}</small></span></label></fieldset>
        <button class="reset-progress" type="button" data-testid="reset-progress" @click="resetProgress">{{ copy.resetProgress }}</button>
      </div>
    </header>

    <section class="session-progress-bar" :aria-label="copy.progress"><div class="progress-track"><span :style="{ width: progressWidth }" /></div><span>{{ masteryCount }} {{ copy.masteredLabel }}</span></section>

    <section class="level-stepper" :aria-label="copy.sessionLevels">
      <div class="stepper-line" aria-hidden="true" />
      <button v-for="(level, index) in pythonSession1.levels" :key="level.id" class="level-step" :class="{ active: level.id === currentLevel.id, mastered: isLevelMastered(level.id), locked: !isLevelUnlocked(index) }" :disabled="!isLevelUnlocked(index)" :aria-current="level.id === currentLevel.id ? 'step' : undefined" :data-testid="`level-${level.number}`" @click="chooseLevel(level.id, index)"><span class="level-number"><span v-if="isLevelMastered(level.id)">✓</span><span v-else-if="!isLevelUnlocked(index)">⌁</span><span v-else>{{ level.number }}</span></span><span class="level-step-copy"><strong>Level {{ level.number }}</strong><small>{{ getLocalizedText(level.title) }}</small></span><span v-if="level.id === currentLevel.id" class="level-current-label">{{ copy.current }}</span></button>
    </section>

    <section v-if="currentLevel" class="mission-layout">
      <div class="mission-main">
        <div class="mission-heading"><div><span class="journey-eyebrow">LEVEL {{ currentLevel.number }}</span><h2>{{ getLocalizedText(currentLevel.title) }}</h2><p>{{ getLocalizedText(currentLevel.objective) }}</p></div><span v-if="isLevelMastered(currentLevel.id)" class="mastery-pill">✓ {{ copy.masteredLabel }}</span><span v-else class="current-pill">{{ copy.current }}</span></div>
        <div class="stage-stepper" :aria-label="copy.steps"><button v-for="stage in currentLevel.availableStages" :key="stage" type="button" class="stage-step" :class="{ active: activeStage === stage }" :data-testid="`stage-${stage}`" @click="chooseStage(stage)"><span>{{ stageLabels[stage][progress.language] }}</span><i /></button></div>
        <article class="mission-card"><div class="mission-card-icon">{{ activeStage === 'play' ? '▶' : activeStage === 'predict' ? '?' : activeStage === 'code' ? '</>' : '✓' }}</div><div><span class="journey-eyebrow">{{ stageLabels[activeStage][progress.language] }}</span><h3>{{ copy.missionPreview }}</h3><p>{{ getLocalizedText(currentLevel.preview) }}</p><div class="mission-callout">{{ copy.stageReady }}</div></div></article>
      </div>
      <aside class="session-side-card"><span class="journey-eyebrow">{{ copy.objective }}</span><h3>{{ getLocalizedText(currentLevel.objective) }}</h3><div class="side-divider" /><span class="journey-eyebrow">{{ copy.missionSteps }}</span><ol><li v-for="stage in currentLevel.availableStages" :key="stage" :class="{ active: activeStage === stage }"><span>{{ stageLabels[stage][progress.language] }}</span><i /></li></ol><div class="side-note"><span>✦</span><p>{{ progress.mode === 'guided' ? copy.guidedHelp : copy.exploreHelp }}</p></div></aside>
    </section>
    <section v-else class="empty-level"><h2>{{ copy.choose }}</h2></section>
  </main>
</template>
