<script lang="ts">
let sharedCompletionProvider: any = null
let sharedMonaco: any = null
let sharedMonacoPromise: Promise<any> | null = null
</script>

<script setup lang="ts">
import type { ConditionEvaluation, TraceStep } from '~/composables/usePythonRuntime'

const props = defineProps<{
  modelValue: string
  filename: string
  highlightLine: number | null
  autoSuggestionsEnabled: boolean
  step?: TraceStep | null
  traceIndex?: number
  traceLength?: number
  conditionHighlight?: ConditionEvaluation | null
  conditionTrail?: { condition: ConditionEvaluation; index: number }[]
  showFullConditionSteps?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<HTMLElement | null>(null)
let editor: any = null
let monaco: any = null
let model: any = null
let debugDecorations: string[] = []
let disposed = false
const bubblePosition = ref({ top: 12, left: 12 })
const bubbleBelowLine = ref(false)

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (existing) {
      if ((window as any).require) return resolve()
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Could not load Monaco loader.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Monaco loader.'))
    document.head.appendChild(script)
  })
}

function createModel(filename: string, value: string) {
  const uri = monaco.Uri.parse(`file:///project/${filename}`)
  const existing = monaco.editor.getModel(uri)
  if (existing) {
    existing.setValue(value)
    return existing
  }
  return monaco.editor.createModel(value, 'python', uri)
}

function stepSource(step: TraceStep | null | undefined) {
  if (!step) return ''
  if (step.evaluation) return step.evaluation.source
  if (step.event === 'assignment') {
    const assignment = step.assignment
    if (assignment?.targets.length === 1 && /^\s*for\b/.test(assignment.source)) return assignment.targets[0]
    return assignment?.source || ''
  }
  if (step.event === 'condition') return step.condition?.source || ''
  return model?.getLineContent(step.line)?.trim() || ''
}

function getStepSourceLine(step: TraceStep) {
  return model?.getLineContent(step.line) || ''
}

function highlight(line: number | null, condition: ConditionEvaluation | null = props.conditionHighlight || null, step: TraceStep | null | undefined = props.step) {
  if (!editor) return
  const decorations: any[] = line ? [{
    range: new monaco.Range(line, 1, line, 1),
    options: {
      isWholeLine: true,
      className: 'debug-current-line',
      glyphMarginClassName: 'debug-current-glyph',
    },
  }] : []
  if (condition && model && condition.line === line) {
    const sourceLine = model.getLineContent(condition.line)
    const sourceStart = sourceLine.indexOf(condition.source)
    if (sourceStart >= 0) {
      decorations.push({
        range: new monaco.Range(condition.line, sourceStart + 1, condition.line, sourceStart + condition.source.length + 1),
        options: {
          inlineClassName: 'debug-condition-expression',
          overviewRuler: { color: condition.result === null ? '#FFC72C' : condition.result ? '#20CC83' : '#FF6474', position: monaco.editor.OverviewRulerLane.Full },
        },
      })
    }
  }
  if (step?.event === 'assignment' && model && step.line === line) {
    const sourceLine = model.getLineContent(step.line)
    const source = stepSource(step)
    const sourceStart = step.assignment?.column ? step.assignment.column - 1 : sourceLine.indexOf(source)
    if (sourceStart >= 0 && source) {
      decorations.push({
        range: new monaco.Range(step.line, sourceStart + 1, step.line, sourceStart + source.length + 1),
        options: {
          inlineClassName: 'debug-assignment-expression',
          overviewRuler: { color: '#67DBB0', position: monaco.editor.OverviewRulerLane.Full },
        },
      })
    }
  }
  debugDecorations = editor.deltaDecorations(debugDecorations, decorations)
  if (line) {
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
  }
  updateBubblePosition(step)
  if (import.meta.client) requestAnimationFrame(() => updateBubblePosition(step))
}

function updateBubblePosition(step: TraceStep | null | undefined = props.step) {
  if (!editor || !container.value || !step) return
  const sourceLine = model?.getLineContent(step.line) || ''
  const source = stepSource(step)
  const column = step.evaluation?.column ?? step.assignment?.column
  const sourceStart = column ? column - 1 : source ? Math.max(0, sourceLine.indexOf(source)) : 0
  const start = editor.getScrolledVisiblePosition({ lineNumber: step.line, column: sourceStart + 1 })
  if (!start) return
  // getScrolledVisiblePosition can briefly report the pre-reveal viewport
  // after Monaco centers a new step. Derive Y from the current scroll offset
  // so the overlay stays in the same coordinate space as the editor shell.
  const lineTop = editor.getTopForLineNumber(step.line) - editor.getScrollTop()
  const top = Number.isFinite(lineTop) ? lineTop : start.top
  const bubble = container.value.parentElement?.querySelector<HTMLElement>('[data-testid="debug-step-bubble"]')
  const bubbleWidth = Math.min(bubble?.offsetWidth || 280, container.value.clientWidth - 24)
  const inlineLeft = Math.max(12, start.left - 8)
  bubbleBelowLine.value = inlineLeft + bubbleWidth > container.value.clientWidth - 12
  bubblePosition.value = {
    left: bubbleBelowLine.value ? 12 : inlineLeft,
    top: bubbleBelowLine.value ? top + start.height + 10 : top + start.height / 2,
  }
}

