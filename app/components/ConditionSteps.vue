<script setup lang="ts">
import type { ConditionEvaluation } from '~/composables/usePythonRuntime'
const props = defineProps<{ steps: { condition: ConditionEvaluation; index: number }[] }>()
const current = computed(() => props.steps.at(-1)?.condition)
const labels = { read: 'Read the condition', substitute: 'Replace with values', result: 'Check the result' }
const explanations = {
  read: 'Which values will Python compare? Find them in Variables.',
  substitute: 'Use the current values. The comparison has not finished yet.',
  result: 'Python has evaluated this part. Press Next step to continue.',
}
</script>

<template>
  <section v-if="current" class="condition-lesson" aria-label="Condition steps" data-testid="condition-check">
    <header><span>CONDITION • STEP {{ steps.length }}</span><h3>{{ labels[current.phase || 'result'] }}</h3></header>
    <div class="condition-focus" role="status" aria-live="polite" aria-atomic="true">
      <code>{{ current.expression }}</code>
      <strong v-if="current.result !== null" :class="current.result ? 'is-true' : 'is-false'">= {{ current.result ? 'True' : 'False' }}</strong>
    </div>
    <p>{{ current.expression.includes('…') ? 'Short-circuit: Python already knows the answer, so it skips the remaining part.' : explanations[current.phase || 'result'] }}</p>
    <details>
      <summary>Steps so far ({{ steps.length }})</summary>
      <ol><li v-for="step in steps" :key="step.index"><span>{{ labels[step.condition.phase || 'result'] }}</span><code>{{ step.condition.expression }}<template v-if="step.condition.result !== null"> → {{ step.condition.result ? 'True' : 'False' }}</template></code></li></ol>
    </details>
  </section>
</template>

<style scoped>
.condition-lesson{--ink:#e4eeff;--muted:#b5c9e7;--surface:#102b50;--accent:#ffda75;margin-top:16px;padding:16px;border:1px solid #526c94;border-radius:14px;background:var(--surface);color:var(--ink);min-width:0}
header span{font-size:12px;letter-spacing:.08em;color:var(--accent);font-weight:700}h3{font-size:19px;line-height:1.4;margin:8px 0 16px}.condition-focus{display:flex;flex-wrap:wrap;gap:12px;padding:16px;background:#071a33;border-radius:10px;border-left:3px solid var(--accent)}code{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/1.6 ui-monospace,monospace}.condition-focus strong{font:700 18px/1.5 ui-monospace,monospace}.is-true{color:#8cefc2}.is-false{color:#ffabb5}p{font-size:16px;line-height:1.6;color:var(--muted);margin:14px 0}summary{cursor:pointer;min-height:44px;align-content:center;font-size:14px;color:var(--ink)}summary:focus-visible{outline:2px solid var(--accent);outline-offset:4px;border-radius:4px}ol{padding-left:24px;margin:8px 0;max-height:240px;overflow:auto}li{padding:8px 0}li span{display:block;font-size:12px;color:var(--muted)}li code{font-size:14px}
</style>
