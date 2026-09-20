<script setup lang="ts">
import type { TraceStep } from '~/composables/usePythonRuntime'

const props = defineProps<{
  step: TraceStep
  sourceLine: string
}>()

const displayText = computed(() => {
  const step = props.step
  if (step.evaluation) return step.evaluation.expression

  if (step.event === 'assignment' && step.assignment) {
    // A loop target is the value Thonny shows inline while advancing the loop.
    if (step.assignment.targets.length === 1 && /^\s*for\b/.test(step.assignment.source)) {
      return step.assignment.values[step.assignment.targets[0]]?.repr || step.assignment.targets[0]
    }
    if (step.assignment.targets.some(target => !step.assignment?.values[target])) return step.assignment.substituted.trim()
    return step.assignment.targets.map(target => `${target} = ${step.assignment?.values[target]?.repr}`).join(', ')
  }

  if (step.event === 'condition' && step.condition) {
    return step.condition.phase === 'result' && step.condition.result !== null
      ? String(step.condition.result ? 'True' : 'False')
      : step.condition.expression.trim()
  }

  if (step.event === 'return') {
    if (step.function === '<module>') return props.sourceLine.trim()
    return `${step.function}() → return`
  }
  return props.sourceLine.trim()
})

const accessibleLabel = computed(() => `Debug value: ${displayText.value}`)
</script>

<template>
  <span
    class="debug-step-bubble"
    data-testid="debug-step-bubble"
    :aria-label="accessibleLabel"
  >
    <code class="debug-bubble-value">{{ displayText }}</code>
  </span>
</template>

<style scoped>
.debug-step-bubble {
  --bubble-ink: #fff2a8;
  position: absolute;
  display: block;
  width: max-content;
  max-width: min(280px, calc(100% - 24px));
  margin: 0;
  padding: 3px 7px;
  border: 1px solid rgba(180, 220, 189, .72);
  border-radius: 3px;
  background: #667348;
  color: var(--bubble-ink);
  box-shadow: 0 3px 10px rgba(2, 11, 29, .32);
  pointer-events: none;
  transform: translateY(-50%);
  white-space: nowrap;
}

.debug-bubble-value {
  display: block;
  overflow: hidden;
  max-width: 100%;
  color: inherit;
  font: 17px/1.25 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
