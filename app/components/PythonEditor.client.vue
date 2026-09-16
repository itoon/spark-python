<script lang="ts">
let sharedCompletionProvider: any = null
let sharedMonaco: any = null
let sharedMonacoPromise: Promise<any> | null = null
</script>

<script setup lang="ts">
import type { ConditionEvaluation } from '~/composables/usePythonRuntime'

const props = defineProps<{
  modelValue: string
  filename: string
  highlightLine: number | null
  autoSuggestionsEnabled: boolean
  conditionHighlight?: ConditionEvaluation | null
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<HTMLElement | null>(null)
let editor: any = null
let monaco: any = null
let model: any = null
let debugDecorations: string[] = []

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

function highlight(line: number | null, condition: ConditionEvaluation | null = props.conditionHighlight || null) {
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
          after: {
            content: condition.result === null ? `  ⇒ ${condition.expression}` : condition.expression === condition.source
              ? `  = ${condition.result ? 'True' : 'False'}`
              : `  ⇒ ${condition.expression} = ${condition.result ? 'True' : 'False'}`,
            inlineClassName: condition.result === null ? 'debug-condition-expression' : condition.result ? 'debug-condition-result-true' : 'debug-condition-result-false',
          },
        },
      })
    }
  }
  debugDecorations = editor.deltaDecorations(debugDecorations, decorations)
  if (line) {
    editor.revealLineInCenter(line)
    editor.setPosition({ lineNumber: line, column: 1 })
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
  } catch (error) {
    console.error(error)
  }
}

watch(() => props.filename, (filename) => {
  if (!monaco || !editor || filename === model?.uri.path.split('/').pop()) return
  model = createModel(filename, props.modelValue)
  editor.setModel(model)
  highlight(props.highlightLine)
})

watch(() => props.modelValue, (value) => {
  if (model && value !== model.getValue()) model.setValue(value)
})

watch(() => [props.highlightLine, props.conditionHighlight], () => highlight(props.highlightLine, props.conditionHighlight || null))
watch(() => props.autoSuggestionsEnabled, updateSuggestionSettings)

onMounted(init)

onBeforeUnmount(() => {
  editor?.dispose()
  model?.dispose()
})
</script>

<template>
  <div ref="container" class="python-editor" aria-label="Python editor" />
</template>
