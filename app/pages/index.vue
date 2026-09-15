<script setup lang="ts">
import type { PythonRunResult, TraceStep, VariableValue } from '~/composables/usePythonRuntime'

const starterFiles: Record<string, string> = {
  'main.py': `from player import Player\nfrom utils import calculate_score\n\nplayer = Player("Codi")\nscore = calculate_score(10, 20)\n\nprint(player.greet())\nprint("Score:", score)\n`,
  'player.py': `class Player:\n    def __init__(self, name):\n        self.name = name\n\n    def greet(self):\n        return f"Hello, {self.name}!"\n`,
  'utils.py': `def calculate_score(a, b):\n    result = a + b\n    return result\n`,
}

const files = ref<Record<string, string>>({ ...starterFiles })
const activeFile = ref('main.py')
const entryFile = ref('main.py')
const highlightLine = ref<number | null>(null)
const editorKey = ref(0)
const runtime = usePythonRuntime()
const fileInput = ref<HTMLInputElement | null>(null)
const consoleLines = ref<{ text: string; tone?: string }[]>([
  { text: 'Ready. Press Run to start the project main file, or Run file to execute the selected file.', tone: 'console-dim' },
])
const modalOpen = ref(false)
const modalMode = ref<'new' | 'rename'>('new')
const modalName = ref('module.py')
const modalError = ref('')
const settingsOpen = ref(false)
const autoSuggestionsEnabled = ref(true)
const activeInputs = ref<string[]>([])
const awaitingInput = ref(false)
const inputPrompt = ref('')
const currentRunEntry = ref('main.py')
const activeRunTraceMode = ref(false)
const trace = ref<TraceStep[]>([])
const traceIndex = ref(-1)
const maxVisitedTraceIndex = ref(-1)
const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const sortedFiles = computed(() => Object.keys(files.value).sort((a, b) => a === entryFile.value ? -1 : b === entryFile.value ? 1 : a.localeCompare(b)))
const currentStep = computed(() => trace.value[traceIndex.value])
const currentLineBadge = computed(() => currentStep.value ? currentStep.value.event === 'return' && currentStep.value.function === '<module>' && currentStep.value.file === currentRunEntry.value ? 'Done' : `${currentStep.value.file}:${currentStep.value.line}` : '—')
const timelineSteps = computed(() => trace.value.slice(0, maxVisitedTraceIndex.value + 1).map((step, index) => ({ step, index })).reverse())
const currentVariables = computed(() => Object.entries(currentStep.value?.locals || {}).sort(([a], [b]) => a.localeCompare(b)))
const previousVariables = computed(() => trace.value[traceIndex.value - 1]?.locals || {})
const currentStack = computed(() => (currentStep.value?.stack || []).slice().reverse())
const runtimeLabel = computed(() => {
  if (runtime.status.value === 'debugging') return `Debugging ${currentRunEntry.value}…`
  if (runtime.status.value === 'running') return `Running ${currentRunEntry.value}…`
  if (runtime.status.value === 'failed') return 'Runtime: failed'
  if (runtime.status.value === 'loading') return 'Runtime: loading Pyodide…'
  if (runtime.status.value === 'waiting') return 'Runtime: waiting for input…'
  return 'Runtime: ready'
})

function loadFiles() {
  try {
    const saved = JSON.parse(localStorage.getItem('cv-python-lab-files') || 'null')
    if (saved && Object.keys(saved).length) files.value = saved
  } catch { /* local storage can be unavailable in private browsing */ }
  activeFile.value = files.value['main.py'] ? 'main.py' : Object.keys(files.value)[0]
  entryFile.value = activeFile.value
}

function saveFiles() {
  if (!import.meta.client) return
  localStorage.setItem('cv-python-lab-files', JSON.stringify(files.value))
}

function loadSettings() {
  if (!import.meta.client) return
  autoSuggestionsEnabled.value = localStorage.getItem('cv-python-lab-auto-suggestions') !== 'false'
}

function saveSettings() {
  if (!import.meta.client) return
  localStorage.setItem('cv-python-lab-auto-suggestions', String(autoSuggestionsEnabled.value))
}

function showToast(message: string) {
  toastMessage.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMessage.value = '' }, 1600)
}

