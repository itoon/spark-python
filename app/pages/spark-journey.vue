<script setup lang="ts">
import { pythonSession1 } from '~/content/python-session-1'
import { getSessionUiCopy } from '~/content/session-ui-copy'

useHead({ title: 'Spark Journey' })

const { progress, isLevelMastered, isLevelUnlocked } = useSessionProgress()
const sessionMastery = computed(() => pythonSession1.levels.filter((level) => isLevelMastered(level.id)).length)
const language = computed(() => progress.value.language)
const copy = computed(() => getSessionUiCopy(language.value))
</script>

<template>
  <main class="journey-page" data-testid="spark-journey-hub">
    <header class="journey-header">
      <NuxtLink class="journey-brand" to="/" aria-label="Open Python Lab">
        <span class="brand-mark" aria-hidden="true">✦</span>
        <span><strong>CodeVenture</strong><small>Spark Journey</small></span>
      </NuxtLink>
      <span class="journey-status"><i /> {{ copy.status }}</span>
    </header>

    <section class="journey-hero">
      <div class="hero-copy">
        <span class="journey-eyebrow">{{ copy.hubEyebrow }}</span>
        <h1>{{ copy.hubTitle }}</h1>
        <p>{{ copy.hubDescription }}</p>
      </div>
      <div class="hero-orbit" aria-hidden="true"><span class="orbit-dot one" /><span class="orbit-dot two" /><span class="orbit-dot three" /><span class="orbit-core">⌘</span></div>
    </section>

    <section class="course-grid" :aria-label="copy.coursesLabel">
      <article class="course-card course-card-featured">
        <div class="course-card-top"><span class="course-icon">PY</span><span class="course-badge">{{ sessionMastery }}/4 {{ copy.masteredLabel }}</span></div>
        <span class="journey-eyebrow">{{ copy.pythonCodingLabel }}</span>
        <h2>{{ pythonSession1.title[language] }}</h2>
        <p>{{ pythonSession1.description[language] }}</p>
        <div class="course-levels" aria-label="Session levels">
          <span v-for="level in pythonSession1.levels" :key="level.id" :class="{ complete: isLevelMastered(level.id), locked: !isLevelUnlocked(level.number - 1) }">{{ level.number }}</span>
        </div>
        <NuxtLink class="journey-primary-action" to="/sessions/python-1" data-testid="open-python-session">{{ copy.hubAction }} <span>→</span></NuxtLink>
      </article>
      <article class="course-card course-card-muted"><span class="course-icon muted-icon">✦</span><span class="journey-eyebrow">{{ copy.comingSoonLabel }}</span><h2>{{ copy.moreJourneysTitle }}</h2><p>{{ copy.moreJourneysDescription }}</p><span class="locked-label">{{ copy.lockedNowLabel }}</span></article>
    </section>
  </main>
</template>
