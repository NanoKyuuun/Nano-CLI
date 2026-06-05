import { describe, it, expect } from 'vitest';
import { TokenBudgetManager } from '../src/tokens/tokenBudgetManager';

describe('TokenBudgetManager.estimateCost()', () => {
  const mgr = new TokenBudgetManager();

  // ─── Bug P0-02 regression tests ─────────────────────────────────────────

  it('harus menghitung cost dengan benar (per-million-token, bukan per-token)', () => {
    // 1M input token dengan pricing $1.00/M dan 0 output → harus $1.00
    const cost = mgr.estimateCost(1_000_000, { prompt: '1.0', completion: '0' }, 0);
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(1.0, 4);
  });

  it('1000 token dengan pricing $1.00/M → cost ~$0.001, bukan $1000', () => {
    const cost = mgr.estimateCost(1_000, { prompt: '1.0', completion: '1.0' }, 1_000);
    expect(cost).not.toBeNull();
    expect(cost!).toBeLessThan(0.01);       // bukan $1000+
    expect(cost!).toBeGreaterThan(0.0001);  // tapi bukan nol
    expect(cost!).toBeCloseTo(0.002, 4);    // ($1/M * 1000 input + $1/M * 1000 output) = $0.002
  });

  it('output token ikut dihitung', () => {
    const inputOnly  = mgr.estimateCost(1_000, { prompt: '1.0', completion: '0' }, 0);
    const withOutput = mgr.estimateCost(1_000, { prompt: '1.0', completion: '2.0' }, 1_000);
    expect(withOutput!).toBeGreaterThan(inputOnly!);
  });

  // ─── Null guard tests ────────────────────────────────────────────────────

  it('sentinel "-1" prompt → return null', () => {
    expect(mgr.estimateCost(1000, { prompt: '-1', completion: '1.0' }, 500)).toBeNull();
  });

  it('sentinel "-1" completion → return null', () => {
    expect(mgr.estimateCost(1000, { prompt: '1.0', completion: '-1' }, 500)).toBeNull();
  });

  it('NaN prompt → return null', () => {
    expect(mgr.estimateCost(1000, { prompt: 'N/A', completion: '1.0' }, 500)).toBeNull();
  });

  it('empty string pricing → return null', () => {
    expect(mgr.estimateCost(1000, { prompt: '', completion: '1.0' }, 500)).toBeNull();
  });

  it('nilai negatif → return null', () => {
    expect(mgr.estimateCost(1000, { prompt: '-5.0', completion: '1.0' }, 500)).toBeNull();
  });

  // ─── Edge cases ──────────────────────────────────────────────────────────

  it('pricing nol (model gratis) → return 0', () => {
    const cost = mgr.estimateCost(1_000_000, { prompt: '0', completion: '0' }, 1000);
    expect(cost).not.toBeNull();
    expect(cost).toBe(0);
  });

  it('0 input token → cost hanya dari output', () => {
    const cost = mgr.estimateCost(0, { prompt: '0', completion: '2.0' }, 1_000);
    expect(cost).not.toBeNull();
    expect(cost!).toBeCloseTo(0.002, 5);
  });
});