function appendConsole(text: string, tone?: string) {
  if (text) consoleLines.value.push({ text, tone })
}

function clearConsole() { consoleLines.value = [] }

function switchFile(name: string, line: number | null = null) {
  if (!(name in files.value)) return
  activeFile.value = name
  highlightLine.value = line
  editorKey.value++
}

function updateActiveFile(value: string) {
  files.value = { ...files.value, [activeFile.value]: value }
  if (import.meta.client) saveFiles()
}

function resetDebug() {
  trace.value = []
  traceIndex.value = -1
  maxVisitedTraceIndex.value = -1
  highlightLine.value = null
}

function renderStep(index: number) {
  const step = trace.value[index]
  if (!step) return
  traceIndex.value = index
  switchFile(step.file, step.line)
}

function updateTrace(result: PythonRunResult, index = 0) {
  trace.value = result.trace || []
  if (!trace.value.length) return
  traceIndex.value = Math.min(Math.max(index, 0), trace.value.length - 1)
  maxVisitedTraceIndex.value = traceIndex.value
  renderStep(traceIndex.value)
}

function startRun(traceMode: boolean, runEntry = activeFile.value) {
  if (runtime.status.value === 'loading') return showToast('Python runtime is still loading')
  if (runtime.status.value === 'failed') return showToast('Python runtime failed to start')
  if (runtime.status.value === 'running' || runtime.status.value === 'debugging') {
    return showToast('Stop the current run before starting another')
  }
  if (!(runEntry in files.value)) return showToast(`Cannot run ${runEntry}`)
  if (import.meta.client) saveFiles()
  activeInputs.value = []
  inputPrompt.value = ''
  activeRunTraceMode.value = traceMode
  currentRunEntry.value = runEntry
  resetDebug()
  clearConsole()
  appendConsole(`${traceMode ? 'Debugging' : 'Running'} ${runEntry}…\n`, 'console-dim')
  runtime.run({ files: { ...files.value }, entry: runEntry, trace: traceMode, inputs: [] })
}

function stopRun() {
  awaitingInput.value = false
  activeInputs.value = []
  appendConsole('\nExecution stopped.\n', 'console-error')
  resetDebug()
  runtime.stop()
}

function handleRunResult(result: PythonRunResult) {
  clearConsole()
  appendConsole(result.stdout)
  appendConsole(result.stderr, 'console-error')
  if (result.needsInput) {
    // Keep the partial debug session visible while Python is paused at input().
    // The next submission replays the program and replaces it with the full trace.
    if (activeRunTraceMode.value) {
      const partialTrace = [...(result.trace || [])]
      // Raising the pause exception unwinds the current frames, so the tracer
      // can append synthetic return events even though the program is not done.
      while (partialTrace.at(-1)?.event === 'return') partialTrace.pop()
      updateTrace({ ...result, trace: partialTrace }, partialTrace.length - 1)
    }
    awaitingInput.value = true
    inputPrompt.value = result.inputPrompt || ''
    runtime.status.value = 'waiting'
    appendConsole(result.error || '', 'console-error')
    return
  }
  awaitingInput.value = false
  inputPrompt.value = ''
  appendConsole(result.error || '', 'console-error')
  if (!result.stdout && !result.stderr && !result.error) appendConsole('Program finished with no output.\n', 'console-dim')
  if (result.trace?.length) {
    updateTrace(result)
    if (result.traceTruncated) appendConsole('\nTrace stopped at 10,000 steps.\n', 'console-error')
  }
}

function dispatchInput() {
  if (!awaitingInput.value) return
  const submittedPrompt = inputPrompt.value
  activeInputs.value = [...activeInputs.value, inputValue.value]
  inputValue.value = ''
  awaitingInput.value = false
  inputPrompt.value = ''
  const resumed = runtime.run({ files: { ...files.value }, entry: currentRunEntry.value, trace: activeRunTraceMode.value, inputs: activeInputs.value })
  if (!resumed) {
    awaitingInput.value = true
    inputPrompt.value = submittedPrompt
    showToast('Python runtime is not ready to resume')
  }
}

const inputValue = ref('')

function uniqueFileName(base = 'untitled.py') {
  if (!files.value[base]) return base
  const stem = base.replace(/\.py$/, '')
  let i = 2
  while (files.value[`${stem}_${i}.py`]) i++
  return `${stem}_${i}.py`
}

