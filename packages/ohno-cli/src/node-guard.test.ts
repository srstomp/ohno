import { describe, it, expect } from 'vitest';
import { checkNodeVersion } from './node-guard.js';

describe('checkNodeVersion', () => {
  it('ok for 22.16.0',  () => expect(checkNodeVersion('22.16.0').ok).toBe(true));
  it('ok for 22.16.5',  () => expect(checkNodeVersion('22.16.5').ok).toBe(true));
  it('ok for 24.0.0',   () => expect(checkNodeVersion('24.0.0').ok).toBe(true));
  it('not-ok 22.15.0',  () => {
    const r = checkNodeVersion('22.15.0');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('22.16.0');
  });
  it('not-ok 20.18.0',  () => expect(checkNodeVersion('20.18.0').ok).toBe(false));
  it('not-ok 18.0.0',   () => expect(checkNodeVersion('18.0.0').ok).toBe(false));
});
