<script setup lang="ts">
import { strToU8, zipSync } from "fflate";
import type {
  PythonRunResult,
  TraceStep,
  VariableValue,
} from "~/composables/usePythonRuntime";

const starterFiles: Record<string, string> = {
  "main.py": `from player import Player\nfrom utils import calculate_score\n\nplayer = Player("Codi")\nscore = calculate_score(10, 20)\n\nprint(player.greet())\nprint("Score:", score)\n`,
  "player.py": `class Player:\n    def __init__(self, name):\n        self.name = name\n\n    def greet(self):\n        return f"Hello, {self.name}!"\n`,
  "utils.py": `def calculate_score(a, b):\n    result = a + b\n    return result\n`,
};

const files = ref<Record<string, string>>({ ...starterFiles });
const projectName = ref("Python Basics");
const activeFile = ref("main.py");
const entryFile = ref("main.py");
const highlightLine = ref<number | null>(null);
const editorKey = ref(0);
const runtime = usePythonRuntime();
const fileInput = ref<HTMLInputElement | null>(null);
const consoleLines = ref<{ text: string; tone?: string }[]>([
  {
    text: "Ready. Press Run to start the project main file, or Run file to execute the selected file.",
    tone: "console-dim",
  },
]);
const modalOpen = ref(false);
const modalMode = ref<"new" | "rename" | "project">("new");
const modalName = ref("module.py");
const modalError = ref("");
const settingsOpen = ref(false);
const autoSuggestionsEnabled = ref(true);
const showFullConditionSteps = ref(false);
const activeInputs = ref<string[]>([]);
const awaitingInput = ref(false);
const inputPrompt = ref("");
const currentRunEntry = ref("main.py");
const activeRunTraceMode = ref(false);
const trace = ref<TraceStep[]>([]);
const traceIndex = ref(-1);
const maxVisitedTraceIndex = ref(-1);
const toastMessage = ref("");
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const sortedFiles = computed(() =>
  Object.keys(files.value).sort((a, b) =>
    a === entryFile.value ? -1 : b === entryFile.value ? 1 : a.localeCompare(b),
  ),
);
const currentStep = computed(() => trace.value[traceIndex.value]);
const currentLineBadge = computed(() =>
  currentStep.value
    ? currentStep.value.event === "return" &&
      currentStep.value.function === "<module>" &&
      currentStep.value.file === currentRunEntry.value
      ? "Done"
      : `${currentStep.value.file}:${currentStep.value.line}`
    : "—",
);
const timelineSteps = computed(() =>
  trace.value
    .slice(0, maxVisitedTraceIndex.value + 1)
    .map((step, index) => ({ step, index }))
    .reverse(),
);
const currentVariables = computed(() =>
  Object.entries(currentStep.value?.locals || {}).sort(([a], [b]) =>
    a.localeCompare(b),
  ),
);
const previousVariables = computed(
  () => trace.value[traceIndex.value - 1]?.locals || {},
);
const currentStack = computed(() =>
  (currentStep.value?.stack || []).slice().reverse(),
);
const conditionTrail = computed(() => {
  const step = currentStep.value;
  if (!step?.condition) return [];
  let start = traceIndex.value;
  while (start > 0) {
    const previous = trace.value[start - 1];
    if (
      previous.file !== step.file ||
      previous.line !== step.line ||
      previous.function !== step.function
    )
      break;
    start--;
  }
  return trace.value
    .slice(start, traceIndex.value + 1)
    .filter((item) => item.condition)
    .map((item, index) => ({ condition: item.condition!, index }));
});
const runtimeLabel = computed(() => {
  if (runtime.status.value === "debugging")
    return `Debugging ${currentRunEntry.value}…`;
  if (runtime.status.value === "running")
    return `Running ${currentRunEntry.value}…`;
  if (runtime.status.value === "failed") return "Runtime: failed";
  if (runtime.status.value === "loading") return "Runtime: loading Pyodide…";
  if (runtime.status.value === "waiting") return "Runtime: waiting for input…";
  return "Runtime: ready";
});

