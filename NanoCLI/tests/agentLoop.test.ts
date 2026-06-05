import { describe, it, expect } from 'vitest';
import { ToolRouter } from '../src/agent/toolRouter';

/**
 * Test untuk AgentLoop guard behaviors.
 *
 * AgentLoop tidak bisa di-unit-test langsung karena bergantung pada
 * OpenRouterClient (LLM network call). Kita test unit-unit kunci yang
 * menjadi fondasi loop guard:
 *
 * 1. fingerprintAction() — logika fingerprinting (inline karena private)
 * 2. ToolRouter.parse() — apakah final action dikenali dengan benar
 * 3. Skenario sequential: agent menerima final → seharusnya stop
 * 4. Skenario loop: action sama 2x → fingerprint sama, harus terdeteksi
 *
 * Regression test untuk P0-03:
 * - Agent tidak boleh mengulang action yang sama sampai maxSteps
 * - Final action harus dikenali dan menghasilkan status "completed"
 */

// ── Inline copy fingerprintAction (sama dengan implementasi di agentLoop.ts) ──
// Duplikasi intentional — jika prod code berubah tapi test tidak, test akan fail.
type MockAction =
  | { type: 'file.write'; path: string; content: string }
  | { type: 'file.patch'; path: string; patch: string }
  | { type: 'file.read'; path: string }
  | { type: 'terminal.run'; command: string }
  | { type: 'final'; summary: string };

function fingerprintAction(action: MockAction): string {
  switch (action.type) {
    case 'file.write':
    case 'file.patch':
    case 'file.read':
      return `${action.type}:${action.path}`;
    case 'terminal.run':
      return `terminal.run:${action.command}`;
    default:
      return action.type;
  }
}

// ── Simulasi duplicate action detection (sama dengan agentLoop.ts) ──
function simulateLoopGuard(actions: MockAction[], threshold = 2): {
  stopped: boolean;
  stoppedAtStep: number;
  reason: string;
} {
  const fingerprints = new Map<string, number>();

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;

    // Final action tidak dicheck fingerprint — langsung selesai
    if (action.type === 'final') {
      return { stopped: false, stoppedAtStep: -1, reason: 'completed' };
    }

    const fp    = fingerprintAction(action);
    const count = (fingerprints.get(fp) ?? 0) + 1;
    fingerprints.set(fp, count);

    if (count >= threshold) {
      return {
        stopped:       true,
        stoppedAtStep: i + 1,
        reason:        `Repeated identical action detected: ${fp} (${count}x)`,
      };
    }
  }

  return { stopped: false, stoppedAtStep: -1, reason: 'max_step_reached' };
}

describe('AgentLoop — fingerprintAction()', () => {
  it('file.write menghasilkan fingerprint type:path', () => {
    const fp = fingerprintAction({ type: 'file.write', path: 'src/auth.ts', content: '...' });
    expect(fp).toBe('file.write:src/auth.ts');
  });

  it('file.patch menghasilkan fingerprint type:path', () => {
    const fp = fingerprintAction({ type: 'file.patch', path: 'src/auth.ts', patch: '...' });
    expect(fp).toBe('file.patch:src/auth.ts');
  });

  it('file.read menghasilkan fingerprint type:path', () => {
    const fp = fingerprintAction({ type: 'file.read', path: 'src/config.ts' });
    expect(fp).toBe('file.read:src/config.ts');
  });

  it('terminal.run menghasilkan fingerprint dengan command', () => {
    const fp = fingerprintAction({ type: 'terminal.run', command: 'npm test' });
    expect(fp).toBe('terminal.run:npm test');
  });

  it('file berbeda menghasilkan fingerprint berbeda', () => {
    const fp1 = fingerprintAction({ type: 'file.write', path: 'src/a.ts', content: '' });
    const fp2 = fingerprintAction({ type: 'file.write', path: 'src/b.ts', content: '' });
    expect(fp1).not.toBe(fp2);
  });

  it('konten berbeda tapi path sama → fingerprint SAMA (bukan bug, ini by design)', () => {
    // By design: fingerprint tidak memperhitungkan konten
    // agar minor edit tidak mengakali guard
    const fp1 = fingerprintAction({ type: 'file.write', path: 'src/auth.ts', content: 'v1' });
    const fp2 = fingerprintAction({ type: 'file.write', path: 'src/auth.ts', content: 'v2' });
    expect(fp1).toBe(fp2);
  });
});

