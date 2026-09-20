<script setup lang="ts">
import type { ConditionEvaluation } from '~/composables/usePythonRuntime'
const props = defineProps<{ steps: { condition: ConditionEvaluation; index: number }[]; showFullTrail?: boolean }>()
const current = computed(() => props.steps.at(-1)?.condition)
const visibleSteps = computed(() => props.showFullTrail ? props.steps : props.steps.slice(-1))
</script>

<template>
  <section v-if="current" class="condition-lesson" aria-label="Condition values" data-testid="condition-check">
    <div class="condition-bubble-tail" aria-hidden="true" />
    <div class="condition-value-stack" role="status" aria-live="polite" aria-atomic="true">
      <div v-for="step in visibleSteps" :key="step.index" class="condition-value-row" :class="{ active: step.index === steps.at(-1)?.index }">
        <code>{{ step.condition.expression }}</code>
        <strong v-if="step.condition.result !== null" class="condition-value-result" :class="step.condition.result ? 'is-true' : 'is-false'">
          {{ step.condition.result ? 'True' : 'False' }}
        </strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.condition-lesson{--ink:#e4eeff;--surface:#102b50;--accent:#ffda75;position:relative;margin-top:16px;padding:9px;border:1px solid #526c94;border-radius:12px;background:var(--surface);color:var(--ink);min-width:0;box-shadow:0 12px 28px rgba(2,11,29,.2)}
.code-condition-bubble{position:absolute;z-index:20;width:min(280px,calc(100% - 24px));margin:0;pointer-events:none}.code-condition-bubble.below-line .condition-bubble-tail{top:-9px;left:28px;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:9px solid var(--surface);filter:drop-shadow(0 -1px 0 #526c94)}.code-condition-bubble:not(.below-line) .condition-bubble-tail{top:50%;left:-9px;transform:translateY(-50%);border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:9px solid var(--surface);filter:drop-shadow(-1px 0 0 #526c94)}.code-condition-bubble:not(.below-line){transform:translateY(-50%)}
.condition-bubble-tail{position:absolute;width:0;height:0;background:transparent}.condition-value-stack{display:grid;gap:3px}.condition-value-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;min-height:34px;padding:4px 8px;border-radius:7px;background:rgba(4,25,61,.42)}.condition-value-row.active{background:rgba(255,199,44,.13);box-shadow:inset 2px 0 0 var(--accent)}.condition-value-row code{min-width:0;color:#dce8ff;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.4 ui-monospace,monospace}.condition-value-result{font:800 14px/1.4 ui-monospace,monospace}.is-true{color:#8cefc2}.is-false{color:#ffabb5}
</style>
