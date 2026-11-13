const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

type Labels = Record<string, string>;

export class SelfMetrics {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<
    string,
    { buckets: number[]; sum: number; count: number }
  >();

  inc(name: string, labels: Labels, by = 1): void {
    const key = seriesKey(name, labels);
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  observe(name: string, labels: Labels, value: number): void {
    const key = seriesKey(name, labels);
    let hist = this.histograms.get(key);
    if (!hist) {
      hist = { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
      this.histograms.set(key, hist);
    }
    hist.sum += value;
    hist.count += 1;
    for (let i = 0; i < BUCKETS.length; i++) {
      if (value <= BUCKETS[i]) hist.buckets[i] += 1;
    }
  }

  render(): string {
    const lines = [
      '# TYPE cbt_ingest_records_total counter',
      ...this.lines('cbt_ingest_records_total'),
      '# TYPE cbt_ingest_requests_total counter',
      ...this.lines('cbt_ingest_requests_total'),
      '# TYPE cbt_ingest_timestamp_defaulted_total counter',
      ...this.lines('cbt_ingest_timestamp_defaulted_total'),
      '# TYPE cbt_ingest_request_duration_seconds histogram',
      ...this.histogramLines('cbt_ingest_request_duration_seconds'),
    ];
    return `${lines.filter(line => line !== '').join('\n')}\n`;
  }

  private lines(name: string): string[] {
    const out: string[] = [];
    for (const [key, value] of this.counters) {
      if (!key.startsWith(`${name}{`) && key !== name) continue;
      out.push(`${key} ${value}`);
    }
    return out;
  }

  private histogramLines(name: string): string[] {
    const out: string[] = [];
    for (const [key, hist] of this.histograms) {
      if (!key.startsWith(`${name}{`) && key !== name) continue;
      const labels = key.slice(name.length);
      let cumulative = 0;
      for (let i = 0; i < BUCKETS.length; i++) {
        cumulative += hist.buckets[i];
        out.push(`${name}_bucket${withLe(labels, BUCKETS[i])} ${cumulative}`);
      }
      out.push(`${name}_bucket${withLe(labels, '+Inf')} ${hist.count}`);
      out.push(`${name}_sum${labels} ${hist.sum}`);
      out.push(`${name}_count${labels} ${hist.count}`);
    }
    return out;
  }
}

function seriesKey(name: string, labels: Labels): string {
  const body = Object.keys(labels)
    .sort()
    .map(key => `${key}="${labels[key]}"`)
    .join(',');
  return body === '' ? name : `${name}{${body}}`;
}

function withLe(labels: string, le: number | string): string {
  const leLabel = `le="${le}"`;
  if (labels === '') return `{${leLabel}}`;
  return `{${labels.slice(1, -1)},${leLabel}}`;
}
