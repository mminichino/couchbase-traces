import { defaultTopology, generateBackfill, generateLive } from './generate';
import { sendBatches, SendError } from './send';

export type SampleDataOptions = {
  endpoint: string;
  apiKey?: string;
  hours: number;
  seed: number;
  live: boolean;
  rate: number;
  dryRun: boolean;
};

export function parseSampleArgs(argv: string[]): SampleDataOptions {
  const opts: SampleDataOptions = {
    endpoint: 'http://localhost:4318',
    apiKey: process.env.CBT_API_KEY,
    hours: 6,
    seed: 42,
    live: false,
    rate: 20,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v == null) throw new Error(`${arg} requires a value`);
      return v;
    };
    if (arg === '--endpoint') opts.endpoint = next();
    else if (arg === '--api-key') opts.apiKey = next();
    else if (arg === '--hours') opts.hours = Number(next());
    else if (arg === '--seed') opts.seed = Number(next());
    else if (arg === '--rate') opts.rate = Number(next());
    else if (arg === '--live') opts.live = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(opts.hours) || opts.hours <= 0) {
    throw new Error('--hours must be a positive number');
  }
  if (!Number.isFinite(opts.seed)) throw new Error('--seed must be a number');
  if (!Number.isFinite(opts.rate) || opts.rate <= 0) {
    throw new Error('--rate must be a positive number');
  }
  return opts;
}

function printHelp(): void {
  console.log(`Usage: sample-data [options]
  --endpoint <url>   OTLP/HTTP base (default http://localhost:4318)
  --api-key <key>    Authorization header (default $CBT_API_KEY)
  --hours <n>        Backfill window ending now (default 6)
  --seed <n>         PRNG seed (default 42)
  --live             Keep sending at --rate after backfill
  --rate <n>         Events per second in live mode (default 20)
  --dry-run          Print OTLP JSON to stdout instead of sending`);
}

export async function runSampleData(
  opts: SampleDataOptions,
  log: (line: string) => void = console.log,
): Promise<number> {
  const topology = defaultTopology();
  const to = new Date();
  const from = new Date(to.getTime() - opts.hours * 3_600_000);

  const backfill = generateBackfill(topology, {
    from,
    to,
    seed: opts.seed,
  });

  if (opts.dryRun) {
    for (const batch of backfill) {
      process.stdout.write(`${JSON.stringify(batch)}\n`);
    }
    if (opts.live) {
      const live = generateLive(topology, {
        rate: opts.rate,
        seed: opts.seed + 1,
      });
      for await (const batch of live) {
        process.stdout.write(`${JSON.stringify(batch)}\n`);
      }
    }
    return 0;
  }

  try {
    let totals = await sendBatches(backfill, {
      endpoint: opts.endpoint,
      apiKey: opts.apiKey,
    });
    log(
      `Sent backfill: logs=${totals.logs} traces=${totals.traces} metrics=${totals.metrics}`,
    );

    if (opts.live) {
      const live = generateLive(topology, {
        rate: opts.rate,
        seed: opts.seed + 1,
      });
      const onSignal = async () => {
        log('Interrupted; stopping live stream.');
        process.exit(0);
      };
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
      totals = await sendBatches(live, {
        endpoint: opts.endpoint,
        apiKey: opts.apiKey,
      });
      log(
        `Sent live: logs=${totals.logs} traces=${totals.traces} metrics=${totals.metrics}`,
      );
    }
    return 0;
  } catch (e) {
    if (e instanceof SendError) {
      console.error(e.message);
      return e.exitCode;
    }
    console.error(e);
    return 1;
  }
}

const isMain =
  typeof process !== 'undefined' && process.argv[1]?.includes('sample/cli');
if (isMain) {
  try {
    const opts = parseSampleArgs(process.argv.slice(2));
    void runSampleData(opts).then(code => process.exit(code));
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
