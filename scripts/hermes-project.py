#!/usr/bin/env python3
"""Read-only project doctor and ownership-checked delegation brief generator."""
import argparse
import fnmatch
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def load_team(root=ROOT):
    return json.loads((root / 'ops/hermes/team.json').read_text())

def validate_plan(team, tasks):
    if not isinstance(tasks, list) or not tasks or len(tasks) > team['max_parallel']:
        raise ValueError('Plan requires 1..%s tasks per batch' % team['max_parallel'])
    owned = {}
    for task in tasks:
        if not isinstance(task, dict):
            raise ValueError('Each task must be an object')
        role = task.get('role')
        if not isinstance(role, str) or role not in team['roles'] or role == 'lead':
            raise ValueError('Choose a specialist role, not the lead')
        if not isinstance(task.get('goal'), str) or not task['goal'].strip():
            raise ValueError('Each task needs a goal')
        files = task.get('files')
        if not isinstance(files, list):
            raise ValueError('files must be explicitly supplied as a list; [] means read-only')
        for file in files:
            if not isinstance(file, str) or not file.strip():
                raise ValueError('file path must be a non-empty string')
            p = Path(file)
            if p.is_absolute() or '..' in p.parts or '\\' in file or any(c in file for c in '*?['):
                raise ValueError('Only exact relative file paths are allowed')
            absolute = (ROOT / p).resolve()
            try:
                resolved = absolute.relative_to(ROOT.resolve()).as_posix()
            except ValueError as error:
                raise ValueError('Symlink path escapes repository') from error
            if absolute.is_dir():
                raise ValueError('Directories cannot be claimed; list exact files')
            key = resolved.casefold()
            if not all(any(fnmatch.fnmatchcase(candidate, pat) for pat in team['roles'][role]['write']) for candidate in [p.as_posix(), resolved]):
                raise ValueError(f'{role} does not own {file}; hand off to lead')
            for prior, owner in owned.items():
                if key == prior or key.startswith(prior + '/') or prior.startswith(key + '/'):
                    raise ValueError(f'File/ancestor collision: {file} ({owner}, {role})')
            owned[key] = role
    return True

def brief(team, task):
    role = team['roles'][task['role']]
    return {
        'goal': f"ProPig {role['name']}: {task['goal']}",
        'context': '\n'.join([
            f'Repository: {ROOT}. Read AGENTS.md and docs/hermes-project-operations.md first.',
            'Role: ' + role['scope'],
            'Load skills: ' + ', '.join(role['skills']),
            'Allowed writes ONLY: ' + (', '.join(task['files']) or 'NONE (read-only)'),
            'Before work record branch/dirty state. Preserve all existing user changes.',
            'No reset/clean/whole formatter, credential changes, remote data writes, paid calls, commit/push/deploy.',
            'No server/build/package/lockfile/global config changes; integration lead owns these.',
            'Do not recursively delegate. Report blockers rather than expanding scope.',
            'Candidate checks (choose relevant; missing auth/server = not verified): ' + ', '.join(role['gates']),
            'Return Korean: root cause, exact files, actual command+exit+evidence, regressions, limits, pending work.',
            'Never claim a fixture is a production data write. Parent independently verifies returned artifacts.',
        ]),
        'role': 'leaf',
    }

def doctor(root=ROOT):
    team = load_team(root)
    pkg = json.loads((root / 'package.json').read_text())
    failures = []
    required = ['AGENTS.md', 'docs/hermes-project-operations.md', 'ops/hermes/task-template.md']
    for file in required:
        if not (root / file).is_file(): failures.append('missing ' + file)
    for name, role in team['roles'].items():
        for gate in role['gates']:
            if gate not in pkg['scripts']: failures.append(f'{name}: missing script {gate}')
    for cmd in ['node', 'npm', 'git']:
        if not shutil.which(cmd): failures.append('missing executable ' + cmd)
    git = subprocess.run(['git', '-c', f'safe.directory={root}', '-C', str(root), 'status', '--porcelain'], capture_output=True, text=True)
    if git.returncode: failures.append('git status unavailable')
    report = {'project': team['project'], 'specialists': len(team['roles'])-1,
              'max_parallel': team['max_parallel'], 'max_depth': team['max_depth'],
              'dirty_entries': len(git.stdout.splitlines()), 'structural_errors': failures,
              'note': 'Structural check only. Not build, auth, browser or deploy certification.'}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if failures else 0

def self_test():
    team = load_team()
    valid = [{'role':'corp','goal':'inspect','files':['src/app/corp/page.tsx']}, {'role':'shell','goal':'inspect','files':['src/components/Sidebar.tsx']}]
    validate_plan(team, valid)
    bad = [valid + valid, [valid[0], valid[0]], [{'role':'corp','goal':'x','files':['src/components/Sidebar.tsx']}], [{'role':'qa','goal':'x','files':['../secret']}], [{'role':'qa','goal':'x','files':['scripts/**']}], [{'role':'lead','goal':'x','files':[]}]]
    for case in bad:
        try: validate_plan(team, case)
        except ValueError: continue
        raise AssertionError('Unsafe plan accepted')
    assert brief(team, valid[0])['role'] == 'leaf'
    import tempfile
    with tempfile.TemporaryDirectory(prefix='propig-plan-test-') as temp:
        # Only synthetic paths are created; no production files or symlinks are changed.
        root = Path(temp) / 'repo'
        (root / 'scripts').mkdir(parents=True)
        outside = Path(temp) / 'outside.py'
        outside.write_text('fixture')
        (root / 'scripts' / 'escape.py').symlink_to(outside)
        (root / 'scripts' / 'alias.py').symlink_to(root / 'scripts' / 'target.py')
        original_root = globals()['ROOT']
        globals()['ROOT'] = root
        extra = [
            [{'role':'qa','goal':'test','files':['scripts/escape.py']}],
            [{'role':'qa','goal':'test','files':['scripts/alias.py','scripts/target.py']}],
            [{'role':'qa','goal':'test','files':['scripts/Case.py','scripts/case.py']}],
            [{'role':'qa','goal':'test','files':['scripts']}],
            [{'role':[],'goal':'test','files':[]}],
            [{'role':'qa','goal':None,'files':[]}],
            [{'role':'qa','goal':'test'}],
            [{'role':'qa','goal':'test','files':['scripts/new-file']}, {'role':'qa','goal':'test','files':['scripts/new-file/child.py']}],
            [{'role':'qa','goal':'test','files':['scripts/new-file/child.py']}, {'role':'qa','goal':'test','files':['scripts/new-file']}],
        ]
        try:
            for case in extra:
                try: validate_plan(team, case)
                except ValueError: continue
                raise AssertionError('Unsafe synthetic plan accepted')
        finally:
            globals()['ROOT'] = original_root
    print('PASS plan/brief, width, collision, role scope, traversal, wildcard, lead exclusion, symlink escape/alias, case collision, directory, malformed fields')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['doctor', 'plan', 'self-test'])
    parser.add_argument('file', nargs='?')
    args = parser.parse_args()
    try:
        if args.action == 'doctor': sys.exit(doctor())
        elif args.action == 'self-test': self_test()
        else:
            if not args.file: parser.error('plan requires a JSON task array')
            tasks = json.loads(Path(args.file).read_text())
            team = load_team()
            validate_plan(team, tasks)
            print(json.dumps({'tasks':[brief(team, task) for task in tasks]}, ensure_ascii=False, indent=2))
    except (ValueError, KeyError, OSError) as error:
        print('ERROR: ' + str(error), file=sys.stderr)
        sys.exit(1)