function normalizePyName(name: string) {
  const normalized = name.trim().replace(/\s+/g, '_').replace(/\.py$/i, '') + '.py'
  return /^[A-Za-z_][A-Za-z0-9_]*\.py$/.test(normalized) ? normalized : null
}

function openModal(mode: 'new' | 'rename') {
  modalMode.value = mode
  modalName.value = mode === 'rename' ? activeFile.value : uniqueFileName('module.py')
  modalError.value = ''
  modalOpen.value = true
  nextTick(() => document.querySelector<HTMLInputElement>('#file-modal-input')?.select())
}

function confirmModal() {
  const name = normalizePyName(modalName.value)
  if (!name) return (modalError.value = 'Invalid file name. Try something like game_logic.py')
  if (modalMode.value === 'new') {
    if (files.value[name]) return (modalError.value = 'A file with this name already exists.')
    files.value = { ...files.value, [name]: '# New Python module\n' }
    saveFiles()
    modalOpen.value = false
    switchFile(name)
    return showToast(`${name} created`)
  }
  if (name !== activeFile.value && files.value[name]) return (modalError.value = 'A file with this name already exists.')
  if (name === activeFile.value) return (modalOpen.value = false)
  const nextFiles = { ...files.value, [name]: files.value[activeFile.value] }
  delete nextFiles[activeFile.value]
  if (entryFile.value === activeFile.value) entryFile.value = name
  const old = activeFile.value
  files.value = nextFiles
  modalOpen.value = false
  switchFile(name)
  saveFiles()
  showToast(`${old} renamed to ${name}`)
}

function deleteActiveFile() {
  if (Object.keys(files.value).length <= 1) return showToast('Keep at least one Python file')
  if (!confirm(`Delete ${activeFile.value}?`)) return
  const old = activeFile.value
  const nextFiles = { ...files.value }
  delete nextFiles[old]
  files.value = nextFiles
  if (entryFile.value === old) entryFile.value = Object.keys(nextFiles)[0]
  activeFile.value = Object.keys(nextFiles)[0]
  saveFiles()
  switchFile(activeFile.value)
}

async function importFiles(event: Event) {
  const picked = Array.from((event.target as HTMLInputElement).files || []).filter(file => file.name.endsWith('.py'))
  const imported = { ...files.value }
  for (const file of picked) imported[normalizePyName(file.name) || file.name] = await file.text()
  files.value = imported
  saveFiles()
  if (picked.length) showToast(`Imported ${picked.length} file(s)`)
  if (fileInput.value) fileInput.value.value = ''
}

function nextStep() { if (traceIndex.value < trace.value.length - 1) { maxVisitedTraceIndex.value = Math.max(maxVisitedTraceIndex.value, traceIndex.value + 1); renderStep(traceIndex.value + 1) } }
function previousStep() { if (traceIndex.value > 0) renderStep(traceIndex.value - 1) }
function continueToEnd() { if (trace.value.length) { maxVisitedTraceIndex.value = trace.value.length - 1; renderStep(trace.value.length - 1) } }
function isProgramEnd(step: TraceStep) { return step.event === 'return' && step.function === '<module>' && step.file === currentRunEntry.value }
function traceAction(step: TraceStep) { return isProgramEnd(step) ? 'Program finished' : step.event === 'return' ? `Return from ${step.function}()` : step.function === '<module>' ? 'Run line' : `${step.function}()` }
function isChanged(value: VariableValue, key: string) { return !previousVariables.value[key] || previousVariables.value[key].repr !== value.repr }

watch(runtime.lastResult, result => { if (result) handleRunResult(result) })

