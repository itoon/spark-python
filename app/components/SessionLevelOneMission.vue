<script setup lang="ts">
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
const predictSelection = ref('')
const predictSubmitted = ref(false)
const predictPassed = ref(false)
const hintLevel = ref(0)
const playOutput = ref('')
const playError = ref('')
const codeOutput = ref('')
const codeError = ref('')
const testResults = ref<TestResult[]>([])
const testHintLevel = ref(0)
const runInputs = ref<string[]>([])
const awaitingInput = ref(false)
const inputPrompt = ref('')
const inputValue = ref('')
const executionKind = ref<'play' | 'run' | 'test' | null>(null)
const testRunning = ref(false)
let cancelActiveRun: (() => void) | undefined

const runtimeReady = computed(() => runtime.status.value === 'ready')
const currentTestResults = computed(() => new Map(testResults.value.map((result) => [result.id, result])))

function getLocalizedText(value: { en: string; th: string }) {
  return value[props.locale]
}

function isStageCompleted(stage: SessionStage) {
  return props.completedStages.includes(stage)
}

function continueTo(stage: SessionStage) {
  if (props.level.availableStages.includes(stage)) emit('update:activeStage', stage)
}

function removeAutomaticFinalNewline(value: string) {
  return value.replace(/\r?\n$/, '')
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
      if (status === 'failed') {
        finishRun(null)
      } else if (result && status === 'ready') {
        finishRun(result)
      }
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
  executionKind.value = 'play'
  playOutput.value = ''
  playError.value = ''
  const result = await runWithRuntime({ files: { 'main.py': props.level.play.example }, entry: 'main.py', trace: false, inputs: [] })
  executionKind.value = null
  if (!result) return
  playOutput.value = result.stdout
  playError.value = result.error || result.stderr
  if (!result.error) emit('stage-completed', 'play')
}

function submitPrediction() {
  predictSubmitted.value = true
  predictPassed.value = props.level.predict.correctOptionIds?.length === 1
    && props.level.predict.correctOptionIds[0] === predictSelection.value
  if (predictPassed.value) emit('stage-completed', 'predict')
}

function showNextHint() {
  hintLevel.value = Math.min(hintLevel.value + 1, props.level.hints.length)
}

function showNextTestHint() {
  testHintLevel.value = Math.min(testHintLevel.value + 1, props.level.hints.length)
}

function resetMissionActivity() {
  cancelActiveRun?.()
  if (executionKind.value) runtime.stop()
  levelCode.value = props.level.starterCode
  predictSelection.value = ''
  predictSubmitted.value = false
  predictPassed.value = false
  hintLevel.value = 0
  playOutput.value = ''
  playError.value = ''
  codeOutput.value = ''
  codeError.value = ''
  testResults.value = []
  testHintLevel.value = 0
  runInputs.value = []
  awaitingInput.value = false
  inputPrompt.value = ''
  inputValue.value = ''
  executionKind.value = null
  testRunning.value = false
}

function stopExecution() {
  cancelActiveRun?.()
  runtime.stop()
  executionKind.value = null
  testRunning.value = false
  awaitingInput.value = false
  inputPrompt.value = ''
  inputValue.value = ''
  codeError.value = copy.value.executionStopped
}

async function runCode() {
  if (!runtimeReady.value || executionKind.value) return
  executionKind.value = 'run'
  runInputs.value = []
  awaitingInput.value = false
  inputPrompt.value = ''
  codeOutput.value = ''
  codeError.value = ''
  const result = await runWithRuntime({ files: { 'main.py': levelCode.value }, entry: 'main.py', trace: false, inputs: [] })
  executionKind.value = null
  if (!result) {
    codeError.value = runtime.error.value || copy.value.runtimeFailed
    return
  }
  applyRunResult(result)
}

function applyRunResult(result: PythonRunResult) {
  codeOutput.value = result.stdout
  codeError.value = result.error || result.stderr
  if (result.needsInput) {
    awaitingInput.value = true
    inputPrompt.value = result.inputPrompt || ''
    return
  }
  awaitingInput.value = false
  inputPrompt.value = ''
  if (!result.error) emit('stage-completed', 'code')
}

