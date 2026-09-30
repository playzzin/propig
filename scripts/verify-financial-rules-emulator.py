"""Local-only Firestore Rules regression. Start emulator with repository rules at 8189."""
import base64
import json
import time
import urllib.request
import urllib.error

BASE = 'http://127.0.0.1:8189/v1/projects/demo-propig-rules/databases/(default)/documents/'

def token(admin):
    def enc(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    now = int(time.time())
    return enc({'alg': 'none', 'typ': 'JWT'}) + '.' + enc({'iss': 'https://securetoken.google.com/demo-propig-rules', 'aud': 'demo-propig-rules', 'sub': 'admin-fixture' if admin else 'member-fixture', 'iat': now, 'exp': now + 3600, 'auth_time': now, 'admin': admin, 'role': 'admin' if admin else 'user', 'firebase': {'sign_in_provider': 'custom'}}) + '.'

def request(method, path, auth=None):
    headers = {'Content-Type': 'application/json'}
    if auth:
        headers['Authorization'] = 'Bearer ' + auth
    body = json.dumps({'fields': {'fixture': {'booleanValue': True}}}).encode() if method == 'PATCH' else None
    req = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code

count = 0
paths = ['onboardingInvitations/test', 'onboardingInvitations/test/audit/test', 'aiBudgetPolicies/test', 'aiBudgetPolicies/test/audit/test', 'aiDailyBudgets/test', 'aiOperationReservations/test']
for path in paths:
    assert request('PATCH', path, 'owner') == 200, path
    for actor, auth in [('guest', None), ('member', token(False)), ('admin', token(True))]:
        expected = 200 if actor == 'admin' and not path.startswith('onboardingInvitations/') else 403
        assert request('GET', path, auth) == expected, (path, actor, 'read')
        assert request('PATCH', path, auth) == 403, (path, actor, 'update')
        assert request('PATCH', path + '-new', auth) == 403, (path, actor, 'create')
        assert request('DELETE', path, auth) == 403, (path, actor, 'delete')
        count += 4
# Positive control: the administrator identity is recognized, not globally rejected.
assert request('PATCH', 'rulesRegressionControl/test', token(True)) == 200
assert request('GET', 'rulesRegressionControl/test', token(True)) == 200
print(f'PASS {count + 2} actual emulator Rules checks; local demo project only; production untouched')
