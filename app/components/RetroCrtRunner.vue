<script setup lang="ts">
// Prototype 2: run the Python Lab project inside the CRT from
// ref/retro_spark_python_runner.html.

const props = defineProps<{
  open: boolean
  running: boolean
  waiting: boolean
  stdout: string
  stderr: string
  error: string | null
  inputPrompt: string
}>()

const emit = defineEmits<{
  close: []
  run: []
  'submit-input': [value: string]
}>()

type Line = { text: string; tone?: 'error' }

const terminal = ref<HTMLElement | null>(null)
const answerEl = ref<HTMLElement | null>(null)
const lines = ref<Line[]>([{ text: 'Ready — press RUN' }])
const typing = ref(false)
const showCursor = ref(true)
const showPrompt = ref(false)
const promptText = ref('')
const answer = ref('')
let typedStdout = ''
let typedStderr = ''
let typedError = ''
let typedPrompt = ''
let submittedEcho = ''
let token = 0

const ledOn = computed(
  () => props.running || props.waiting || typing.value,
)

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function scrollTerminal() {
  nextTick(() => {
    if (terminal.value) terminal.value.scrollTop = terminal.value.scrollHeight
  })
}

function resetTerminal(message = 'Ready — press RUN') {
  token += 1
  typedStdout = ''
  typedStderr = ''
  typedError = ''
  typedPrompt = ''
  submittedEcho = ''
  answer.value = ''
  showPrompt.value = false
  promptText.value = ''
  typing.value = false
  showCursor.value = true
  lines.value = [{ text: message }]
}

async function typeChars(
  target: 'stdout' | 'stderr' | 'error' | 'prompt',
  source: string,
  runId: number,
  speed = 22,
) {
  const box = () =>
    target === 'stdout'
      ? typedStdout
      : target === 'stderr'
        ? typedStderr
        : target === 'error'
          ? typedError
          : typedPrompt
  const setBox = (value: string) => {
    if (target === 'stdout') typedStdout = value
    else if (target === 'stderr') typedStderr = value
    else if (target === 'error') typedError = value
    else typedPrompt = value
  }
  if (!source.startsWith(box())) setBox('')
  while (box().length < source.length) {
    if (runId !== token) return
    const next = source[box().length] || ''
    setBox(box() + next)
    if (target === 'prompt') promptText.value = typedPrompt
    rebuild(target === 'prompt' || showPrompt.value)
    await sleep(next === ' ' ? speed * 0.45 : speed)
  }
}

function stdoutLines() {
  const text = typedStdout
  if (!text) return [] as Line[]
  const parts = text.split('\n')
  if (text.endsWith('\n')) parts.pop()
  return parts.map((line) => ({ text: line }))
}

function rebuild(keepPrompt = true) {
  const next: Line[] = stdoutLines()
  if (typedStderr) {
    for (const line of typedStderr.split('\n')) {
      if (line) next.push({ text: line, tone: 'error' })
    }
  }
  if (typedError) next.push({ text: typedError, tone: 'error' })
  if (keepPrompt && (showPrompt.value || promptText.value)) {
    if (promptText.value) next.push({ text: promptText.value })
  }
  if (!next.length && !showPrompt.value)
    next.push({ text: ledOn.value ? 'Running…' : 'Ready — press RUN' })
  lines.value = next
  scrollTerminal()
}

