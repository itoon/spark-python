<script setup lang="ts">
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import type { PythonRunResult } from '~/composables/usePythonRuntime'
import type { Locale, SessionLevelContent, SessionStage } from '~/content/python-session-1'
import { getSessionUiCopy } from '~/content/session-ui-copy'

const props = defineProps<{
  level: SessionLevelContent
  locale: Locale
  activeStage: SessionStage
  completedStages: SessionStage[]
  mastered: boolean
}>()

const emit = defineEmits<{
  'stage-completed': [stage: SessionStage]
  'update:activeStage': [stage: SessionStage]
}>()

interface TestResult {
  id: string
  passed: boolean
  expected: string
  actual: string
  error: string
}

const copy = computed(() => getSessionUiCopy(props.locale))
const runtime = usePythonRuntime()
const levelCode = ref(props.level.starterCode)
const playOutput = ref('')
const playError = ref('')
const predictSelection = ref('')
const predictSubmitted = ref(false)
const predictPassed = ref(false)
const predictHintVisible = ref(false)
const investigationIndex = ref(0)
const investigationSelection = ref('')
const investigationSubmitted = ref(false)
const investigationPassed = ref(false)
const investigationHintVisible = ref(false)
const investigationCompleted = ref(false)
const codeOutput = ref('')
const codeError = ref('')
const testResults = ref<TestResult[]>([])
const executionKind = ref<'play' | 'run' | 'test' | null>(null)
let cancelActiveRun: (() => void) | undefined
let activeTour: ReturnType<typeof driver> | null = null
let executionToken = 0
const tourSkipped = ref(false)

const runtimeReady = computed(() => runtime.status.value === 'ready')
const currentTestResults = computed(() => new Map(testResults.value.map((result) => [result.id, result])))
const investigation = computed(() => props.level.investigation)
const currentInvestigationStep = computed(() => investigation.value?.steps[investigationIndex.value])
const isStageCompleted = (stage: SessionStage) => props.completedStages.includes(stage)

function getLocalizedText(value: { en: string; th: string }) {
  return value[props.locale]
}

function continueTo(stage: SessionStage) {
  if (props.level.availableStages.includes(stage)) emit('update:activeStage', stage)
}

function removeAutomaticFinalNewline(value: string) {
  return value.replace(/\r?\n$/, '')
}

function formatExpectedError(expectedError: { type: string; line?: number }) {
  return `${expectedError.type}${expectedError.line ? ` at line ${expectedError.line}` : ''}`
}

function matchesExpectedError(error: string, expectedError: { type: string; line?: number }) {
  const typeMatches = error.includes(`${expectedError.type}:`) || error.includes(`${expectedError.type} `)
  const lineMatches = expectedError.line === undefined || new RegExp(`line ${expectedError.line}\\b`).test(error)
  return typeMatches && lineMatches
}

function runWithRuntime(payload: { files: Record<string, string>; entry: string; trace: boolean; inputs: string[] }) {
  let stopWatching: (() => void) | undefined
  let finishRun: (result: PythonRunResult | null) => void = () => undefined
  const resultPromise = new Promise<PythonRunResult | null>((resolve) => {
    finishRun = (result) => {
      stopWatching?.()
      cancelActiveRun = undefined
      resolve(result)
    }
    stopWatching = watch([runtime.lastResult, runtime.status], ([result, status]) => {
      if (status === 'failed') finishRun(null)
      else if (result && status === 'ready') finishRun(result)
    })
  })
  cancelActiveRun = () => finishRun(null)
  if (!runtime.run(payload)) {
    cancelActiveRun()
    return Promise.resolve(null)
  }
  return resultPromise
}

async function runPlayExample() {
  if (!runtimeReady.value || executionKind.value) return
  const token = ++executionToken
  executionKind.value = 'play'
  playOutput.value = ''
  playError.value = ''
  const result = await runWithRuntime({ files: { 'main.py': props.level.play.example }, entry: 'main.py', trace: false, inputs: [] })
  if (token !== executionToken) return
  executionKind.value = null
  if (!result) {
    playError.value = runtime.error.value || copy.value.runtimeFailed
    return
  }
  playOutput.value = result.stdout
  playError.value = result.error || result.stderr
  const errorTest = props.level.testCases.find((testCase) => testCase.expectedError)
  if (errorTest?.expectedError && playError.value && matchesExpectedError(playError.value, errorTest.expectedError)) emit('stage-completed', 'play')
}

function submitPrediction() {
  predictSubmitted.value = true
  predictPassed.value = props.level.predict.correctOptionIds?.length === 1
    && props.level.predict.correctOptionIds[0] === predictSelection.value
  predictHintVisible.value = !predictPassed.value
}

