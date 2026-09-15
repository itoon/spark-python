export interface PythonRunResult {
  stdout: string
  stderr: string
  error: string | null
  trace: TraceStep[]
  traceTruncated?: boolean
  needsInput: boolean
  inputPrompt?: string
}

export interface TraceStep {
  file: string
  line: number
  function: string
  event: 'line' | 'return'
  locals: Record<string, VariableValue>
  stack: StackFrame[]
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
  const runner = \`import sys, io, json, traceback, os, builtins
from contextlib import redirect_stdout, redirect_stderr
PROJECT = '/project'
ENTRY = __cv_entry
TRACE_ENABLED = bool(__cv_trace_enabled)
MAX_TRACE = 10000
_trace = []
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
def _stack(frame):
    rows = []
    f = frame
    while f:
        filename = f.f_code.co_filename
        if isinstance(filename, str) and filename.startswith(PROJECT):
            rows.append({'file': os.path.basename(filename), 'function': f.f_code.co_name, 'line': f.f_lineno})
        f = f.f_back
    rows.reverse()
    return rows
def _tracer(frame, event, arg):
    if len(_trace) >= MAX_TRACE:
        return None
    filename = frame.f_code.co_filename
    if not (isinstance(filename, str) and filename.startswith(PROJECT)):
        return _tracer
    if event in ('line', 'return'):
        locals_snapshot = {}
        for k, v in frame.f_locals.items():
            if not k.startswith('__'):
                try: locals_snapshot[k] = _safe(v)
                except Exception: locals_snapshot[k] = {'type': type(v).__name__, 'repr': '<unavailable>'}
        _trace.append({'file': os.path.basename(filename), 'line': frame.f_lineno, 'function': frame.f_code.co_name, 'event': event, 'locals': locals_snapshot, 'stack': _stack(frame)})
    return _tracer
_stdout, _stderr = io.StringIO(), io.StringIO()
_error = None
_needs_input = False
_input_prompt = ''
_original_input = builtins.input
try:
    builtins.input = _cv_input
    if TRACE_ENABLED: sys.settrace(_tracer)
    namespace = {'__name__': '__main__', '__file__': f'{PROJECT}/{ENTRY}'}
    with redirect_stdout(_stdout), redirect_stderr(_stderr):
        source = open(f'{PROJECT}/{ENTRY}', encoding='utf-8').read()
        exec(compile(source, f'{PROJECT}/{ENTRY}', 'exec'), namespace, namespace)
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