async function consumeOutput() {
  const runId = ++token
  typing.value = true
  showCursor.value = !props.waiting
  if ((props.stdout || '').length < typedStdout.length) {
    typedStdout = ''
    typedStderr = ''
    typedError = ''
    typedPrompt = ''
    promptText.value = ''
    showPrompt.value = false
  }
  if (submittedEcho && (props.stdout || '').includes(submittedEcho)) {
    const skipUntil =
      (props.stdout || '').indexOf(submittedEcho) + submittedEcho.length
    if (typedStdout.length < skipUntil)
      typedStdout = (props.stdout || '').slice(0, skipUntil)
    submittedEcho = ''
  }
  if (!typedStdout && !typedStderr && !typedError) {
    lines.value = [{ text: '' }]
  }
  await typeChars('stdout', props.stdout || '', runId)
  if (runId !== token) return
  await typeChars('stderr', props.stderr || '', runId, 12)
  if (runId !== token) return
  await typeChars('error', props.error || '', runId, 12)
  if (runId !== token) return
  rebuild(false)
  if (props.waiting && props.inputPrompt) {
    await typeChars('prompt', props.inputPrompt, runId, 18)
    promptText.value = typedPrompt
    showPrompt.value = true
    rebuild(true)
    await nextTick()
    focusAnswer()
  } else {
    showPrompt.value = false
    promptText.value = typedPrompt
    showCursor.value = true
    rebuild(false)
  }
  typing.value = false
}

function focusAnswer() {
  const el = answerEl.value
  if (!el) return
  el.focus({ preventScroll: true })
  const range = document.createRange()
  const selection = window.getSelection()
  range.selectNodeContents(el)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
  el.scrollIntoView({ block: 'nearest' })
}

function submitAnswer() {
  const value = answer.value.replace(/\n/g, '').trim()
  if (!value || typing.value) return
  submittedEcho = `${typedPrompt}${value}\n`
  showPrompt.value = false
  typedPrompt = ''
  promptText.value = ''
  emit('submit-input', value)
  answer.value = ''
  if (answerEl.value) answerEl.value.textContent = ''
}

function onAnswerInput(event: Event) {
  const el = event.target as HTMLElement
  const cleaned = (el.textContent || '').replace(/\n/g, '')
  answer.value = cleaned
  if (el.textContent !== cleaned) el.textContent = cleaned
  focusAnswer()
}

function onAnswerKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    submitAnswer()
  }
}

function onAnswerPaste(event: ClipboardEvent) {
  event.preventDefault()
  const text = (event.clipboardData?.getData('text/plain') || '').replace(
    /\n/g,
    '',
  )
  document.execCommand('insertText', false, text)
}

function close() {
  resetTerminal()
  emit('close')
}

function runAgain() {
  typedStdout = ''
  typedStderr = ''
  typedError = ''
  typedPrompt = ''
  answer.value = ''
  showPrompt.value = false
  promptText.value = ''
  lines.value = [{ text: '' }]
  emit('run')
}

watch(
  () => props.open,
  (open) => {
    if (open) resetTerminal('Ready — press RUN')
    else resetTerminal()
  },
)

watch(
  () => [props.stdout, props.stderr, props.error, props.waiting, props.inputPrompt],
  () => {
    if (!props.open) return
    consumeOutput()
  },
)

watch(showPrompt, (value) => {
  if (value) nextTick(() => focusAnswer())
})

function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) close()
}

onMounted(() => window.addEventListener('keydown', onEscape))
onBeforeUnmount(() => window.removeEventListener('keydown', onEscape))
</script>

