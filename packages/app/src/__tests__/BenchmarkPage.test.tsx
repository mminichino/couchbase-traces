/**
 * Smoke coverage for the benchmark page module: Stage 6 A2 needs a mapped
 * unit test for app-benchmark that runs under port/check.sh.
 */
import BenchmarkPage from '@/BenchmarkPage';

describe('BenchmarkPage', () => {
  it('exports a default page component', () => {
    // next/dynamic wraps the page; the module still exposes a renderable default.
    expect(BenchmarkPage).toBeTruthy();
    expect(
      typeof BenchmarkPage === 'function' || typeof BenchmarkPage === 'object',
    ).toBe(true);
  });
});
