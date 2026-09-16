"""Run the worker's actual Python runner with CPython, without CDN/browser setup."""
import ast
import json
from pathlib import Path
import tempfile
import unittest


def debug(source):
    runtime = (Path(__file__).resolve().parents[2] / 'app/composables/usePythonRuntime.ts').read_text()
    runner = runtime.split('const runner = \\`', 1)[1].split('\\`', 1)[0]
    with tempfile.TemporaryDirectory() as project:
        Path(project, 'main.py').write_text(source)
        runner = runner.replace("PROJECT = '/project'", f'PROJECT = {project!r}')
        tree = ast.parse(runner)
        result = tree.body.pop()
        namespace = {'__cv_entry': 'main.py', '__cv_trace_enabled': True, '__cv_inputs_json': '[]'}
        exec(compile(tree, '<runner>', 'exec'), namespace)
        return json.loads(eval(compile(ast.Expression(result.value), '<result>', 'eval'), namespace))


class ConditionTraceTests(unittest.TestCase):
    def test_module_variables_survive_every_condition_step(self):
        result = debug('x = 50\ny = 20\nif x > 30 and y == 20:\n    print("Hello World")\n')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], 'Hello World\n')
        for step in result['trace']:
            if step['line'] == 3:
                self.assertEqual(step['locals'].get('x', {}).get('value'), 50, step)
                self.assertEqual(step['locals'].get('y', {}).get('value'), 20, step)
            self.assertNotEqual(step['function'], '<lambda>')
        conditions = [s['condition']['expression'] for s in result['trace'] if 'condition' in s]
        self.assertEqual(conditions, ['x > 30', '50 > 30', '50 > 30', 'y == 20', '20 == 20', '20 == 20', 'True and True'])
        self.assertEqual([s['condition']['result'] for s in result['trace'] if 'condition' in s], [None, None, True, None, None, True, True])

    def test_real_calls_keep_locals_and_hide_only_generated_stack_frames(self):
        result = debug('def check(value):\n    return value == 20\nx = 50\nif x > 30 and check(20):\n    print("yes")\n')
        self.assertIsNone(result['error'])
        calls = [s for s in result['trace'] if s['function'] == 'check']
        self.assertTrue(calls)
        for step in calls:
            self.assertEqual(step['locals']['value']['value'], 20)
            self.assertNotIn('<lambda>', [f['function'] for f in step['stack']])

    def test_user_lambda_remains_visible(self):
        result = debug('check = lambda value: value > 10\nif True and check(20):\n    print("yes")\n')
        self.assertIsNone(result['error'])
        steps = [s for s in result['trace'] if s['function'] == '<lambda>']
        self.assertTrue(steps)
        self.assertTrue(any('condition' in s for s in steps))
        for step in steps:
            self.assertEqual(step['locals']['value']['value'], 20)

    def test_short_circuit_skips_right_operand(self):
        result = debug('x = 0\nif x > 30 and missing_name:\n    print("no")\n')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], '')
        self.assertFalse(any(s['function'] == '<lambda>' for s in result['trace']))

    def test_nested_groups_and_operands_execute_once(self):
        result = debug('calls = []\ndef value():\n    calls.append(1)\n    return 50\ny = 20\nif (value() > 30 and y == 20) or missing_name:\n    print(len(calls))\n')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], '1\n')
        conditions = [s['condition'] for s in result['trace'] if 'condition' in s]
        self.assertTrue(any(c['expression'] == '50 > 30' and c['phase'] == 'substitute' for c in conditions))
        self.assertEqual(conditions[-2]['expression'], 'True and True')
        self.assertEqual(conditions[-1]['expression'], 'True or …')

    def test_chained_comparison_preserves_short_circuit(self):
        result = debug('x = 50\nif x < 30 < missing_name:\n    print("no")\n')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], '')


if __name__ == '__main__':
    unittest.main()