<template>
  <div v-if="open" class="retro-backdrop" @click.self="close">
    <section class="stage" aria-label="Retro Spark Coding Lab Python terminal">
      <div class="monitor">
        <div class="brand">RETRO Spark Coding Lab</div>
        <button class="settings-open" type="button" @click="close">✕ CLOSE</button>
        <div class="screen-shell">
          <div class="screen">
            <div ref="terminal" class="terminal" @click="focusAnswer">
              <div
                v-for="(line, index) in lines"
                :key="`${index}-${line.text}`"
                class="line"
                :class="{ 'error-line': line.tone === 'error' }"
              >{{ line.text }}</div>
              <div v-if="showPrompt" class="line prompt-line">
                <span class="prompt-mark">&gt;</span>
                <span
                  ref="answerEl"
                  class="answer"
                  contenteditable="true"
                  role="textbox"
                  spellcheck="false"
                  @keydown="onAnswerKeydown"
                  @input="onAnswerInput"
                  @paste="onAnswerPaste"
                />
              </div>
              <div v-else-if="showCursor" class="line"><span class="crt-cursor" /></div>
            </div>
            <div class="noise" />
          </div>
        </div>
        <div class="controls">
          <div class="run-wrap">
            <button
              class="run-button"
              type="button"
              :disabled="running || waiting || typing"
              @click="runAgain"
            >RUN</button>
            <div class="run-led" :class="{ active: ledOn }" />
            <span class="tiny-label">{{
              waiting
                ? 'Type on the screen, then press Enter.'
                : 'Click Run to run the Python project.'
            }}</span>
          </div>
          <div class="right-controls" aria-hidden="true">
            <div class="knob" />
            <div class="power"><div class="power-dot" /></div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.retro-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 40%, rgba(41, 255, 107, 0.06), transparent 34%),
    rgba(8, 10, 9, 0.94);
}
.stage {
  width: min(95vw, 1020px);
  aspect-ratio: 4 / 3;
  display: grid;
  place-items: center;
}
.monitor {
  position: relative;
  width: 85%;
  aspect-ratio: 1.26 / 1;
  border-radius: 32px 32px 42px 42px;
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.55), transparent 17%),
    linear-gradient(180deg, #ddd7c4 0%, #d4cfbb 55%, #bdb6a1 100%);
  border: 1px solid #eee8d5;
  box-shadow:
    0 28px 70px rgba(0, 0, 0, 0.64),
    inset 0 0 0 2px rgba(255, 255, 255, 0.16),
    inset 0 -12px 22px rgba(83, 76, 61, 0.2);
}
.brand {
  position: absolute;
  top: 3.6%;
  left: 7.4%;
  color: #44443e;
  font: 700 clamp(13px, 1.75vw, 19px) / 1 Georgia, serif;
  letter-spacing: 0.05em;
  user-select: none;
}
.settings-open {
  position: absolute;
  top: 2.55%;
  right: 7.2%;
  border: 1px solid #817d72;
  background: linear-gradient(#ebe5d3, #bdb6a1);
  color: #4b4943;
  border-radius: 7px;
  padding: 7px 11px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 2px 0 #8d8778;
}
.screen-shell {
  position: absolute;
  left: 6.2%;
  right: 6.2%;
  top: 9.3%;
  bottom: 19.5%;
  padding: 2.1%;
  border-radius: 23px;
  background: linear-gradient(145deg, #63675f, #252925 47%, #111311);
  box-shadow:
    inset 0 0 0 2px #74796f,
    inset 0 10px 25px rgba(255, 255, 255, 0.08),
    0 1px 0 rgba(255, 255, 255, 0.22);
}
.screen {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: 20% / 10%;
  background:
    radial-gradient(ellipse at 50% 45%, rgba(21, 73, 47, 0.25), transparent 67%),
    linear-gradient(180deg, #06150e, #020906);
  box-shadow:
    inset 0 0 62px rgba(0, 0, 0, 0.95),
    inset 0 0 18px rgba(41, 255, 107, 0.05);
}
.screen::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  background: linear-gradient(rgba(255, 255, 255, 0.03) 50%, rgba(0, 0, 0, 0.12) 50%);
  background-size: 100% 4px;
  opacity: 0.52;
  mix-blend-mode: overlay;
}
.screen::after {
  content: "";
  position: absolute;
  inset: -10%;
  z-index: 5;
  pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 54%, rgba(0, 0, 0, 0.46) 78%, rgba(0, 0, 0, 0.8) 100%);
}
.terminal {
  position: absolute;
  inset: 7.5% 8.5%;
  z-index: 2;
  overflow-y: auto;
  scrollbar-width: none;
  color: #f4f7f4;
  font-family: "Courier New", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: clamp(17px, 2.25vw, 29px);
  line-height: 1.45;
  letter-spacing: 0.005em;
  text-shadow: 0 0 4px rgba(255, 255, 255, 0.23);
}
.terminal::-webkit-scrollbar { display: none; }
.line {
  min-height: 1.45em;
  white-space: pre-wrap;
  word-break: break-word;
}
.prompt-line {
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  flex-wrap: wrap;
}
.prompt-mark {
  color: #29ff6b;
  text-shadow: 0 0 8px rgba(41, 255, 107, 0.55);
}
.answer {
  display: inline-block;
  min-width: 1ch;
  outline: none;
  color: #f4f7f4;
  caret-color: transparent;
  white-space: pre;
}
.answer::after,
.crt-cursor::after {
  content: "";
  display: inline-block;
  width: 0.57em;
  height: 1.02em;
  margin-left: 0.08em;
  vertical-align: -0.12em;
  background: #29ff6b;
  box-shadow: 0 0 8px rgba(41, 255, 107, 0.75);
  animation: blink 0.72s steps(1, end) infinite;
}
.answer[contenteditable="false"]::after { display: none; }
.crt-cursor { display: inline-block; }
.error-line {
  color: #ff5b62;
  text-shadow: 0 0 8px rgba(255, 91, 98, 0.24);
}
@keyframes blink {
  0%, 47% { opacity: 1; }
  48%, 100% { opacity: 0; }
}
.noise {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  opacity: 0.06;
  background-image: repeating-radial-gradient(circle at 0 0, transparent 0, rgba(255, 255, 255, 0.2) 1px, transparent 2px);
  background-size: 5px 5px;
  animation: noise 0.18s steps(2) infinite;
}
@keyframes noise {
  0% { transform: translate(0, 0); }
  25% { transform: translate(1px, -1px); }
  50% { transform: translate(-1px, 1px); }
  75% { transform: translate(1px, 1px); }
  100% { transform: translate(0, 0); }
}
.controls {
  position: absolute;
  left: 7%;
  right: 7%;
  bottom: 5%;
  height: 10%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.run-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.run-button {
  appearance: none;
  border: 1px solid #777267;
  background: linear-gradient(180deg, #ece7d6, #c2bba6);
  border-radius: 7px;
  padding: 10px 18px 9px;
  color: #34332f;
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0.08em;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75), 0 3px 0 #8c8677, 0 5px 10px rgba(0, 0, 0, 0.25);
}
.run-button:active { transform: translateY(2px); }
.run-button:disabled { opacity: 0.7; cursor: not-allowed; }
.run-led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6c6a62;
}
.run-led.active {
  background: #29ff6b;
  box-shadow: 0 0 8px #29ff6b, 0 0 16px rgba(41, 255, 107, 0.5);
}
.tiny-label {
  color: #6f6a5f;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.right-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}
.knob {
  width: 31px;
  height: 31px;
  border-radius: 50%;
  border: 2px solid #817d72;
  background: radial-gradient(circle at 35% 30%, #e6e2d5 0 20%, #aaa596 55%, #777368 100%);
  position: relative;
}
.knob::after {
  content: "";
  position: absolute;
  top: 4px;
  left: 50%;
  width: 2px;
  height: 9px;
  transform: translateX(-50%);
  background: #555249;
}
.power {
  width: 34px;
  height: 34px;
  border-radius: 5px;
  border: 2px solid #8c887d;
  background: linear-gradient(#89867e, #5f5d57);
  display: grid;
  place-items: center;
}
.power-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #29ff6b;
  box-shadow: 0 0 8px #29ff6b;
}
@media (max-width: 650px) {
  .monitor { width: 99%; }
  .terminal { inset: 8%; }
  .tiny-label { display: none; }
  .run-button { font-size: 11px; padding: 8px 13px; }
  .settings-open { font-size: 10px; }
}
</style>
