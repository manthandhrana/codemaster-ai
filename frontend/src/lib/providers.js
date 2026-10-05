import { Ban, CircleAlert, CircleCheck, CircleDashed, CircleX, KeyRound } from 'lucide-react';

// Last "Test" result (backend state) -> badge. Red needs action from you, amber is usually temporary.
export const CHECK_STATE = {
  working: { label: 'Working', tone: 'green', icon: CircleCheck },
  invalid_key: { label: 'Invalid key', tone: 'red', icon: CircleX, hint: 'Create a new key, paste it into backend/.env and click Reload .env.' },
  no_credits: { label: 'No credits', tone: 'red', icon: CircleX, hint: 'The account has no balance. Add credits there, or keep this provider disabled.' },
  plan_required: { label: 'Paid plan needed', tone: 'red', icon: CircleX, hint: 'These models need a paid plan - click Models and pick free ones.' },
  model_missing: { label: 'Model not found', tone: 'amber', icon: CircleAlert, hint: 'The model was renamed or removed - click Models and pick an available one.' },
  unavailable: { label: 'Busy / rate limited', tone: 'amber', icon: CircleAlert, hint: 'Usually temporary (free tier busy) - test again in a few minutes.' },
  bad_output: { label: 'Bad output', tone: 'amber', icon: CircleAlert, hint: 'The model answered, but not with valid JSON - try another model.' },
  error: { label: 'Failing', tone: 'red', icon: CircleX },
};

/** Where a provider stands: no_key | disabled | untested | working | failing. */
export function providerGroup(p) {
  if (!p.configured) return 'no_key';
  if (!p.enabled) return 'disabled';
  if (!p.check || p.check.stale) return 'untested';
  return p.check.ok ? 'working' : 'failing';
}

export const GROUPS = [
  { key: 'working', label: 'Working', tone: 'green', icon: CircleCheck },
  { key: 'failing', label: 'Not working', tone: 'red', icon: CircleX },
  { key: 'untested', label: 'Not tested', tone: 'blue', icon: CircleDashed },
  { key: 'disabled', label: 'Disabled', tone: 'neutral', icon: Ban },
  { key: 'no_key', label: 'No key', tone: 'neutral', icon: KeyRound },
];

/** The last test's verdict, or null when there is no fresh one. */
export const checkState = (p) => (p.check && !p.check.stale ? CHECK_STATE[p.check.state] || CHECK_STATE.error : null);

/** Suffix for provider dropdowns, e.g. " (no credits)". */
export function providerSuffix(p) {
  const g = providerGroup(p);
  if (g === 'no_key') return ' (no key)';
  if (g === 'disabled') return ' (disabled)';
  if (g === 'failing') return ` (${checkState(p).label.toLowerCase()})`;
  return '';
}
