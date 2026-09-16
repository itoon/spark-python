export interface PythonRunResult {
  stdout: string
  stderr: string
  error: string | null
  trace: TraceStep[]
  traceTruncated?: boolean
  needsInput: boolean
  inputPrompt?: string
}

export interface ConditionEvaluation {
  line: number
  expression: string
  source: string
  result: boolean | null
  phase?: 'read' | 'substitute' | 'result'
  value: VariableValue
}

export interface TraceStep {
  file: string
  line: number
  function: string
  event: 'line' | 'condition' | 'return'
  locals: Record<string, VariableValue>
  stack: StackFrame[]
  condition?: ConditionEvaluation
}

export interface VariableValue {
  type: string
  repr: string
  value?: unknown
}

export interface StackFrame {
  file: string
  line: number
  function: string
}

const WORKER_SOURCE = `
let pyodide = null;
let ready = false;

async function boot() {
  try {
    importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');
    pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/' });
    ready = true;
    postMessage({ type: 'ready' });
  } catch (err) {
    postMessage({ type: 'boot-error', error: String(err) });
  }
}
boot();

async function runProject(payload) {
  if (!ready) throw new Error('Python runtime is still loading.');
  const files = payload.files || {};
  const entry = payload.entry || 'main.py';
  const traceEnabled = !!payload.trace;
  const inputs = Array.isArray(payload.inputs) ? payload.inputs : [];
  try { pyodide.FS.mkdirTree('/project'); } catch (_) {}
  try {
    for (const name of pyodide.FS.readdir('/project')) {
      if (name !== '.' && name !== '..') {
        try { pyodide.FS.unlink('/project/' + name); } catch (_) {}
      }
    }
  } catch (_) {}
  for (const [name, content] of Object.entries(files)) {
    if (name.endsWith('.py')) pyodide.FS.writeFile('/project/' + name, content, { encoding: 'utf8' });
  }
  pyodide.globals.set('__cv_entry', entry);
  pyodide.globals.set('__cv_trace_enabled', traceEnabled);
  pyodide.globals.set('__cv_inputs_json', JSON.stringify(inputs));
  const runner = \`import sys, io, json, traceback, os, builtins, ast, inspect
from contextlib import redirect_stdout, redirect_stderr
PROJECT = '/project'
ENTRY = __cv_entry
TRACE_ENABLED = bool(__cv_trace_enabled)
MAX_TRACE = 10000
_trace = []
_cv_operand_codes = set()
_cv_comparisons = []
_cv_inputs = json.loads(__cv_inputs_json)
_cv_input_index = 0
class __CVNeedInput(Exception):
    def __init__(self, prompt=''):
        super().__init__(prompt)
        self.prompt = str(prompt)
def _cv_input(prompt=''):
    global _cv_input_index
    if _cv_input_index >= len(_cv_inputs):
        raise __CVNeedInput(prompt)
    value = str(_cv_inputs[_cv_input_index])
    _cv_input_index += 1
    print(str(prompt), end='')
    print(value)
    return value
if PROJECT not in sys.path:
    sys.path.insert(0, PROJECT)
for _name, _mod in list(sys.modules.items()):
    _file = getattr(_mod, '__file__', '') or ''
    if isinstance(_file, str) and _file.startswith(PROJECT):
        sys.modules.pop(_name, None)
def _safe(value, depth=0):
    if depth > 2:
        return {'type': type(value).__name__, 'repr': repr(value)[:120]}
    if value is None or isinstance(value, (bool, int, float, str)):
        return {'type': type(value).__name__, 'value': value, 'repr': repr(value)[:200]}
    if isinstance(value, (list, tuple)):
        return {'type': type(value).__name__, 'value': [_safe(v, depth+1) for v in value[:20]], 'repr': repr(value)[:300]}
    if isinstance(value, dict):
        return {'type': 'dict', 'value': [[repr(k)[:80], _safe(v, depth+1)] for k, v in list(value.items())[:20]], 'repr': repr(value)[:300]}
    return {'type': type(value).__name__, 'repr': repr(value)[:300]}
def _locals(frame):
    locals_snapshot = {}
    for k, v in frame.f_locals.items():
        if not k.startswith('__') and not k.startswith('_cv_'):
            try: locals_snapshot[k] = _safe(v)
            except Exception: locals_snapshot[k] = {'type': type(v).__name__, 'repr': '<unavailable>'}
    return locals_snapshot
def _condition_caller():
    caller = inspect.currentframe().f_back
    while caller and (id(caller.f_code) in _cv_operand_codes or caller.f_code in (_cv_condition.__code__, _cv_boolop.__code__, _cv_compare.__code__)):
        caller = caller.f_back
    return caller
def _record_condition(caller, line, expression, value, reuse_line, source=None, phase='result'):
    result = bool(value) if phase == 'result' else None
    condition = {'line': int(line), 'expression': str(expression), 'source': str(source or expression), 'result': result, 'value': _safe(value), 'phase': phase}
    if len(_trace) >= MAX_TRACE: return value
    if caller:
        filename = caller.f_code.co_filename
        if isinstance(filename, str) and filename.startswith(PROJECT):
            location = (os.path.basename(filename), int(line), caller.f_code.co_name)
            can_reuse_line = reuse_line and _trace and _trace[-1]['event'] == 'line' and (_trace[-1]['file'], _trace[-1]['line'], _trace[-1]['function']) == location
            if can_reuse_line:
                _trace[-1]['event'] = 'condition'
                _trace[-1]['condition'] = condition
            else:
                _trace.append({'file': location[0], 'line': location[1], 'function': location[2], 'event': 'condition', 'locals': _locals(caller), 'stack': _stack(caller), 'condition': condition})
    return value
def _cv_condition(line, expression, value, reuse_line=True):
    return _record_condition(_condition_caller(), line, expression, value, reuse_line, expression)
def _cv_compare_value(start, end, value):
    context = _cv_comparisons[-1]
    context['values'].append((start, end, _condition_display(value)))
    display = context['source']
    for left, right, replacement in sorted(context['values'], reverse=True):
        display = display[:left] + replacement + display[right:]
    if display != context['display']:
        context['display'] = display
        _record_condition(context['caller'], context['line'], display, None, False, context['source'], 'substitute')
    return value
def _cv_compare(line, source, evaluate):
    _cv_operand_codes.add(id(evaluate.__code__))
    caller = _condition_caller()
    _record_condition(caller, line, source, None, True, source, 'read')
    context = {'caller': caller, 'line': line, 'source': source, 'display': source, 'values': []}
    _cv_comparisons.append(context)
    try:
        value = evaluate()
        return _record_condition(caller, line, context['display'], value, False, source)
    finally:
        _cv_comparisons.pop()
def _condition_display(value):
    if isinstance(value, bool): return 'True' if value else 'False'
    if value is None: return 'None'
    return repr(value)[:80]
def _cv_boolop(line, source, operator, operands):
    # Only these generated operands are internal; learner-written lambdas remain visible.
    _cv_operand_codes.update(id(operand.__code__) for operand in operands)
    caller = _condition_caller()
    values = []
    if operator == 'and':
        for operand in operands:
            value = operand()
            values.append(value)
            if not value: break
    else:
        for operand in operands:
            value = operand()
            values.append(value)
            if value: break
    result = values[-1] if values else None
    display = (' ' + operator + ' ').join(_condition_display(value) for value in values)
    if len(values) < len(operands): display += ' ' + operator + ' …'
    _record_condition(caller, line, display, result, False, source)
    return result
class _CVConditionTransformer(ast.NodeTransformer):
    def __init__(self, source):
        self.source = source
    def _condition_call(self, node, reuse_line=True):
        expression = ast.get_source_segment(self.source, node) or ast.unparse(node)
        wrapped = ast.Call(func=ast.Name(id='_cv_condition', ctx=ast.Load()), args=[ast.Constant(value=node.lineno), ast.Constant(value=expression), node, ast.Constant(value=reuse_line)], keywords=[])
        return ast.copy_location(wrapped, node)
    def visit_Compare(self, node):
        source = ast.get_source_segment(self.source, node) or ast.unparse(node)
        lines = self.source.splitlines(keepends=True)
        def offset(line, column):
            return sum(len(s) for s in lines[:line - 1]) + len(lines[line - 1].encode('utf-8')[:column].decode('utf-8'))
        origin = offset(node.lineno, node.col_offset)
        spans = [(offset(part.lineno, part.col_offset) - origin, offset(part.end_lineno, part.end_col_offset) - origin) for part in [node.left] + node.comparators]
        node = self.generic_visit(node)
        values = [ast.copy_location(ast.Call(func=ast.Name(id='_cv_compare_value', ctx=ast.Load()), args=[ast.Constant(value=start), ast.Constant(value=end), part], keywords=[]), part) for part, (start, end) in zip([node.left] + node.comparators, spans)]
        node.left, node.comparators = values[0], values[1:]
        evaluate = ast.Lambda(args=ast.arguments(posonlyargs=[], args=[], vararg=None, kwonlyargs=[], kw_defaults=[], kwarg=None, defaults=[]), body=node)
        return ast.copy_location(ast.Call(func=ast.Name(id='_cv_compare', ctx=ast.Load()), args=[ast.Constant(value=node.lineno), ast.Constant(value=source), evaluate], keywords=[]), node)
    def visit_BoolOp(self, node):
        node = self.generic_visit(node)
        operator = 'and' if isinstance(node.op, ast.And) else 'or'
        lambdas = [ast.Lambda(args=ast.arguments(posonlyargs=[], args=[], vararg=None, kwonlyargs=[], kw_defaults=[], kwarg=None, defaults=[]), body=value) for value in node.values]
        wrapped = ast.Call(func=ast.Name(id='_cv_boolop', ctx=ast.Load()), args=[ast.Constant(value=node.lineno), ast.Constant(value=ast.get_source_segment(self.source, node) or ast.unparse(node)), ast.Constant(value=operator), ast.List(elts=lambdas, ctx=ast.Load())], keywords=[])
        return ast.copy_location(wrapped, node)
    def _ensure_test(self, node):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in ('_cv_condition', '_cv_boolop', '_cv_compare'):
            return node
        return self._condition_call(node)
    def visit_If(self, node):
        node = self.generic_visit(node)
        node.test = self._ensure_test(node.test)
        return node
    def visit_While(self, node):
        node = self.generic_visit(node)
        node.test = self._ensure_test(node.test)
        return node
def _stack(frame):
    rows = []
    f = frame
    while f:
        filename = f.f_code.co_filename
        if isinstance(filename, str) and filename.startswith(PROJECT) and id(f.f_code) not in _cv_operand_codes:
            rows.append({'file': os.path.basename(filename), 'function': f.f_code.co_name, 'line': f.f_lineno})
        f = f.f_back
    rows.reverse()
    return rows
def _tracer(frame, event, arg):
    if id(frame.f_code) in _cv_operand_codes:
        return None
    if len(_trace) >= MAX_TRACE:
        return None
    filename = frame.f_code.co_filename
    if not (isinstance(filename, str) and filename.startswith(PROJECT)):
        return _tracer
    if event in ('line', 'return'):
        _trace.append({'file': os.path.basename(filename), 'line': frame.f_lineno, 'function': frame.f_code.co_name, 'event': event, 'locals': _locals(frame), 'stack': _stack(frame)})
    return _tracer
_stdout, _stderr = io.StringIO(), io.StringIO()
_error = None
_needs_input = False
_input_prompt = ''
_original_input = builtins.input
try:
    builtins.input = _cv_input
    if TRACE_ENABLED: sys.settrace(_tracer)
    namespace = {'__name__': '__main__', '__file__': f'{PROJECT}/{ENTRY}', '_cv_condition': _cv_condition, '_cv_boolop': _cv_boolop, '_cv_compare': _cv_compare, '_cv_compare_value': _cv_compare_value}
    with redirect_stdout(_stdout), redirect_stderr(_stderr):
        source = open(f'{PROJECT}/{ENTRY}', encoding='utf-8').read()
        if TRACE_ENABLED:
            tree = _CVConditionTransformer(source).visit(ast.parse(source, filename=f'{PROJECT}/{ENTRY}'))
            ast.fix_missing_locations(tree)
            code = compile(tree, f'{PROJECT}/{ENTRY}', 'exec')
        else:
            code = compile(source, f'{PROJECT}/{ENTRY}', 'exec')
        exec(code, namespace, namespace)
except __CVNeedInput as exc:
    _needs_input = True
    _input_prompt = exc.prompt
except BaseException:
    _error = traceback.format_exc()
finally:
    sys.settrace(None)
    builtins.input = _original_input
json.dumps({'stdout': _stdout.getvalue(), 'stderr': _stderr.getvalue(), 'error': _error, 'trace': _trace, 'traceTruncated': len(_trace) >= MAX_TRACE, 'needsInput': _needs_input, 'inputPrompt': _input_prompt, 'inputsConsumed': _cv_input_index})\`
  const resultJson = await pyodide.runPythonAsync(runner);
  return JSON.parse(resultJson);
}
onmessage = async (event) => {
  const msg = event.data || {};
  if (msg.type !== 'run') return;
  try {
    postMessage({ type: 'result', requestId: msg.requestId, result: await runProject(msg.payload || {}) });
  } catch (err) {
    postMessage({ type: 'result', requestId: msg.requestId, result: { stdout: '', stderr: '', error: String(err), trace: [], needsInput: false } });
  }
};
`