async function submitInput() {
  if (!awaitingInput.value || executionKind.value) return
  const submittedPrompt = inputPrompt.value || 'Python input'
  runInputs.value = [...runInputs.value, inputValue.value]
  inputValue.value = ''
  awaitingInput.value = false
  inputPrompt.value = ''
  executionKind.value = 'run'
  const result = await runWithRuntime({ files: { 'main.py': levelCode.value }, entry: 'main.py', trace: false, inputs: [...runInputs.value] })
  executionKind.value = null
  if (result) {
    applyRunResult(result)
  } else {
    awaitingInput.value = true
    inputPrompt.value = submittedPrompt
    codeError.value = runtime.error.value || copy.value.runtimeFailed
  }
}

async function testCode() {
  if (!runtimeReady.value || executionKind.value) return
  testRunning.value = true
  executionKind.value = 'test'
  testResults.value = []
  testHintLevel.value = 0
  for (const testCase of props.level.testCases) {
    const result = await runWithRuntime({ files: { 'main.py': levelCode.value }, entry: 'main.py', trace: false, inputs: [...testCase.input] })
    const expected = testCase.expectedOutput || ''
    const actual = result?.stdout || ''
    const error = result?.error || result?.stderr || (!result ? runtime.error.value || copy.value.runtimeFailed : '')
    testResults.value.push({
      id: testCase.id,
      passed: Boolean(result && !error && removeAutomaticFinalNewline(actual) === expected),
      expected,
      actual,
      error,
    })
  }
  executionKind.value = null
  testRunning.value = false
  const hasPassingTest = testResults.value.some((result) => result.passed)
  if (hasPassingTest) emit('stage-completed', 'test')
}

watch(() => props.completedStages, (stages) => {
  if (!stages.length) resetMissionActivity()
})

onMounted(() => runtime.start())
</script>

