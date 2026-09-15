<script lang="ts">
let sharedCompletionProvider: any = null
</script>

<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  filename: string
  highlightLine: number | null
  autoSuggestionsEnabled: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<HTMLElement | null>(null)
let editor: any = null
let monaco: any = null
let model: any = null

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

function highlight(line: number | null) {
  if (!editor) return
  const decorations = line ? [{
    range: new monaco.Range(line, 1, line, 1),
    options: {
      isWholeLine: true,
      className: 'debug-current-line',
      glyphMarginClassName: 'debug-current-glyph',
    },
  }] : []
  editor.deltaDecorations([], decorations)
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
    await loadScript('https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js')
    const amdRequire = (window as any).require
    amdRequire.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } })
    amdRequire(['vs/editor/editor.main'], () => {
      monaco = (window as any).monaco
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
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 15,
        lineHeight: 23,
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
    })
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

watch(() => props.highlightLine, highlight)
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
