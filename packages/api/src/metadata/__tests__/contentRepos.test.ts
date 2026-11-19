import { describeContentRepos } from '@/metadata/testing/contentContract';
import { createMemoryStore } from '@/metadata/testing/memoryStore';

describeContentRepos('memory', async () => createMemoryStore());