function updateSuggestionSettings(enabled: boolean) {
  if (!editor) return
  editor.updateOptions({
    quickSuggestions: enabled,
    suggestOnTriggerCharacters: enabled,
  })
  if (!enabled) editor.trigger('keyboard', 'hideSuggestWidget', {})
}

async function init() {
  try {
    if (!sharedMonacoPromise) {
      sharedMonacoPromise = loadScript('https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js').then(() => new Promise((resolve, reject) => {
        const amdRequire = (window as any).require
        if (!amdRequire) return reject(new Error('Monaco loader did not expose require.'))
        amdRequire.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } })
        amdRequire(['vs/editor/editor.main'], () => {
          sharedMonaco = (window as any).monaco
          resolve(sharedMonaco)
        })
      }))
    }
    monaco = await sharedMonacoPromise
    if (disposed || !container.value) return
    monaco.editor.defineTheme('codeventure-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '526B8F', fontStyle: 'italic' },
          { token: 'keyword', foreground: '7DB3FF' },
          { token: 'string', foreground: 'FFD56A' },
          { token: 'number', foreground: '67DBB0' },
          { token: 'type.identifier', foreground: '9ED1FF' },
          { token: 'identifier', foreground: 'D9E7FA' },
        ],
        colors: {
          'editor.background': '#06162F',
          'editor.foreground': '#D9E7FA',
          'editorLineNumber.foreground': '#38557F',
          'editorLineNumber.activeForeground': '#86A9D9',
          'editorCursor.foreground': '#FFC72C',
          'editor.selectionBackground': '#17488799',
          'editor.lineHighlightBackground': '#0A2147',
          'editorIndentGuide.background1': '#16345E',
          'editorIndentGuide.activeBackground1': '#2A5B99',
          'editorSuggestWidget.background': '#0A2147',
          'editorSuggestWidget.border': '#1C4275',
          'editorSuggestWidget.selectedBackground': '#123B79',
        },
    })

    if (!sharedCompletionProvider) {
      sharedCompletionProvider = monaco.languages.registerCompletionItemProvider('python', {
          triggerCharacters: ['.', ' '],
          provideCompletionItems: (completionModel: any, position: any) => {
            const query = completionModel.getWordUntilPosition(position).word.toLowerCase()
            if (!query) return { suggestions: [] }
            const keywords = ['print', 'input', 'int', 'str', 'float', 'bool', 'list', 'dict', 'len', 'range', 'enumerate', 'if', 'elif', 'else', 'for', 'while', 'def', 'return', 'class', 'import', 'from', 'True', 'False', 'None']
            const label = keywords.find((keyword) => keyword.toLowerCase().startsWith(query))
            return {
              suggestions: label ? [{
                label,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: label,
              }] : [],
            }
          },
      })
    }

    model = createModel(props.filename, props.modelValue)
    editor = monaco.editor.create(container.value, {
      model,
      theme: 'codeventure-dark',
      ariaLabel: 'Python code editor',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 17,
      lineHeight: 27,
      glyphMargin: true,
      roundedSelection: true,
      padding: { top: 10 },
      suggest: { showWords: false, showSnippets: false },
      quickSuggestions: props.autoSuggestionsEnabled,
      suggestOnTriggerCharacters: props.autoSuggestionsEnabled,
      tabSize: 4,
    })
    editor.onDidChangeModelContent(() => emit('update:modelValue', editor.getValue()))
    highlight(props.highlightLine)
    editor.onDidScrollChange(() => updateBubblePosition())
    editor.onDidLayoutChange(() => updateBubblePosition())
  } catch (error) {
    console.error(error)
  }
}

watch(() => props.filename, (filename) => {
  if (!monaco || !editor || filename === model?.uri.path.split('/').pop()) return
  const previousModel = model
  model = createModel(filename, props.modelValue)
  editor.setModel(model)
  previousModel?.dispose()
  debugDecorations = []
  highlight(props.highlightLine)
})

watch(() => props.modelValue, (value) => {
  if (model && value !== model.getValue()) model.setValue(value)
})

watch(() => [props.highlightLine, props.conditionHighlight, props.step], () => highlight(props.highlightLine, props.conditionHighlight || null, props.step))
watch(() => props.autoSuggestionsEnabled, updateSuggestionSettings)

onMounted(init)

onBeforeUnmount(() => {
  disposed = true
  editor?.dispose()
  model?.dispose()
})
</script>

<template>
  <div class="python-editor-shell">
    <div ref="container" class="python-editor" aria-label="Python editor" />
    <DebugStepBubble
      v-if="step"
      :step="step"
      :source-line="getStepSourceLine(step)"
      class="code-debug-step-bubble"
      :class="{ 'below-line': bubbleBelowLine }"
      :style="{ top: `${bubblePosition.top}px`, left: `${bubblePosition.left}px` }"
    />
  </div>
</template>