function submitInvestigation() {
  const step = currentInvestigationStep.value
  if (!step) return
  investigationSubmitted.value = true
  investigationPassed.value = step.correctOptionId === investigationSelection.value
  investigationHintVisible.value = !investigationPassed.value
  if (investigationPassed.value && investigationIndex.value === (investigation.value?.steps.length || 1) - 1) {
    investigationCompleted.value = true
    emit('stage-completed', 'predict')
  }
}

function nextInvestigationStep() {
  if (!investigationPassed.value || investigationIndex.value >= (investigation.value?.steps.length || 1) - 1) return
  investigationIndex.value++
  investigationSelection.value = ''
  investigationSubmitted.value = false
  investigationPassed.value = false
  investigationHintVisible.value = false
}

function startTour() {
  if (!investigationCompleted.value || !props.level.explanationSteps.length) return
  activeTour?.destroy()
  activeTour = driver({
    showProgress: true,
    nextBtnText: props.locale === 'th' ? 'ถัดไป' : 'Next',
    prevBtnText: props.locale === 'th' ? 'ย้อนกลับ' : 'Back',
    doneBtnText: props.locale === 'th' ? 'เสร็จสิ้น' : 'Done',
    onPopoverRender: (popover) => {
      const skipButton = document.createElement('button')
      skipButton.type = 'button'
      skipButton.className = 'driver-skip-tour'
      skipButton.dataset.testid = 'driver-skip-tour'
      skipButton.textContent = copy.value.skipTour
      skipButton.addEventListener('click', skipTour)
      popover.footerButtons.append(skipButton)
    },
    steps: props.level.explanationSteps.map((step) => ({
      element: step.target,
      popover: {
        title: props.locale === 'th' ? 'ทำไมจุดนี้สำคัญ' : 'Why this matters',
        description: getLocalizedText(step.body),
      },
    })),
  })
  activeTour.drive()
}

function skipTour() {
  tourSkipped.value = true
  if (import.meta.client) sessionStorage.setItem('cv-python-session-1-level-2-tour-skipped', 'true')
  activeTour?.destroy()
  activeTour = null
}

function runCode() {
  if (!runtimeReady.value || executionKind.value) return
  const token = ++executionToken
  executionKind.value = 'run'
  codeOutput.value = ''
  codeError.value = ''
  runWithRuntime({ files: { 'main.py': levelCode.value }, entry: 'main.py', trace: false, inputs: [] }).then((result) => {
    if (token !== executionToken) return
    executionKind.value = null
    if (!result) {
      codeError.value = runtime.error.value || copy.value.runtimeFailed
      return
    }
    codeOutput.value = result.stdout
    codeError.value = result.error || result.stderr
    if (!result.error) emit('stage-completed', 'code')
  })
}

async function testCode() {
  if (!runtimeReady.value || executionKind.value) return
  const token = ++executionToken
  executionKind.value = 'test'
  testResults.value = []
  for (const testCase of props.level.testCases) {
    const source = testCase.source === 'play' ? props.level.play.example : levelCode.value
    const result = await runWithRuntime({ files: { 'main.py': source }, entry: 'main.py', trace: false, inputs: [...testCase.input] })
    if (token !== executionToken) return
    const runtimeError = result?.error || result?.stderr || (!result ? runtime.error.value || copy.value.runtimeFailed : '')
    const expectedError = testCase.expectedError
    const passed = Boolean(result && expectedError
      ? matchesExpectedError(runtimeError, expectedError)
      : result && !runtimeError && removeAutomaticFinalNewline(result.stdout || '') === (testCase.expectedOutput || ''))
    const actual = expectedError ? runtimeError : result?.stdout || ''
    testResults.value.push({
      id: testCase.id,
      passed,
      expected: expectedError ? formatExpectedError(expectedError) : testCase.expectedOutput || '',
      actual,
      error: expectedError ? (passed ? '' : runtimeError || `Expected ${formatExpectedError(expectedError)}`) : runtimeError,
    })
  }
  executionKind.value = null
  const requiredTestIds = props.level.mastery.requiredTestIds || []
  const requiredTestsPassed = requiredTestIds.length > 0
    ? requiredTestIds.every((id) => currentTestResults.value.get(id)?.passed)
    : testResults.value.some((result) => result.passed)
  if (requiredTestsPassed) emit('stage-completed', 'test')
}

function stopExecution() {
  executionToken++
  cancelActiveRun?.()
  runtime.stop()
  executionKind.value = null
  codeError.value = copy.value.executionStopped
}

watch(() => props.completedStages, (stages) => {
  if (!stages.length) {
    executionToken++
    cancelActiveRun?.()
    if (executionKind.value) runtime.stop()
    executionKind.value = null
    activeTour?.destroy()
    activeTour = null
    tourSkipped.value = false
    if (import.meta.client) sessionStorage.removeItem('cv-python-session-1-level-2-tour-skipped')
    levelCode.value = props.level.starterCode
    playOutput.value = ''
    playError.value = ''
    predictSelection.value = ''
    predictSubmitted.value = false
    predictPassed.value = false
    investigationIndex.value = 0
    investigationSelection.value = ''
    investigationSubmitted.value = false
    investigationPassed.value = false
    investigationCompleted.value = false
    codeOutput.value = ''
    codeError.value = ''
    testResults.value = []
  }
})

