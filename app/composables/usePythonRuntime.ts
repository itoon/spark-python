export interface PythonRunResult {
  stdout: string
  stderr: string
  error: string | null
  trace: TraceStep[]
  traceTruncated?: boolean
  needsInput: boolean
  inputPrompt?: string
  live?: boolean
  paused?: boolean
}

export interface ConditionEvaluation {
  line: number
  expression: string
  source: string
  result: boolean | null
  phase?: 'read' | 'substitute' | 'result'
  value: VariableValue
}

export interface AssignmentEvaluation {
  line: number
  source: string
  substituted: string
  targets: string[]
  values: Record<string, VariableValue>
  column?: number
}

export interface TraceStep {
  file: string
  line: number
  function: string
  event: 'line' | 'assignment' | 'condition' | 'evaluation' | 'return'
  locals: Record<string, VariableValue>
  stack: StackFrame[]
  stdoutLen?: number
  stderrLen?: number
  condition?: ConditionEvaluation
  assignment?: AssignmentEvaluation
  evaluation?: { source: string; expression: string; column: number }
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
  const control = payload.control ? new Int32Array(payload.control, 0, 2) : null;
  let continuing = false;
  function waitForCommand(message) {
    Atomics.store(control, 0, 0);
    postMessage({ ...message, requestId: payload.requestId });
    while (Atomics.load(control, 0) === 0) Atomics.wait(control, 0, 0);
    return Atomics.load(control, 0);
  }
  pyodide.globals.set('__cv_pause', control ? (step, stdout, stderr) => {
    if (continuing) {
      postMessage({ type: 'debug-history', requestId: payload.requestId, step: JSON.parse(step) });
      return;
    }
    continuing = waitForCommand({ type: 'debug-step', step: JSON.parse(step), stdout, stderr }) === 2;
  } : null);
  pyodide.globals.set('__cv_read_input', control ? (prompt, stdout, stderr) => {
    continuing = false;
    waitForCommand({ type: 'debug-input', prompt, stdout, stderr });
    continuing = false;
    const length = Atomics.load(control, 1);
    const bytes = new Uint8Array(length);
    bytes.set(new Uint8Array(payload.control, 8, length));
    return new TextDecoder().decode(bytes);
  } : null);
  const runner = \`import sys, io, json, traceback, os, builtins, ast, inspect, tokenize
from contextlib import redirect_stdout, redirect_stderr
PROJECT = '/project'
ENTRY = __cv_entry
TRACE_ENABLED = bool(__cv_trace_enabled)
MAX_TRACE = 10000
_live_pause = globals().get('__cv_pause')
_live_input = globals().get('__cv_read_input')
class _CVTrace(list):
    def append(self, step):
        if len(self) >= MAX_TRACE:
            raise RuntimeError('Debug stopped at 10,000 steps.')
        super().append(step)
        if _live_pause and not (step['event'] == 'return' and step['function'] == '<module>'):
            _live_pause(json.dumps(step), _stdout.getvalue(), _stderr.getvalue())
_trace = _CVTrace()
_cv_expressions = {}
_cv_managed_lines = set()
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
        if not _live_input: raise __CVNeedInput(prompt)
        value = str(_live_input(str(prompt), _stdout.getvalue(), _stderr.getvalue()))
    else:
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
    while caller and (id(caller.f_code) in _cv_operand_codes or caller.f_code in (_cv_condition.__code__, _cv_boolop.__code__, _cv_compare.__code__, _cv_assignment.__code__)):
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
            can_reuse_line = not _live_pause and reuse_line and _trace and _trace[-1]['event'] == 'line' and (_trace[-1]['file'], _trace[-1]['line'], _trace[-1]['function']) == location
            if can_reuse_line:
                _trace[-1]['event'] = 'condition'
                _trace[-1]['condition'] = condition
                _trace[-1].update(_io_snapshot())
            else:
                _trace.append({'file': location[0], 'line': location[1], 'function': location[2], 'event': 'condition', 'locals': _locals(caller), 'stack': _stack(caller), 'condition': condition, **_io_snapshot()})
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
def _assignment_display(source, locals_snapshot):
    operator_index = source.find('=')
    while operator_index >= 0:
        before = source[operator_index - 1] if operator_index > 0 else ''
        after = source[operator_index + 1] if operator_index + 1 < len(source) else ''
        if before not in '<>=!' and after != '=' and not (before == '=' or after == '='):
            break
        operator_index = source.find('=', operator_index + 1)
    if operator_index < 0: return source
    right_start = operator_index + 1
    right = source[right_start:]
    try:
        tokens = []
        for token in tokenize.generate_tokens(io.StringIO(right).readline):
            if token.type == tokenize.NAME and token.string in locals_snapshot:
                replacement = locals_snapshot[token.string].get('repr')
                if replacement is not None:
                    token = tokenize.TokenInfo(token.type, str(replacement), token.start, token.end, token.line)
            tokens.append(token)
        right = tokenize.untokenize(tokens)
    except Exception:
        pass
    return source[:right_start] + right
def _record_assignment(caller, line, source, targets, column=None):
    if len(_trace) >= MAX_TRACE: return
    if not caller: return
    filename = caller.f_code.co_filename
    if not (isinstance(filename, str) and filename.startswith(PROJECT)):
        return
    location = (os.path.basename(filename), int(line), caller.f_code.co_name)
    locals_snapshot = _locals(caller)
    values = {target: locals_snapshot[target] for target in targets if target in locals_snapshot}
    before_locals = _trace[-1].get('locals', {}) if _trace and (_trace[-1]['file'], _trace[-1]['line'], _trace[-1]['function']) == location else {}
    assignment = {'line': int(line), 'source': str(source), 'substituted': _assignment_display(str(source), before_locals or locals_snapshot), 'targets': [str(target) for target in targets], 'values': values}
    if column is not None: assignment['column'] = column
    can_reuse_line = not _live_pause and _trace and _trace[-1]['event'] == 'line' and (_trace[-1]['file'], _trace[-1]['line'], _trace[-1]['function']) == location
    if can_reuse_line:
        _trace[-1]['event'] = 'assignment'
        _trace[-1]['assignment'] = assignment
        _trace[-1].update(_io_snapshot())
    else:
        _trace.append({'file': location[0], 'line': location[1], 'function': location[2], 'event': 'assignment', 'locals': locals_snapshot, 'stack': _stack(caller), 'assignment': assignment, **_io_snapshot()})
def _cv_assignment(line, source, targets, column=None):
    _record_assignment(_condition_caller(), line, source, targets, column)
def _cv_begin(key, line, column, source):
    caller = inspect.currentframe().f_back
    context = {'line': line, 'column': column, 'source': source, 'display': source, 'values': []}
    _cv_expressions[(id(caller), key)] = context
    _cv_evaluation(caller, context)
def _cv_evaluation(caller, context):
    _trace.append({'file': os.path.basename(caller.f_code.co_filename), 'line': context['line'], 'function': caller.f_code.co_name, 'event': 'evaluation', 'locals': _locals(caller), 'stack': _stack(caller), **_io_snapshot(), 'evaluation': {'source': context['source'], 'expression': context['display'], 'column': context['column']}})
def _cv_value(key, start, end, value):
    caller = inspect.currentframe().f_back
    context = _cv_expressions.get((id(caller), key))
    if context is None: return value
    # Values come from Python's actual evaluation; never evaluate an operand twice.
    context['values'] = [(left, right, text) for left, right, text in context['values'] if not (start <= left and right <= end)]
    context['values'].append((start, end, _condition_display(value)))
    display = context['source']
    for left, right, text in sorted(context['values'], reverse=True):
        display = display[:left] + text + display[right:]
    if display != context['display']:
        context['display'] = display
        _cv_evaluation(caller, context)
    return value
class _CVExpressionTransformer(ast.NodeTransformer):
    def __init__(self, source, statement, key):
        self.source, self.statement, self.key = source, statement, key
        self.lines = source.splitlines(keepends=True)
        self.origin = self.offset(statement.lineno, statement.col_offset)
    def offset(self, line, column):
        return sum(len(s) for s in self.lines[:line - 1]) + len(self.lines[line - 1].encode('utf-8')[:column].decode('utf-8'))
    def visit(self, node):
        if isinstance(node, ast.Lambda):
            return _CVConditionTransformer(self.source).visit(node)
        # Keep delayed/new scopes and assignment expressions in their native scope.
        if isinstance(node, (ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp, ast.NamedExpr, ast.Await, ast.Yield, ast.YieldFrom)):
            return node
        is_value = isinstance(node, (ast.Name, ast.BinOp, ast.UnaryOp, ast.Call, ast.Attribute, ast.Subscript, ast.Compare, ast.BoolOp, ast.IfExp)) and isinstance(getattr(node, 'ctx', ast.Load()), ast.Load)
        if isinstance(node, ast.Call):
            # Do not substitute the callable itself or keyword names.
            node.args = [self.visit(arg) for arg in node.args]
            for keyword in node.keywords: keyword.value = self.visit(keyword.value)
        else:
            node = self.generic_visit(node)
        if not is_value: return node
        start = self.offset(node.lineno, node.col_offset) - self.origin
        end = self.offset(node.end_lineno, node.end_col_offset) - self.origin
        return ast.copy_location(ast.Call(func=ast.Name(id='_cv_value', ctx=ast.Load()), args=[ast.Constant(self.key), ast.Constant(start), ast.Constant(end), node], keywords=[]), node)
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
    def _target_labels(self, targets):
        labels = []
        def collect(target):
            if isinstance(target, ast.Name):
                labels.append(target.id)
            elif isinstance(target, (ast.Tuple, ast.List)):
                for item in target.elts:
                    collect(item)
            else:
                labels.append(ast.get_source_segment(self.source, target) or ast.unparse(target))
        for target in targets:
            collect(target)
        return labels
    def _assignment_marker(self, node, targets):
        source = ast.get_source_segment(self.source, node) or ast.unparse(node)
        column = None
        if isinstance(node, ast.For):
            source = source.splitlines()[0].strip()
            if isinstance(node.target, ast.Name):
                column = len(self.source.splitlines()[node.target.lineno - 1].encode('utf-8')[:node.target.col_offset].decode('utf-8')) + 1
        marker = ast.Expr(value=ast.Call(func=ast.Name(id='_cv_assignment', ctx=ast.Load()), args=[ast.Constant(value=node.lineno), ast.Constant(value=source), ast.List(elts=[ast.Constant(value=target) for target in targets], ctx=ast.Load()), ast.Constant(column)], keywords=[]))
        return ast.copy_location(marker, node)
    def _with_assignment_marker(self, node, targets):
        return [node, self._assignment_marker(node, targets)]
    def _expression_statement(self, node, value, targets=None):
        source = ast.get_source_segment(self.source, node) or ast.unparse(node)
        key = str(node.lineno) + ':' + str(node.col_offset)
        column = len(self.source.splitlines()[node.lineno - 1].encode('utf-8')[:node.col_offset].decode('utf-8')) + 1
        marker = self._assignment_marker(node, targets) if targets is not None else None
        node.value = _CVExpressionTransformer(self.source, node, key).visit(value)
        _cv_managed_lines.update(range(node.lineno, node.end_lineno + 1))
        begin = ast.copy_location(ast.Expr(value=ast.Call(func=ast.Name(id='_cv_begin', ctx=ast.Load()), args=[ast.Constant(key), ast.Constant(node.lineno), ast.Constant(column), ast.Constant(source)], keywords=[])), node)
        return [begin, node, marker] if marker else [begin, node]
    def visit_Assign(self, node):
        return self._expression_statement(node, node.value, self._target_labels(node.targets))
    def visit_Expr(self, node):
        # Leave docstrings intact.
        if isinstance(node.value, ast.Constant): return node
        return self._expression_statement(node, node.value)
    def visit_Return(self, node):
        if node.value is None: return node
        return self._expression_statement(node, node.value)
    def visit_AnnAssign(self, node):
        if node.value is None:
            return node
        return self._expression_statement(node, node.value, self._target_labels([node.target]))
    def visit_AugAssign(self, node):
        return self._expression_statement(node, node.value, self._target_labels([node.target]))
    def visit_For(self, node):
        iterator = node.iter
        source = ast.get_source_segment(self.source, iterator) or ast.unparse(iterator)
        key = str(iterator.lineno) + ':' + str(iterator.col_offset) + ':iter'
        column = len(self.source.splitlines()[iterator.lineno - 1].encode('utf-8')[:iterator.col_offset].decode('utf-8')) + 1
        node = self.generic_visit(node)
        node.iter = _CVExpressionTransformer(self.source, iterator, key).visit(iterator)
        _cv_managed_lines.add(node.lineno)
        node.body.insert(0, self._assignment_marker(node, self._target_labels([node.target])))
        begin = ast.copy_location(ast.Expr(value=ast.Call(func=ast.Name(id='_cv_begin', ctx=ast.Load()), args=[ast.Constant(key), ast.Constant(iterator.lineno), ast.Constant(column), ast.Constant(source)], keywords=[])), iterator)
        return [begin, node]
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
def _io_snapshot():
    return {'stdoutLen': _stdout.tell(), 'stderrLen': _stderr.tell()}
def _tracer(frame, event, arg):
    if id(frame.f_code) in _cv_operand_codes:
        return None
    if len(_trace) >= MAX_TRACE:
        raise RuntimeError('Debug stopped at 10,000 steps.')
    filename = frame.f_code.co_filename
    if not (isinstance(filename, str) and filename.startswith(PROJECT)):
        return _tracer
    if event in ('line', 'return'):
        if event == 'line' and filename == f'{PROJECT}/{ENTRY}' and frame.f_lineno in _cv_managed_lines:
            return _tracer
        _trace.append({'file': os.path.basename(filename), 'line': frame.f_lineno, 'function': frame.f_code.co_name, 'event': event, 'locals': _locals(frame), 'stack': _stack(frame), **_io_snapshot()})
    return _tracer
_stdout, _stderr = io.StringIO(), io.StringIO()
_error = None
_needs_input = False
_input_prompt = ''
_original_input = builtins.input
try:
    builtins.input = _cv_input
    if TRACE_ENABLED: sys.settrace(_tracer)
    namespace = {'__name__': '__main__', '__file__': f'{PROJECT}/{ENTRY}', '_cv_condition': _cv_condition, '_cv_boolop': _cv_boolop, '_cv_compare': _cv_compare, '_cv_compare_value': _cv_compare_value, '_cv_assignment': _cv_assignment, '_cv_begin': _cv_begin, '_cv_value': _cv_value}
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
    postMessage({ type: 'result', requestId: msg.requestId, result: await runProject({ ...msg.payload, requestId: msg.requestId }) });
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
  let debugControl: Int32Array | null = null
  let debugTrace: TraceStep[] = []
  let stepOverDepth: number | null = null

  function start() {
    if (!import.meta.client) return
    worker.value?.terminate()
    debugControl = null
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
        lastResult.value = { ...message.result, live: !!debugControl, paused: false }
        debugControl = null
      }
      if (message.type === 'debug-step' && message.requestId === activeRequest) {
        debugTrace.push(message.step)
        status.value = 'paused'
        if (stepOverDepth !== null && message.step.stack.length > stepOverDepth) {
          resumeDebug()
          return
        }
        stepOverDepth = null
        lastResult.value = { stdout: message.stdout, stderr: message.stderr, error: null, trace: [...debugTrace], needsInput: false, live: true, paused: true }
      }
      if (message.type === 'debug-history' && message.requestId === activeRequest) {
        debugTrace.push(message.step)
      }
      if (message.type === 'debug-input' && message.requestId === activeRequest) {
        status.value = 'waiting'
        lastResult.value = { stdout: message.stdout, stderr: message.stderr, error: null, trace: [...debugTrace], needsInput: true, inputPrompt: message.prompt, live: true, paused: true }
      }
    }
    nextWorker.onerror = () => {
      workerReady.value = false
      status.value = 'failed'
      error.value = 'Python runtime worker failed.'
    }
    nextWorker.addEventListener('message', () => URL.revokeObjectURL(url), { once: true })
  }

  function canLiveDebug() {
    // SharedArrayBuffer is only available on cross-origin isolated pages
    // (COOP + COEP). GitHub Pages cannot set those headers, so Debug falls
    // back to a precomputed step-through trace there.
    return typeof SharedArrayBuffer !== 'undefined'
  }

  function run(payload: { files: Record<string, string>; entry: string; trace: boolean; inputs: string[] }) {
    // `waiting` means the running program requested input; the worker is still
    // usable and must accept the next replay with the submitted input history.
    if (!workerReady.value || !worker.value) return false
    if (debugControl) return false
    debugControl =
      payload.trace && canLiveDebug()
        ? new Int32Array(new SharedArrayBuffer(65544), 0, 2)
        : null
    debugTrace = []
    stepOverDepth = null
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
        control: debugControl?.buffer,
      },
    })
    return true
  }

  function resumeDebug(continueToEnd = false) {
    if (!debugControl || status.value !== 'paused') return false
    status.value = 'debugging'
    Atomics.store(debugControl, 0, continueToEnd ? 2 : 1)
    Atomics.notify(debugControl, 0)
    return true
  }

  function stepOver(depth: number) {
    stepOverDepth = depth
    return resumeDebug()
  }

  function submitDebugInput(value: string) {
    if (!debugControl || status.value !== 'waiting') return false
    const bytes = new TextEncoder().encode(value)
    if (bytes.length > debugControl.buffer.byteLength - 8) return false
    new Uint8Array(debugControl.buffer, 8).set(bytes)
    Atomics.store(debugControl, 1, bytes.length)
    status.value = 'debugging'
    Atomics.store(debugControl, 0, 1)
    Atomics.notify(debugControl, 0)
    return true
  }

  function stop() {
    worker.value?.terminate()
    worker.value = null
    workerReady.value = false
    start()
  }

  onBeforeUnmount(() => worker.value?.terminate())
  return { status, error, lastResult, start, run, stop, resumeDebug, stepOver, submitDebugInput }
}