export function usePythonRuntime() {
  const status = ref('loading')
  const error = ref<string | null>(null)
  const lastResult = ref<PythonRunResult | null>(null)
  const worker = shallowRef<Worker | null>(null)
  const workerReady = ref(false)
  let requestId = 0
  let activeRequest = 0

  function start() {
    if (!import.meta.client) return
    worker.value?.terminate()
    workerReady.value = false
    status.value = 'loading'
    error.value = null
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
    const nextWorker = new Worker(url)
    worker.value = nextWorker
    nextWorker.onmessage = (event) => {
      const message = event.data || {}
      if (message.type === 'ready') {
        workerReady.value = true
        status.value = 'ready'
      }
      if (message.type === 'boot-error') {
        workerReady.value = false
        status.value = 'failed'
        error.value = message.error || 'Python runtime failed to start.'
      }
      if (message.type === 'result' && message.requestId === activeRequest) {
        status.value = 'ready'
        lastResult.value = message.result
      }
    }
    nextWorker.onerror = () => {
      workerReady.value = false
      status.value = 'failed'
      error.value = 'Python runtime worker failed.'
    }
    nextWorker.addEventListener('message', () => URL.revokeObjectURL(url), { once: true })
  }

  function run(payload: { files: Record<string, string>; entry: string; trace: boolean; inputs: string[] }) {
    // `waiting` means the running program requested input; the worker is still
    // usable and must accept the next replay with the submitted input history.
    if (!workerReady.value || !worker.value) return false
    activeRequest = ++requestId
    status.value = payload.trace ? 'debugging' : 'running'
    // Vue refs expose reactive proxies. Worker.postMessage() uses the
    // structured clone algorithm and cannot clone those proxies, which is
    // especially important when resuming after input() with a reactive array.
    worker.value.postMessage({
      type: 'run',
      requestId: activeRequest,
      payload: {
        ...payload,
        files: { ...payload.files },
        inputs: [...payload.inputs],
      },
    })
    return true
  }

  function stop() {
    worker.value?.terminate()
    worker.value = null
    workerReady.value = false
    start()
  }

  onBeforeUnmount(() => worker.value?.terminate())
  return { status, error, lastResult, start, run, stop }
}