onMounted(() => {
  runtime.start()
  tourSkipped.value = sessionStorage.getItem('cv-python-session-1-level-2-tour-skipped') === 'true'
})

onBeforeUnmount(() => {
  cancelActiveRun?.()
  activeTour?.destroy()
})
</script>

<template>
  <section v-show="activeStage === 'play'" class="mission-stage" data-testid="level-2-play">
    <span class="journey-eyebrow">Play</span><h3>{{ getLocalizedText(level.play.instruction) }}</h3><p class="stage-instruction">{{ getLocalizedText(level.preview) }}</p>
    <pre class="lesson-code-block"><code>{{ level.play.example }}</code></pre>
    <button class="mission-primary-action" type="button" data-testid="level-2-play-run" :disabled="!runtimeReady || executionKind" @click="runPlayExample">▶ {{ copy.runExample }}</button>
    <div v-if="playOutput || playError" class="execution-output" data-testid="level-2-error-output"><span class="output-label">{{ playError ? copy.error : copy.actual }}</span><pre>{{ playOutput || playError }}</pre></div>
    <button v-if="isStageCompleted('play')" class="mission-secondary-action" type="button" data-testid="level-2-continue-to-predict" @click="continueTo('predict')">{{ copy.continueToPredict }} →</button>
  </section>

  <section v-show="activeStage === 'predict'" class="mission-stage" data-testid="level-2-investigation">
    <span class="journey-eyebrow">Think / Predict</span><h3>{{ getLocalizedText(level.predict.prompt) }}</h3>
    <pre id="level-2-broken-code" class="lesson-code-block"><code>{{ level.play.example }}</code></pre>
    <div v-if="playError" class="mission-callout" id="level-2-error-output" data-testid="level-2-investigation-error"><strong>{{ copy.error }}</strong><pre>{{ playError }}</pre><p id="investigation-evidence">{{ getLocalizedText(level.errorExplanation || level.preview) }}</p></div>
    <fieldset class="predict-options"><legend class="sr-only">{{ getLocalizedText(level.predict.prompt) }}</legend><label v-for="option in level.predict.options" :key="option.id" class="predict-option"><input :value="option.id" v-model="predictSelection" type="radio" :data-testid="`level-2-predict-option-${option.id}`" name="level-2-prediction"><span>{{ getLocalizedText(option.label) }}</span></label></fieldset>
    <button class="mission-primary-action" type="button" data-testid="level-2-predict-submit" :disabled="!predictSelection || predictPassed" @click="submitPrediction">{{ copy.checkPrediction }}</button>
    <div v-if="predictSubmitted" class="predict-feedback" :class="{ success: predictPassed }" data-testid="level-2-predict-feedback">{{ predictPassed ? copy.correct : copy.tryAgain }}</div>
    <p v-if="predictHintVisible" class="hint-message" data-testid="level-2-predict-hint"><strong>{{ copy.hint }}:</strong> {{ getLocalizedText(level.hints[0]!) }}</p>

    <div v-if="predictPassed && investigation" class="investigation-panel" data-testid="investigation-panel">
      <span class="journey-eyebrow">{{ getLocalizedText(investigation.title) }}</span><h4>{{ getLocalizedText(currentInvestigationStep!.prompt) }}</h4>
      <fieldset class="predict-options"><legend class="sr-only">{{ getLocalizedText(currentInvestigationStep!.prompt) }}</legend><label v-for="option in currentInvestigationStep!.options" :key="option.id" class="predict-option"><input :value="option.id" v-model="investigationSelection" type="radio" :data-testid="option.id === currentInvestigationStep!.correctOptionId ? `investigation-option-correct-${investigationIndex}` : `investigation-option-wrong-${investigationIndex}`" :name="`investigation-${investigationIndex}`"><span>{{ getLocalizedText(option.label) }}</span></label></fieldset>
      <button class="mission-primary-action" type="button" data-testid="investigation-submit" :disabled="!investigationSelection" @click="submitInvestigation">{{ copy.checkPrediction }}</button>
      <div v-if="investigationSubmitted" class="predict-feedback" :class="{ success: investigationPassed }" data-testid="investigation-feedback">{{ investigationPassed ? copy.correct : copy.tryAgain }}</div>
      <p v-if="investigationHintVisible" class="hint-message" data-testid="investigation-hint"><strong>{{ copy.hint }}:</strong> {{ getLocalizedText(currentInvestigationStep!.hint) }}</p>
      <button v-if="investigationPassed && investigationIndex < investigation.steps.length - 1" class="mission-secondary-action" type="button" data-testid="investigation-next" @click="nextInvestigationStep">{{ copy.continueToTest }} →</button>
    </div>

    <div v-if="investigationCompleted" class="mission-callout"><strong>{{ getLocalizedText(investigation.title) }}</strong><p>{{ getLocalizedText(level.errorExplanation || level.preview) }}</p></div>
    <div v-if="investigationCompleted" class="tour-actions"><button class="mission-primary-action" type="button" data-testid="start-tour" @click="startTour">{{ copy.startExplanation }}</button><button class="mission-secondary-action" type="button" data-testid="show-explanation-again" @click="startTour">{{ copy.showExplanationAgain }}</button><button class="mission-secondary-action" type="button" data-testid="skip-tour" @click="skipTour">{{ copy.skipTour }}</button></div>
    <button v-if="isStageCompleted('predict')" class="mission-secondary-action" type="button" data-testid="level-2-continue-to-code" @click="continueTo('code')">{{ copy.continueToCode }} →</button>
  </section>

  <section v-show="activeStage === 'code'" class="mission-stage" data-testid="level-2-code-workspace">
    <span class="journey-eyebrow">Code repair</span><h3>{{ copy.repairInstruction }}</h3><pre id="level-2-code-repair-editor" class="lesson-code-block"><code>{{ level.starterCode }}</code></pre>
    <ClientOnly fallback-tag="div" fallback="Loading Python editor…"><PythonEditor v-model="levelCode" filename="main.py" :highlight-line="null" :auto-suggestions-enabled="true" /></ClientOnly>
    <div class="mission-actions"><button class="mission-primary-action" type="button" data-testid="level-2-run-code" :disabled="!runtimeReady || executionKind" @click="runCode">▶ {{ copy.runCode }}</button><button v-if="executionKind" class="mission-secondary-action" type="button" data-testid="level-2-stop-code" @click="stopExecution">■ Stop</button><span class="runtime-status">{{ runtimeReady ? copy.runtimeReady : runtime.status.value === 'failed' ? copy.runtimeFailed : copy.runtimeLoading }}</span></div>
    <div v-if="codeOutput || codeError" class="execution-output" data-testid="level-2-code-result"><span class="output-label">{{ codeError ? copy.error : copy.actual }}</span><pre>{{ codeOutput || codeError }}</pre></div>
    <button v-if="isStageCompleted('code')" class="mission-secondary-action" type="button" data-testid="level-2-continue-to-test" @click="continueTo('test')">{{ copy.continueToTest }} →</button>
  </section>

  <section v-show="activeStage === 'test'" class="mission-stage" data-testid="level-2-test-workspace">
    <span class="journey-eyebrow">Test</span><h3>{{ copy.level2TestInstruction }}</h3>
    <div class="sample-tests"><div class="section-heading"><span class="journey-eyebrow">{{ copy.sampleTests }}</span><h4>{{ level.testCases.length }} test cases</h4></div><article v-for="testCase in level.testCases" :key="testCase.id" class="sample-test-card"><strong>{{ testCase.id }}</strong><span>{{ testCase.expectedError ? formatExpectedError(testCase.expectedError) : testCase.expectedOutput }}</span></article></div>
    <button class="mission-primary-action" type="button" data-testid="level-2-test-code" :disabled="!runtimeReady || executionKind" @click="testCode">✓ {{ copy.testCode }}</button>
    <div v-for="testCase in level.testCases" :key="`result-${testCase.id}`" class="test-result-card" :data-testid="`level-2-test-case-${testCase.id}`"><div class="test-result-heading"><strong>{{ testCase.id }}</strong><span :class="currentTestResults.get(testCase.id) ? (currentTestResults.get(testCase.id)?.passed ? 'test-pass' : 'test-fail') : 'test-pending'">{{ currentTestResults.get(testCase.id) ? (currentTestResults.get(testCase.id)?.passed ? copy.pass : copy.fail) : '—' }}</span></div><template v-if="currentTestResults.get(testCase.id)"><div class="test-detail"><span>{{ copy.expected }}</span><pre>{{ currentTestResults.get(testCase.id)?.expected ?? copy.noError }}</pre></div><div class="test-detail"><span>{{ copy.actual }}</span><pre>{{ currentTestResults.get(testCase.id)?.actual ?? copy.noError }}</pre></div><div class="test-detail"><span>{{ copy.error }}</span><pre>{{ currentTestResults.get(testCase.id)?.error || copy.noError }}</pre></div></template></div>
    <div v-if="mastered" class="mastery-banner" data-testid="level-2-mastery-banner"><strong>✓ {{ copy.masteryAchieved }}</strong><span>{{ copy.masteryHelp }}</span></div>
  </section>
</template>
