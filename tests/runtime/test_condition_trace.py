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
    def test_assignment_evaluates_each_operand_in_order(self):
        result = debug('x = 20\ny = 30\nz = x + y\nprint(z)\n')
        self.assertIsNone(result['error'])
        steps = [s for s in result['trace'] if s['line'] == 3 and 'evaluation' in s]
        self.assertEqual([s['evaluation']['expression'] for s in steps], [
            'z = x + y', 'z = 20 + y', 'z = 20 + 30', 'z = 50',
        ])
        self.assertTrue(all('z' not in s['locals'] for s in steps))
        self.assertTrue(all(s['stdoutLen'] == 0 for s in steps))
        committed = next(s for s in result['trace'] if s['line'] == 3 and s['event'] == 'assignment')
        self.assertEqual(committed['locals']['z']['value'], 50)
        print_steps = [s for s in result['trace'] if 'evaluation' in s and s['line'] == 4]
        self.assertEqual([s['evaluation']['expression'] for s in print_steps][:2], ['print(z)', 'print(50)'])
        self.assertEqual(print_steps[1]['stdoutLen'], 0)
        self.assertEqual(result['stdout'], '50\n')

    def test_expression_calls_execute_once_and_preserve_precedence(self):
        result = debug('calls = []\ndef take(n):\n    calls.append(n)\n    return n\nz = take(20) + take(30) * 2\nprint(z, calls)\n')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], '80 [20, 30]\n')
        self.assertEqual([s['evaluation']['expression'] for s in result['trace'] if s['line'] == 5 and 'evaluation' in s], [
            'z = take(20) + take(30) * 2', 'z = 20 + take(30) * 2', 'z = 20 + 30 * 2', 'z = 20 + 60', 'z = 80',
        ])

    def test_substitution_does_not_change_strings_or_keyword_labels(self):
        result = debug('x = 20\ntext = "x"\nprint(text, x, sep="x")\n')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], 'xx20\n')
        self.assertIn('print(\'x\', 20, sep="x")', [s['evaluation']['expression'] for s in result['trace'] if 'evaluation' in s])

    def test_expression_short_circuit_and_recursion(self):
        result = debug('x = False and missing\ny = True or missing\ndef f(n):\n    if n == 0:\n        return 1\n    return n * f(n - 1)\nz = f(4)\nprint(x, y, z)\n')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], 'False True 24\n')

    def test_loop_iterator_is_evaluated_once(self):
        result = debug('for i in range(2):\n    print(i)\n')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], '0\n1\n')
        self.assertEqual([s['evaluation']['expression'] for s in result['trace'] if s['line'] == 1 and 'evaluation' in s], ['range(2)', 'range(0, 2)'])

    def test_loop_target_column_does_not_match_the_r_in_for(self):
        result = debug('for r in range(2):\n    print(r)\n')
        steps = [s for s in result['trace'] if s['event'] == 'assignment']
        self.assertEqual([s['assignment']['column'] for s in steps], [5, 5])

    def test_assignments_create_explainable_debug_steps(self):
        result = debug('x = 5\ny = x + 2\nx = x + 1\ny += 1\n')
        assignments = [step for step in result['trace'] if step['event'] == 'assignment']
        self.assertEqual([step['assignment']['source'] for step in assignments], ['x = 5', 'y = x + 2', 'x = x + 1', 'y += 1'])
        self.assertEqual(assignments[0]['assignment']['values']['x']['value'], 5)
        self.assertEqual(assignments[1]['assignment']['values']['y']['value'], 7)
        self.assertEqual(assignments[1]['assignment']['substituted'], 'y = 5 + 2')
        self.assertEqual(assignments[2]['assignment']['values']['x']['value'], 6)
        self.assertEqual(assignments[2]['assignment']['substituted'], 'x = 5 + 1')
        self.assertEqual(assignments[3]['assignment']['values']['y']['value'], 8)

    def test_for_loop_values_are_visible_as_variable_updates(self):
        result = debug('total = 0\nfor i in range(2):\n    total += i\n')
        loop_steps = [step for step in result['trace'] if step['event'] == 'assignment' and step['line'] == 2]
        self.assertEqual([step['assignment']['source'] for step in loop_steps], ['for i in range(2):', 'for i in range(2):'])
        self.assertEqual([step['assignment']['values']['i']['value'] for step in loop_steps], [0, 1])

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

    def test_trace_steps_capture_stdout_progressively(self):
        result = debug('print("one")\nprint("two")\n')
        self.assertIsNone(result['error'])
        self.assertEqual(result['stdout'], 'one\ntwo\n')
        lengths = [step['stdoutLen'] for step in result['trace']]
        self.assertEqual(lengths[0], 0)
        self.assertIn(len('one\n'), lengths)
        self.assertEqual(lengths[-1], len(result['stdout']))
        stdout_at_steps = [result['stdout'][:length] for length in lengths]
        first_print_index = stdout_at_steps.index('one\n')
        self.assertTrue(all(value != 'one\ntwo\n' for value in stdout_at_steps[:first_print_index]))


if __name__ == '__main__':
    unittest.main()