function loadFiles() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("cv-python-lab-files") || "null",
    );
    if (saved && Object.keys(saved).length) files.value = saved;
    const savedProjectName = localStorage.getItem("cv-python-lab-project-name");
    if (savedProjectName)
      projectName.value =
        normalizeProjectName(savedProjectName) || "Python Basics";
  } catch {
    /* local storage can be unavailable in private browsing */
  }
  const firstFile = files.value["main.py"]
    ? "main.py"
    : Object.keys(files.value)[0];
  const savedEntryFile = localStorage.getItem("cv-python-lab-entry-file");
  activeFile.value = firstFile;
  entryFile.value =
    savedEntryFile && savedEntryFile in files.value
      ? savedEntryFile
      : firstFile;
}

function saveFiles() {
  if (!import.meta.client) return;
  localStorage.setItem("cv-python-lab-files", JSON.stringify(files.value));
  localStorage.setItem("cv-python-lab-project-name", projectName.value);
  localStorage.setItem("cv-python-lab-entry-file", entryFile.value);
}

function loadSettings() {
  if (!import.meta.client) return;
  autoSuggestionsEnabled.value =
    localStorage.getItem("cv-python-lab-auto-suggestions") !== "false";
  showFullConditionSteps.value =
    localStorage.getItem("cv-python-lab-full-condition-steps") === "true";
}

function saveSettings() {
  if (!import.meta.client) return;
  localStorage.setItem(
    "cv-python-lab-auto-suggestions",
    String(autoSuggestionsEnabled.value),
  );
  localStorage.setItem(
    "cv-python-lab-full-condition-steps",
    String(showFullConditionSteps.value),
  );
}

function showToast(message: string) {
  toastMessage.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastMessage.value = "";
  }, 1600);
}

function appendConsole(text: string, tone?: string) {
  if (text) consoleLines.value.push({ text, tone });
}

function clearConsole() {
  consoleLines.value = [];
}

function switchFile(name: string, line: number | null = null) {
  if (!(name in files.value)) return;
  activeFile.value = name;
  highlightLine.value = line;
  editorKey.value++;
}

function updateActiveFile(value: string) {
  files.value = { ...files.value, [activeFile.value]: value };
  if (import.meta.client) saveFiles();
}

function resetDebug() {
  trace.value = [];
  traceIndex.value = -1;
  maxVisitedTraceIndex.value = -1;
  highlightLine.value = null;
}

function renderStep(index: number) {
  const step = trace.value[index];
  if (!step) return;
  traceIndex.value = index;
  switchFile(step.file, step.line);
}

function updateTrace(result: PythonRunResult, index = 0) {
  trace.value = result.trace || [];
  if (!trace.value.length) return;
  traceIndex.value = Math.min(Math.max(index, 0), trace.value.length - 1);
  maxVisitedTraceIndex.value = traceIndex.value;
  renderStep(traceIndex.value);
}

function startRun(traceMode: boolean, runEntry = activeFile.value) {
  if (runtime.status.value === "loading")
    return showToast("Python runtime is still loading");
  if (runtime.status.value === "failed")
    return showToast("Python runtime failed to start");
  if (
    runtime.status.value === "running" ||
    runtime.status.value === "debugging"
  ) {
    return showToast("Stop the current run before starting another");
  }
  if (!(runEntry in files.value)) return showToast(`Cannot run ${runEntry}`);
  if (import.meta.client) saveFiles();
  activeInputs.value = [];
  inputPrompt.value = "";
  activeRunTraceMode.value = traceMode;
  currentRunEntry.value = runEntry;
  resetDebug();
  clearConsole();
  appendConsole(
    `${traceMode ? "Debugging" : "Running"} ${runEntry}…\n`,
    "console-dim",
  );
  runtime.run({
    files: { ...files.value },
    entry: runEntry,
    trace: traceMode,
    inputs: [],
  });
}

function stopRun() {
  awaitingInput.value = false;
  activeInputs.value = [];
  appendConsole("\nExecution stopped.\n", "console-error");
  resetDebug();
  runtime.stop();
}

