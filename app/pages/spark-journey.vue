<script setup lang="ts">
import { pythonSession1 } from '~/content/python-session-1'

useHead({ title: 'Spark Journey' })

const { progress, isLevelMastered, isLevelUnlocked } = useSessionProgress()
const sessionMastery = computed(() => pythonSession1.levels.filter((level) => isLevelMastered(level.id)).length)
const language = computed(() => progress.value.language)
const copy = computed(() => language.value === 'th'
  ? { eyebrow: 'LEARNING HUB', title: 'เลือกเส้นทางการเรียนรู้ของคุณ', description: 'เริ่มจากแนวคิดเล็ก ๆ แล้วค่อย ๆ สร้างทักษะการเขียนโค้ด', action: 'เปิด Python Session 1', status: 'พร้อมเริ่มต้น' }
  : { eyebrow: 'LEARNING HUB', title: 'Choose your learning path', description: 'Start with small ideas and build your coding skills one Mission at a time.', action: 'Open Python Session 1', status: 'Ready to start' })
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
        <span class="journey-eyebrow">{{ copy.eyebrow }}</span>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.description }}</p>
      </div>
      <div class="hero-orbit" aria-hidden="true"><span class="orbit-dot one" /><span class="orbit-dot two" /><span class="orbit-dot three" /><span class="orbit-core">⌘</span></div>
    </section>

    <section class="course-grid" aria-label="Courses">
      <article class="course-card course-card-featured">
        <div class="course-card-top"><span class="course-icon">PY</span><span class="course-badge">{{ sessionMastery }}/4 mastered</span></div>
        <span class="journey-eyebrow">PYTHON CODING</span>
        <h2>{{ pythonSession1.title[language] }}</h2>
        <p>{{ pythonSession1.description[language] }}</p>
        <div class="course-levels" aria-label="Session levels">
          <span v-for="level in pythonSession1.levels" :key="level.id" :class="{ complete: isLevelMastered(level.id), locked: !isLevelUnlocked(level.number - 1) }">{{ level.number }}</span>
        </div>
        <NuxtLink class="journey-primary-action" to="/sessions/python-1" data-testid="open-python-session">{{ copy.action }} <span>→</span></NuxtLink>
      </article>
      <article class="course-card course-card-muted"><span class="course-icon muted-icon">✦</span><span class="journey-eyebrow">COMING SOON</span><h2>More coding journeys</h2><p>New Sessions will join your Spark Journey as you grow.</p><span class="locked-label">Locked for now</span></article>
    </section>
  </main>
</template>