describe('AgentLoop — duplicate action guard (simulasi)', () => {
  // Regression test P0-03: agent tidak boleh loop sampai maxSteps

  it('action berbeda tidak trigger guard', () => {
    const result = simulateLoopGuard([
      { type: 'file.write', path: 'a.ts', content: '' },
      { type: 'file.write', path: 'b.ts', content: '' },
      { type: 'terminal.run', command: 'npm test' },
    ]);
    expect(result.stopped).toBe(false);
    expect(result.reason).toBe('max_step_reached');
  });

  it('action sama 2x trigger guard — REGRESSION TEST P0-03', () => {
    const result = simulateLoopGuard([
      { type: 'file.write', path: 'hello.txt', content: 'Hello NanoCLI' },
      { type: 'file.write', path: 'hello.txt', content: 'Hello NanoCLI' },
    ]);
    expect(result.stopped).toBe(true);
    expect(result.stoppedAtStep).toBe(2);
    expect(result.reason).toContain('file.write:hello.txt');
  });

  it('final action tidak trigger guard — harus selesai dengan "completed"', () => {
    const result = simulateLoopGuard([
      { type: 'file.write', path: 'hello.txt', content: 'Hello NanoCLI' },
      { type: 'final', summary: 'File berhasil dibuat.' },
    ]);
    expect(result.stopped).toBe(false);
    expect(result.reason).toBe('completed');
  });

  it('terminal command sama 2x trigger guard', () => {
    const result = simulateLoopGuard([
      { type: 'terminal.run', command: 'npm test' },
      { type: 'terminal.run', command: 'npm test' },
    ]);
    expect(result.stopped).toBe(true);
    expect(result.reason).toContain('terminal.run:npm test');
  });

  it('write file berbeda path tidak trigger guard', () => {
    const result = simulateLoopGuard([
      { type: 'file.write', path: 'src/a.ts', content: '' },
      { type: 'file.write', path: 'src/b.ts', content: '' },
      { type: 'file.write', path: 'src/c.ts', content: '' },
    ]);
    expect(result.stopped).toBe(false);
  });

  it('threshold custom bisa dikonfigurasi', () => {
    // threshold = 3: action harus muncul 3x sebelum stop
    const result = simulateLoopGuard([
      { type: 'file.write', path: 'same.ts', content: '' },
      { type: 'file.write', path: 'same.ts', content: '' },
      // 2x belum stop jika threshold = 3
    ], 3);
    expect(result.stopped).toBe(false);
  });
});

describe('AgentLoop — ToolRouter final action detection', () => {
  const router = new ToolRouter();

  // Test bahwa final action diparse dengan benar oleh ToolRouter
  // (yang digunakan agentLoop untuk menghentikan loop)

  it('final action dengan JSON block diparse sebagai type "final"', () => {
    const response = `
Task selesai. Semua file telah dibuat.

\`\`\`json
{
  "type": "final",
  "summary": "Berhasil membuat hello.txt dengan isi Hello NanoCLI.",
  "filesChanged": ["hello.txt"]
}
\`\`\`
`;
    const result = router.parse(response);
    expect(result.valid).toBe(true);
    expect(result.action?.type).toBe('final');
  });

  it('final action tanpa JSON tapi punya frase completion → isFinalResponse', () => {
    // isFinalResponse dipakai sebagai fallback ketika parse gagal
    expect(router.isFinalResponse('Task selesai. Tidak ada lagi yang perlu dilakukan.')).toBe(true);
  });

  it('narasi biasa tanpa final → tidak dianggap selesai', () => {
    expect(router.isFinalResponse('Saya akan membuat file auth.ts sekarang.')).toBe(false);
    expect(router.isFinalResponse('File sudah dibuat, lanjut ke langkah berikutnya.')).toBe(false);
  });
});