function handleRunResult(result: PythonRunResult) {
  clearConsole();
  appendConsole(result.stdout);
  appendConsole(result.stderr, "console-error");
  if (result.needsInput) {
    // Keep the partial debug session visible while Python is paused at input().
    // The next submission replays the program and replaces it with the full trace.
    if (activeRunTraceMode.value) {
      const partialTrace = [...(result.trace || [])];
      // Raising the pause exception unwinds the current frames, so the tracer
      // can append synthetic return events even though the program is not done.
      while (partialTrace.at(-1)?.event === "return") partialTrace.pop();
      updateTrace({ ...result, trace: partialTrace }, partialTrace.length - 1);
    }
    awaitingInput.value = true;
    inputPrompt.value = result.inputPrompt || "";
    runtime.status.value = "waiting";
    appendConsole(result.error || "", "console-error");
    return;
  }
  awaitingInput.value = false;
  inputPrompt.value = "";
  appendConsole(result.error || "", "console-error");
  if (!result.stdout && !result.stderr && !result.error)
    appendConsole("Program finished with no output.\n", "console-dim");
  if (result.trace?.length) {
    updateTrace(result);
    if (result.traceTruncated)
      appendConsole("\nTrace stopped at 10,000 steps.\n", "console-error");
  }
}

function dispatchInput() {
  if (!awaitingInput.value) return;
  const submittedPrompt = inputPrompt.value;
  activeInputs.value = [...activeInputs.value, inputValue.value];
  inputValue.value = "";
  awaitingInput.value = false;
  inputPrompt.value = "";
  const resumed = runtime.run({
    files: { ...files.value },
    entry: currentRunEntry.value,
    trace: activeRunTraceMode.value,
    inputs: activeInputs.value,
  });
  if (!resumed) {
    awaitingInput.value = true;
    inputPrompt.value = submittedPrompt;
    showToast("Python runtime is not ready to resume");
  }
}

const inputValue = ref("");

function uniqueFileName(base = "untitled.py") {
  if (!files.value[base]) return base;
  const stem = base.replace(/\.py$/, "");
  let i = 2;
  while (files.value[`${stem}_${i}.py`]) i++;
  return `${stem}_${i}.py`;
}

function normalizePyName(name: string) {
  const normalized =
    name.trim().replace(/\s+/g, "_").replace(/\.py$/i, "") + ".py";
  return /^[A-Za-z_][A-Za-z0-9_]*\.py$/.test(normalized) ? normalized : null;
}

function normalizeProjectName(name: string) {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .slice(0, 80);
}

function openModal(mode: "new" | "rename" | "project") {
  modalMode.value = mode;
  modalName.value =
    mode === "rename"
      ? activeFile.value
      : mode === "project"
        ? projectName.value
        : uniqueFileName("module.py");
  modalError.value = "";
  modalOpen.value = true;
  nextTick(() =>
    document.querySelector<HTMLInputElement>("#file-modal-input")?.select(),
  );
}

function confirmModal() {
  if (modalMode.value === "project") {
    const name = normalizeProjectName(modalName.value);
    if (!name) return (modalError.value = "Enter a project name first.");
    projectName.value = name;
    modalOpen.value = false;
    saveFiles();
    return showToast(`Project renamed to ${name}`);
  }
  const name = normalizePyName(modalName.value);
  if (!name)
    return (modalError.value =
      "Invalid file name. Try something like game_logic.py");
  if (modalMode.value === "new") {
    if (files.value[name])
      return (modalError.value = "A file with this name already exists.");
    files.value = { ...files.value, [name]: "# New Python module\n" };
    saveFiles();
    modalOpen.value = false;
    switchFile(name);
    return showToast(`${name} created`);
  }
  if (name !== activeFile.value && files.value[name])
    return (modalError.value = "A file with this name already exists.");
  if (name === activeFile.value) return (modalOpen.value = false);
  const nextFiles = { ...files.value, [name]: files.value[activeFile.value] };
  delete nextFiles[activeFile.value];
  if (entryFile.value === activeFile.value) entryFile.value = name;
  const old = activeFile.value;
  files.value = nextFiles;
  modalOpen.value = false;
  switchFile(name);
  saveFiles();
  showToast(`${old} renamed to ${name}`);
}

function deleteActiveFile() {
  if (Object.keys(files.value).length <= 1)
    return showToast("Keep at least one Python file");
  if (!confirm(`Delete ${activeFile.value}?`)) return;
  const old = activeFile.value;
  const nextFiles = { ...files.value };
  delete nextFiles[old];
  files.value = nextFiles;
  if (entryFile.value === old) entryFile.value = Object.keys(nextFiles)[0];
  activeFile.value = Object.keys(nextFiles)[0];
  saveFiles();
  switchFile(activeFile.value);
}

