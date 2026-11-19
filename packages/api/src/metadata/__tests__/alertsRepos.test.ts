import { describeAlertRepos } from '@/metadata/testing/alertsContract';
import { createMemoryStore } from '@/metadata/testing/memoryStore';

describeAlertRepos('memory', async () => createMemoryStore());