<template>
  <section v-if="activeStage === 'play'" class="mission-stage" data-testid="play-stage">
    <span class="journey-eyebrow">Play</span><h3>{{ getLocalizedText(level.play.instruction) }}</h3><p class="stage-instruction">{{ getLocalizedText(level.preview) }}</p>
    <pre class="lesson-code-block"><code>{{ level.play.example }}</code></pre>
    <button class="mission-primary-action" type="button" data-testid="play-run" :disabled="!runtimeReady || executionKind" @click="runPlayExample">▶ {{ copy.runExample }}</button>
    <div v-if="playOutput || playError" class="execution-output" data-testid="play-output"><span class="output-label">{{ playError ? copy.error : copy.actual }}</span><pre>{{ playOutput || playError }}</pre></div>
    <button v-if="isStageCompleted('play')" class="mission-secondary-action" type="button" data-testid="continue-to-predict" @click="continueTo('predict')">{{ copy.continueToPredict }} →</button>
  </section>

  <section v-else-if="activeStage === 'predict'" class="mission-stage" data-testid="predict-stage">
    <span class="journey-eyebrow">Think / Predict</span><h3>{{ getLocalizedText(level.predict.prompt) }}</h3><pre class="lesson-code-block"><code>{{ level.play.example }}</code></pre>
    <fieldset class="predict-options"><legend class="sr-only">{{ getLocalizedText(level.predict.prompt) }}</legend><label v-for="option in level.predict.options" :key="option.id" class="predict-option"><input :value="option.id" v-model="predictSelection" type="radio" :data-testid="`predict-option-${option.id}`" name="level-1-prediction"><span>{{ getLocalizedText(option.label) }}</span></label></fieldset>
    <button class="mission-primary-action" type="button" data-testid="predict-submit" :disabled="!predictSelection" @click="submitPrediction">{{ copy.checkPrediction }}</button>
    <div v-if="predictSubmitted" class="predict-feedback" :class="{ success: predictPassed }" data-testid="predict-feedback">{{ predictPassed ? copy.correct : copy.tryAgain }}</div>
    <button v-if="predictSubmitted && !predictPassed && hintLevel < level.hints.length" class="hint-button" type="button" data-testid="show-hint" @click="showNextHint">{{ copy.showHint }}</button>
    <p v-if="hintLevel" class="hint-message" data-testid="hint-1"><strong>{{ copy.hint }}:</strong> {{ getLocalizedText(level.hints[hintLevel - 1]!) }}</p>
    <button v-if="isStageCompleted('predict')" class="mission-secondary-action" type="button" data-testid="continue-to-code" @click="continueTo('code')">{{ copy.continueToCode }} →</button>
  </section>

  <section v-else-if="activeStage === 'code'" class="mission-stage" data-testid="code-workspace">
    <span class="journey-eyebrow">Code</span><h3>{{ copy.codeInstruction }}</h3>
    <ClientOnly fallback-tag="div" fallback="Loading Python editor…"><PythonEditor v-model="levelCode" filename="main.py" :highlight-line="null" :auto-suggestions-enabled="true" /></ClientOnly>
    <div class="mission-actions"><button class="mission-primary-action" type="button" data-testid="run-code" :disabled="!runtimeReady || executionKind || awaitingInput" @click="runCode">▶ {{ copy.runCode }}</button><button v-if="executionKind" class="mission-secondary-action" type="button" data-testid="stop-code" @click="stopExecution">■ Stop</button><span class="runtime-status">{{ runtimeReady ? copy.runtimeReady : runtime.status.value === 'failed' ? copy.runtimeFailed : copy.runtimeLoading }}</span></div>
    <form v-if="awaitingInput" class="interactive-input" data-testid="interactive-input" autocomplete="off" @submit.prevent="submitInput"><label for="mission-input">{{ inputPrompt }}</label><div><input id="mission-input" v-model="inputValue" data-testid="interactive-input-field" type="text" spellcheck="false" :aria-label="inputPrompt || 'Python input'" autofocus><button class="mission-secondary-action" data-testid="interactive-input-submit" type="submit">Enter ↵</button></div></form>
    <div v-if="codeOutput || codeError" class="execution-output" data-testid="code-result"><span class="output-label">{{ codeError ? copy.error : copy.actual }}</span><pre>{{ codeOutput || codeError }}</pre></div>
    <button v-if="isStageCompleted('code')" class="mission-secondary-action" type="button" data-testid="continue-to-test" @click="continueTo('test')">{{ copy.continueToTest }} →</button>
  </section>

  <section v-else-if="activeStage === 'test'" class="mission-stage" data-testid="test-workspace">
    <span class="journey-eyebrow">Test</span><h3>{{ copy.testInstruction }}</h3>
    <div class="sample-tests"><div class="section-heading"><span class="journey-eyebrow">{{ copy.sampleTests }}</span><h4>{{ level.testCases.length }} test case</h4></div><article v-for="testCase in level.testCases" :key="testCase.id" class="sample-test-card"><strong>{{ testCase.id }}</strong><span>{{ testCase.input.length ? testCase.input.join(', ') : copy.noInput }}</span><code>{{ testCase.expectedOutput }}</code></article></div>
    <button class="mission-primary-action" type="button" data-testid="test-code" :disabled="!runtimeReady || executionKind || testRunning" @click="testCode">✓ {{ copy.testCode }}</button>
    <div v-for="testCase in level.testCases" :key="`result-${testCase.id}`" class="test-result-card" :data-testid="`test-case-${testCase.id}`"><div class="test-result-heading"><strong>{{ testCase.id }}</strong><span :class="currentTestResults.get(testCase.id) ? (currentTestResults.get(testCase.id)?.passed ? 'test-pass' : 'test-fail') : 'test-pending'">{{ currentTestResults.get(testCase.id) ? (currentTestResults.get(testCase.id)?.passed ? copy.pass : copy.fail) : '—' }}</span></div><template v-if="currentTestResults.get(testCase.id)"><div class="test-detail"><span>{{ copy.expected }}</span><pre>{{ currentTestResults.get(testCase.id)?.expected ?? copy.noError }}</pre></div><div class="test-detail"><span>{{ copy.actual }}</span><pre>{{ currentTestResults.get(testCase.id)?.actual ?? copy.noError }}</pre></div><div class="test-detail"><span>{{ copy.error }}</span><pre>{{ currentTestResults.get(testCase.id)?.error || copy.noError }}</pre></div></template></div>
    <button v-if="testResults.some((result) => !result.passed) && testHintLevel < level.hints.length" class="hint-button" type="button" data-testid="test-show-hint" @click="showNextTestHint">{{ copy.showHint }}</button><p v-if="testHintLevel" class="hint-message" data-testid="test-hint"><strong>{{ copy.hint }}:</strong> {{ getLocalizedText(level.hints[testHintLevel - 1]!) }}</p>
    <div v-if="mastered" class="mastery-banner" data-testid="mastery-banner"><strong>✓ {{ copy.masteryAchieved }}</strong><span>{{ copy.masteryHelp }}</span></div>
  </section>
</template>