function setEntryFile(name: string) {
  if (!(name in files.value)) return;
  entryFile.value = name;
  saveFiles();
  showToast(`${name} set as project main file`);
}

async function importFiles(event: Event) {
  const picked = Array.from(
    (event.target as HTMLInputElement).files || [],
  ).filter((file) => file.name.endsWith(".py"));
  const imported = { ...files.value };
  for (const file of picked)
    imported[normalizePyName(file.name) || file.name] = await file.text();
  files.value = imported;
  saveFiles();
  if (picked.length) showToast(`Imported ${picked.length} file(s)`);
  if (fileInput.value) fileInput.value.value = "";
}

function downloadProjectZip() {
  if (!import.meta.client) return;
  const zipFiles: Record<string, Uint8Array> = {};
  for (const [name, source] of Object.entries(files.value))
    zipFiles[name] = strToU8(source);
  const archive = zipSync(zipFiles, { level: 6 });
  const url = URL.createObjectURL(
    new Blob([archive], { type: "application/zip" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${normalizeProjectName(projectName.value) || "python-project"}.zip`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`Saved ${projectName.value}.zip`);
}

function nextStep() {
  if (traceIndex.value < trace.value.length - 1) {
    maxVisitedTraceIndex.value = Math.max(
      maxVisitedTraceIndex.value,
      traceIndex.value + 1,
    );
    renderStep(traceIndex.value + 1);
  }
}
function previousStep() {
  if (traceIndex.value > 0) renderStep(traceIndex.value - 1);
}
function continueToEnd() {
  if (trace.value.length) {
    maxVisitedTraceIndex.value = trace.value.length - 1;
    renderStep(trace.value.length - 1);
  }
}
function isProgramEnd(step: TraceStep) {
  return (
    step.event === "return" &&
    step.function === "<module>" &&
    step.file === currentRunEntry.value
  );
}
function traceAction(step: TraceStep) {
  return isProgramEnd(step)
    ? "Program finished"
    : step.event === "condition"
      ? "Check condition"
      : step.event === "return"
        ? `Return from ${step.function}()`
        : step.function === "<module>"
          ? "Run line"
          : `${step.function}()`;
}
function isChanged(value: VariableValue, key: string) {
  return (
    !previousVariables.value[key] ||
    previousVariables.value[key].repr !== value.repr
  );
}

watch(runtime.lastResult, (result) => {
  if (result) handleRunResult(result);
});

onMounted(() => {
  loadFiles();
  loadSettings();
  runtime.start();
});
</script>

<template>
  <main class="app-shell">
    <header class="relative z-20 grid min-w-0 grid-cols-1 items-center gap-3 rounded-2xl border border-blue-200/15 bg-gradient-to-r from-[#081d40] via-[#0a2b61] to-[#0a2350] px-3 py-3 shadow-[0_14px_40px_rgba(0,0,0,0.28)] min-[961px]:grid-cols-[minmax(0,1fr)_auto] min-[1181px]:grid-cols-[minmax(250px,1fr)_190px_auto] min-[1181px]:gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <img src="/logo.svg" alt="Spark Coding Lab" class="h-10 w-auto max-w-[170px] shrink-0 rounded-lg bg-white px-2 py-1 object-contain" />
        <div class="min-w-0">
          <div class="truncate text-lg font-extrabold tracking-[-0.02em] text-[#eaf2ff]">Python Lab</div>
          <div class="truncate text-[13px] text-[#8298bb] max-[1040px]:hidden">
            Learn Python by seeing how your code works
          </div>
        </div>
      </div>
      <UButton
        color="neutral"
        variant="soft"
        class="hidden h-11 w-[190px] min-w-0 shrink-0 items-center justify-start gap-2 rounded-xl border border-blue-200/15 bg-[#05142e]/45 px-3 text-left text-[#dfeaff] hover:bg-blue-500/15 min-[1181px]:flex"
        aria-label="Rename project"
        title="Rename project"
        @click="openModal('project')"
      >
        <span class="size-2 shrink-0 rounded-full bg-[#20cc83] shadow-[0_0_0_4px_rgba(32,204,131,0.1)]" aria-hidden="true" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-sm font-bold">{{ projectName }}</span>
          <span class="mt-0.5 block truncate text-xs text-[#7389aa]">{{ Object.keys(files).length }} files · browser sandbox</span>
        </span>
        <UIcon name="i-lucide-pencil" class="size-3.5 shrink-0 text-[#7298d0]" aria-hidden="true" />
      </UButton>
      <div class="col-span-full flex min-w-0 flex-wrap items-center justify-end gap-2 min-[961px]:col-start-2 min-[961px]:row-start-1 min-[1181px]:col-start-3 min-[1181px]:col-span-1 min-[1181px]:row-start-1 max-[680px]:grid max-[680px]:grid-cols-2">
        <div class="flex min-w-0 items-center gap-1.5 border-l border-blue-200/15 pl-2 max-[680px]:border-l-0 max-[680px]:pl-0">
          <UButton color="success" variant="solid" icon="i-lucide-play" class="h-11 min-w-0 whitespace-nowrap rounded-xl px-3 font-bold max-[680px]:flex-1" title="Run the project main file" @click="startRun(false, entryFile)">Run</UButton>
          <UButton color="neutral" variant="soft" icon="i-lucide-play" class="h-11 min-w-0 whitespace-nowrap rounded-xl px-3 font-bold" title="Run the selected file" @click="startRun(false)">Run file</UButton>
        </div>
        <div class="flex min-w-0 items-center gap-1.5 border-l border-blue-200/15 pl-2 max-[680px]:border-l-0 max-[680px]:pl-0">
          <UButton color="warning" variant="solid" icon="i-lucide-bug" class="h-11 min-w-0 whitespace-nowrap rounded-xl px-3 font-bold text-[#2b2200] max-[680px]:flex-1" title="Debug the selected file" @click="startRun(true)">Debug file</UButton>
          <UButton color="error" variant="soft" icon="i-lucide-square" class="h-11 min-w-0 whitespace-nowrap rounded-xl px-3 font-bold" @click="stopRun">Stop</UButton>
        </div>
        <div class="flex min-w-0 items-center gap-1.5 border-l border-blue-200/15 pl-2 max-[680px]:border-l-0 max-[680px]:pl-0">
          <UButton color="success" variant="soft" icon="i-lucide-download" class="h-11 min-w-0 whitespace-nowrap rounded-xl border border-emerald-300/20 px-3 font-bold text-emerald-200" title="Download all project files as a ZIP" @click="downloadProjectZip">Save project</UButton>
          <UPopover v-model:open="settingsOpen" :content="{ align: 'end', sideOffset: 8 }">
            <UButton color="neutral" variant="soft" icon="i-lucide-settings" class="h-11 min-w-0 whitespace-nowrap rounded-xl px-3 font-bold" aria-label="Open settings" :aria-expanded="settingsOpen">Settings</UButton>
            <template #content>
              <div class="w-80 space-y-4 p-4">
                <div>
                  <p class="text-sm font-bold text-highlighted">Editor settings</p>
                  <p class="mt-1 text-xs text-muted">Customize how the Python editor behaves.</p>
                </div>
                <UCheckbox v-model="autoSuggestionsEnabled" label="Auto suggestion" description="Show matching code completions while typing." @update:model-value="saveSettings" />
                <UCheckbox v-model="showFullConditionSteps" label="Full condition steps" description="Show earlier values together with the current condition step." @update:model-value="saveSettings" />
              </div>
            </template>
          </UPopover>
        </div>
      </div>
    </header>

    <section class="workspace">
      <aside class="sidebar panel">
        <div class="sidebar-head">
          <div>
            <span class="eyebrow">WORKSPACE</span>
            <h2>Project files</h2>
          </div>
          <span class="pill">{{ entryFile }}</span>
        </div>
        <div class="file-actions">
          <button class="btn small file-action-main" @click="openModal('new')">
            ＋ New file</button
          ><button
            class="btn small icon-only"
            title="Import Python files"
            @click="fileInput?.click()"
          >
            ⇩</button
          ><input
            ref="fileInput"
            type="file"
            accept=".py,text/x-python"
            multiple
            hidden
            @change="importFiles"
          />
        </div>
        <div class="file-tree">
          <div
            v-for="name in sortedFiles"
            :key="name"
            class="file-item"
            :class="{ active: name === activeFile }"
            @click="switchFile(name)"
            @dblclick="setEntryFile(name)"
          >
            <span class="file-icon">PY</span
            ><span class="file-name">{{ name }}</span
            ><span class="file-row-actions"
              ><span v-if="name === entryFile" class="entry-tag">MAIN</span
              ><button
                class="file-run-btn"
                type="button"
                :aria-label="`Run ${name}`"
                @click.stop="startRun(false, name)"
              >
                ▶
              </button></span
            >
          </div>
        </div>
        <div class="file-actions bottom-actions">
          <button class="btn small ghost" @click="openModal('rename')">
            Rename</button
          ><button
            class="btn small ghost danger-text"
            @click="deleteActiveFile"
          >
            Delete
          </button>
        </div>
      </aside>

      <section class="editor-panel panel">
        <div class="editor-head">
          <div class="tab active">
            <span class="tab-py">PY</span><span>{{ activeFile }}</span
            ><span class="tab-dot" />
          </div>
          <div class="editor-meta">{{ runtimeLabel }}</div>
        </div>
        <ClientOnly fallback-tag="div" fallback="Loading Python editor…">
          <PythonEditor
            :key="editorKey"
            v-model="files[activeFile]"
            :filename="activeFile"
            :highlight-line="highlightLine"
            :condition-highlight="
              currentStep?.event === 'condition' ? currentStep.condition : null
            "
            :condition-trail="conditionTrail"
            :show-full-condition-steps="showFullConditionSteps"
            :auto-suggestions-enabled="autoSuggestionsEnabled"
            @update:model-value="updateActiveFile"
          />
        </ClientOnly>
        <div class="debug-strip">
          <div class="debug-context">
            <span class="debug-kicker">DEBUGGER</span
            ><span class="step-label">{{
              currentStep
                ? `Step ${traceIndex + 1} / ${trace.length} • ${currentStep.file}:${currentStep.line}`
                : "No debug session"
            }}</span>
          </div>
          <div class="debug-controls">
            <button
              class="btn small debug-control"
              :disabled="traceIndex <= 0"
              title="Previous step"
              @click="previousStep"
            >
              ◀</button
            ><button
              class="btn small debug-control"
              :disabled="traceIndex >= trace.length - 1"
              @click="nextStep"
            >
              Next step <span>▶</span></button
            ><button
              class="btn small debug-control"
              :disabled="traceIndex >= trace.length - 1"
              @click="continueToEnd"
            >
              To end <span>»</span>
            </button>
          </div>
        </div>
      </section>

      <aside class="inspector panel">
        <section class="inspector-section">
          <div class="panel-title-row">
            <div>
              <span class="eyebrow">LIVE STATE</span>
              <h2>Variables</h2>
            </div>
            <span class="pill muted">{{ currentLineBadge }}</span>
          </div>
          <div
            class="variables"
            :class="{ 'empty-state': !currentStep || !currentVariables.length }"
          >
            <template v-if="!currentStep || !currentVariables.length"
              ><div class="empty-visual">x = ?</div>
              <strong>{{
                currentStep ? "No variables yet" : "See variables change"
              }}</strong
              ><span>{{
                currentStep
                  ? "This step has no local variables."
                  : "Run Debug and step through your program."
              }}</span></template
            >
            <table v-else class="variable-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Value</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="[key, value] in currentVariables"
                  :key="key"
                  :class="{ changed: isChanged(value, key) }"
                >
                  <td>
                    <span class="variable-name">{{ key }}</span
                    ><span v-if="!previousVariables[key]" class="variable-new"
                      >New</span
                    >
                  </td>
                  <td>
                    <div class="variable-value">{{ value.repr }}</div>
                    <div
                      v-if="previousVariables[key] && isChanged(value, key)"
                      class="variable-previous"
                    >
                      was {{ previousVariables[key].repr }}
                      <span class="arrow">→</span>
                    </div>
                  </td>
                  <td>
                    <span class="variable-type">{{ value.type }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section class="inspector-section">
          <div class="section-heading">
            <span class="eyebrow">FLOW</span>
            <h2>Program path</h2>
          </div>
          <div
            class="call-stack"
            :class="{ 'empty-state': !currentStack.length }"
          >
            <template v-if="!currentStack.length">No active stack.</template>
            <div
              v-for="frame in currentStack"
              v-else
              :key="`${frame.file}:${frame.line}:${frame.function}`"
              class="stack-row"
            >
              {{ frame.function }}() • {{ frame.file }}:{{ frame.line }}
            </div>
          </div>
        </section>
        <section class="inspector-section">
          <div class="section-heading">
            <span class="eyebrow">STEPS</span>
            <h2>Execution trace</h2>
          </div>
          <div
            class="timeline"
            :class="{ 'empty-state': !timelineSteps.length }"
          >
            <template v-if="!timelineSteps.length"
              >Execution steps will appear here.</template
            >
            <div
              v-for="item in timelineSteps"
              v-else
              :key="item.index"
              class="timeline-row"
              :class="{ active: item.index === traceIndex }"
              @click="renderStep(item.index)"
            >
              <span class="timeline-index">{{ item.index + 1 }}</span
              ><span class="timeline-copy"
                ><span class="timeline-location"
                  >{{ item.step.file }}:{{ item.step.line }}</span
                ><span class="timeline-action">{{
                  traceAction(item.step)
                }}</span></span
              ><span
                v-if="item.index === maxVisitedTraceIndex"
                class="timeline-latest"
                >Latest</span
              >
            </div>
          </div>
        </section>
      </aside>
    </section>

    <section class="console-panel panel">
      <div class="console-head">
        <div class="console-title-wrap">
          <span class="console-dot red" /><span
            class="console-dot yellow"
          /><span class="console-dot green" />
          <h2>Console</h2>
        </div>
        <button class="btn small ghost" @click="clearConsole">Clear</button>
      </div>
      <pre
        class="console-output"
      ><span v-for="(line, index) in consoleLines" :key="index" :class="line.tone">{{ line.text }}</span></pre>
      <form
        v-if="awaitingInput"
        class="console-input-row"
        autocomplete="off"
        @submit.prevent="dispatchInput"
      >
        <span class="console-input-prompt">{{ inputPrompt }}</span
        ><input
          v-model="inputValue"
          class="console-input-field"
          type="text"
          spellcheck="false"
          :aria-label="inputPrompt || 'Python input'"
          autofocus
        /><button class="console-enter-btn" type="submit">Enter ↵</button>
      </form>
    </section>
    <div
      v-if="modalOpen"
      class="modal-backdrop"
      @click.self="modalOpen = false"
    >
      <form id="file-modal" class="file-modal" @submit.prevent="confirmModal">
        <div class="file-modal-head">
          <div>
            <span class="eyebrow">{{
              modalMode === "project" ? "PROJECT" : "PROJECT FILE"
            }}</span>
            <h3>
              {{
                modalMode === "project"
                  ? "Set project name"
                  : modalMode === "rename"
                    ? "Rename Python file"
                    : "Create a new Python file"
              }}
            </h3>
          </div>
          <button
            class="file-modal-close"
            type="button"
            aria-label="Close"
            @click="modalOpen = false"
          >
            ×
          </button>
        </div>
        <div class="file-modal-body">
          <label class="file-modal-label" for="file-modal-input">{{
            modalMode === "project" ? "Project name" : "File name"
          }}</label
          ><input
            id="file-modal-input"
            v-model="modalName"
            class="file-modal-input"
            type="text"
            spellcheck="false"
          />
          <div class="file-modal-help" :class="{ error: modalError }">
            {{
              modalError ||
              (modalMode === "project"
                ? "This name is used for browser storage and ZIP export."
                : "Use letters, numbers, underscores, and a .py extension.")
            }}
          </div>
        </div>
        <div class="file-modal-actions">
          <button
            class="btn small ghost"
            type="button"
            @click="modalOpen = false"
          >
            Cancel</button
          ><button class="btn small primary" type="submit">
            {{
              modalMode === "project"
                ? "Save name"
                : modalMode === "rename"
                  ? "Rename file"
                  : "Create file"
            }}
          </button>
        </div>
      </form>
    </div>
    <div class="toast" :class="{ show: toastMessage }">{{ toastMessage }}</div>
  </main>
</template>