onMounted(() => {
  loadFiles()
  loadSettings()
  runtime.start()
})
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-avatar" aria-hidden="true"><span class="cap" /><span class="face"><i /><b /><i /></span></div>
        <div class="brand-copy"><div class="brand-title">CodeVenture <span>Python Lab</span></div><div class="brand-subtitle">Learn Python by seeing how your code works</div></div>
      </div>
      <div class="project-chip" title="Current project"><span class="project-dot" /><div><strong>Python Basics</strong><small>{{ Object.keys(files).length }} files · browser sandbox</small></div></div>
      <div class="toolbar">
        <NuxtLink class="journey-button" to="/spark-journey">✦ Spark Journey</NuxtLink>
        <button class="btn primary" title="Run the project main file" @click="startRun(false, entryFile)"><span class="btn-icon">▶</span> Run</button>
        <button class="btn ghost" title="Run the selected file" @click="startRun(false)"><span class="btn-icon">▷</span> Run file</button>
        <button class="btn accent" title="Debug the selected file" @click="startRun(true)"><span class="btn-icon debug-icon">◇</span> Debug file</button>
        <button class="btn danger" @click="stopRun"><span class="btn-icon">■</span> Stop</button>
        <div class="settings-wrap">
          <button class="btn ghost settings-button" aria-label="Open settings" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen">⚙ Settings</button>
          <div v-if="settingsOpen" class="settings-popover">
            <div class="settings-title">Editor settings</div>
            <label class="settings-option"><input v-model="autoSuggestionsEnabled" type="checkbox" @change="saveSettings" /><span><strong>Auto suggestion</strong><small>Show matching code completions while typing.</small></span></label>
          </div>
        </div>
      </div>
    </header>

    <section class="workspace">
      <aside class="sidebar panel">
        <div class="sidebar-head"><div><span class="eyebrow">WORKSPACE</span><h2>Project files</h2></div><span class="pill">{{ entryFile }}</span></div>
        <div class="file-actions"><button class="btn small file-action-main" @click="openModal('new')">＋ New file</button><button class="btn small icon-only" title="Import Python files" @click="fileInput?.click()">⇩</button><input ref="fileInput" type="file" accept=".py,text/x-python" multiple hidden @change="importFiles" /></div>
        <div class="file-tree">
          <div v-for="name in sortedFiles" :key="name" class="file-item" :class="{ active: name === activeFile }" @click="switchFile(name)" @dblclick="entryFile = name; showToast(`${name} set as project main file`)">
            <span class="file-icon">PY</span><span class="file-name">{{ name }}</span><span class="file-row-actions"><span v-if="name === entryFile" class="entry-tag">MAIN</span><button class="file-run-btn" type="button" :aria-label="`Run ${name}`" @click.stop="startRun(false, name)">▶</button></span>
          </div>
        </div>
        <div class="file-actions bottom-actions"><button class="btn small ghost" @click="openModal('rename')">Rename</button><button class="btn small ghost danger-text" @click="deleteActiveFile">Delete</button></div>
        <div class="learning-card"><div class="learning-icon">↗</div><div><strong>Multi-file Python</strong><p>Use modules just like a real Python project.</p><code>from player import Player</code></div></div>
      </aside>

      <section class="editor-panel panel">
        <div class="editor-head"><div class="tab active"><span class="tab-py">PY</span><span>{{ activeFile }}</span><span class="tab-dot" /></div><div class="editor-meta">{{ runtimeLabel }}</div></div>
        <ClientOnly fallback-tag="div" fallback="Loading Python editor…">
          <PythonEditor :key="editorKey" v-model="files[activeFile]" :filename="activeFile" :highlight-line="highlightLine" :auto-suggestions-enabled="autoSuggestionsEnabled" @update:model-value="updateActiveFile" />
        </ClientOnly>
        <div class="debug-strip"><div class="debug-context"><span class="debug-kicker">DEBUGGER</span><span class="step-label">{{ currentStep ? `Step ${traceIndex + 1} / ${trace.length} • ${currentStep.file}:${currentStep.line}` : 'No debug session' }}</span></div><div class="debug-controls"><button class="btn small debug-control" :disabled="traceIndex <= 0" title="Previous step" @click="previousStep">◀</button><button class="btn small debug-control" :disabled="traceIndex >= trace.length - 1" @click="nextStep">Next step <span>▶</span></button><button class="btn small debug-control" :disabled="traceIndex >= trace.length - 1" @click="continueToEnd">To end <span>»</span></button></div></div>
      </section>

      <aside class="inspector panel">
        <section class="inspector-section"><div class="panel-title-row"><div><span class="eyebrow">LIVE STATE</span><h2>Variables</h2></div><span class="pill muted">{{ currentLineBadge }}</span></div><div class="variables" :class="{ 'empty-state': !currentStep || !currentVariables.length }"><template v-if="!currentStep || !currentVariables.length"><div class="empty-visual">x = ?</div><strong>{{ currentStep ? 'No variables yet' : 'See variables change' }}</strong><span>{{ currentStep ? 'This step has no local variables.' : 'Run Debug and step through your program.' }}</span></template><table v-else class="variable-table"><thead><tr><th>Variable</th><th>Value</th><th>Type</th></tr></thead><tbody><tr v-for="[key, value] in currentVariables" :key="key" :class="{ changed: isChanged(value, key) }"><td><span class="variable-name">{{ key }}</span><span v-if="!previousVariables[key]" class="variable-new">New</span></td><td><div class="variable-value">{{ value.repr }}</div><div v-if="previousVariables[key] && isChanged(value, key)" class="variable-previous">was {{ previousVariables[key].repr }} <span class="arrow">→</span></div></td><td><span class="variable-type">{{ value.type }}</span></td></tr></tbody></table></div></section>
        <section class="inspector-section"><div class="section-heading"><span class="eyebrow">FLOW</span><h2>Program path</h2></div><div class="call-stack" :class="{ 'empty-state': !currentStack.length }"><template v-if="!currentStack.length">No active stack.</template><div v-for="frame in currentStack" v-else :key="`${frame.file}:${frame.line}:${frame.function}`" class="stack-row">{{ frame.function }}() • {{ frame.file }}:{{ frame.line }}</div></div></section>
        <section class="inspector-section"><div class="section-heading"><span class="eyebrow">STEPS</span><h2>Execution trace</h2></div><div class="timeline" :class="{ 'empty-state': !timelineSteps.length }"><template v-if="!timelineSteps.length">Execution steps will appear here.</template><div v-for="item in timelineSteps" v-else :key="item.index" class="timeline-row" :class="{ active: item.index === traceIndex }" @click="renderStep(item.index)"><span class="timeline-index">{{ item.index + 1 }}</span><span class="timeline-copy"><span class="timeline-location">{{ item.step.file }}:{{ item.step.line }}</span><span class="timeline-action">{{ traceAction(item.step) }}</span></span><span v-if="item.index === maxVisitedTraceIndex" class="timeline-latest">Latest</span></div></div></section>
      </aside>
    </section>

    <section class="console-panel panel"><div class="console-head"><div class="console-title-wrap"><span class="console-dot red" /><span class="console-dot yellow" /><span class="console-dot green" /><h2>Console</h2></div><button class="btn small ghost" @click="clearConsole">Clear</button></div><pre class="console-output"><span v-for="(line, index) in consoleLines" :key="index" :class="line.tone">{{ line.text }}</span></pre><form v-if="awaitingInput" class="console-input-row" autocomplete="off" @submit.prevent="dispatchInput"><span class="console-input-prompt">{{ inputPrompt }}</span><input v-model="inputValue" class="console-input-field" type="text" spellcheck="false" :aria-label="inputPrompt || 'Python input'" autofocus /><button class="console-enter-btn" type="submit">Enter ↵</button></form></section>
    <div v-if="modalOpen" class="modal-backdrop" @click.self="modalOpen = false"><form id="file-modal" class="file-modal" @submit.prevent="confirmModal"><div class="file-modal-head"><div><span class="eyebrow">PROJECT FILE</span><h3>{{ modalMode === 'rename' ? 'Rename Python file' : 'Create a new Python file' }}</h3></div><button class="file-modal-close" type="button" aria-label="Close" @click="modalOpen = false">×</button></div><div class="file-modal-body"><label class="file-modal-label" for="file-modal-input">File name</label><input id="file-modal-input" v-model="modalName" class="file-modal-input" type="text" spellcheck="false" /><div class="file-modal-help" :class="{ error: modalError }">{{ modalError || 'Use letters, numbers, underscores, and a .py extension.' }}</div></div><div class="file-modal-actions"><button class="btn small ghost" type="button" @click="modalOpen = false">Cancel</button><button class="btn small primary" type="submit">{{ modalMode === 'rename' ? 'Rename file' : 'Create file' }}</button></div></form></div>
    <div class="toast" :class="{ show: toastMessage }">{{ toastMessage }}</div>
  </main>
</template>
