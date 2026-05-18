import cron from 'node-cron';
import { syncAvailableIsmReleases } from '@/lib/ism/sync';

export type JobStatus = {
  name: string;
  schedule: string;
  lastRunAt: string | null;
  lastCompletedAt: string | null;
  nextRunAt: string | null;
  lastStatus: 'success' | 'error' | 'running' | null;
  lastError: string | null;
};

const globalStatusesKey = '__oakattest_job_statuses__' as const;
const globalTasksKey = '__oakattest_cron_tasks__' as const;

type CronTask = ReturnType<typeof cron.schedule>;

const jobDefinitions = [
  {
    name: 'ISM releases',
    schedule: process.env.ISM_RELEASE_SYNC_CRON ?? '0 3 * * *',
    run: async () => syncAvailableIsmReleases(),
  },
] as const;

function statusMap(): Map<string, JobStatus> {
  const global = globalThis as unknown as Record<string, Map<string, JobStatus>>;
  if (!global[globalStatusesKey]) global[globalStatusesKey] = new Map();
  return global[globalStatusesKey];
}

function taskMap(): Map<string, CronTask> {
  const global = globalThis as unknown as Record<string, Map<string, CronTask>>;
  if (!global[globalTasksKey]) global[globalTasksKey] = new Map();
  return global[globalTasksKey];
}

function ensureStatus(name: string, schedule: string) {
  const statuses = statusMap();
  const existing = statuses.get(name);
  if (existing) {
    existing.schedule = schedule;
    return existing;
  }
  const status: JobStatus = {
    name,
    schedule,
    lastRunAt: null,
    lastCompletedAt: null,
    nextRunAt: null,
    lastStatus: null,
    lastError: null,
  };
  statuses.set(name, status);
  return status;
}

async function runJob(jobName: string) {
  const job = jobDefinitions.find((definition) => definition.name === jobName);
  if (!job) throw new Error(`Unknown job: ${jobName}`);

  const status = ensureStatus(job.name, job.schedule);
  status.lastRunAt = new Date().toISOString();
  status.lastCompletedAt = null;
  status.lastStatus = 'running';
  status.lastError = null;

  try {
    const result = await job.run();
    if (result.errorCount > 0) {
      status.lastStatus = 'error';
      status.lastError = result.errors.join('; ');
    } else {
      status.lastStatus = 'success';
      status.lastError = null;
    }
  } catch (err) {
    status.lastStatus = 'error';
    status.lastError = (err as Error).message;
  } finally {
    status.lastCompletedAt = new Date().toISOString();
  }
}

export function getJobStatuses(): JobStatus[] {
  const tasks = taskMap();
  return Array.from(statusMap().values()).map((job) => {
    const task = tasks.get(job.name);
    let nextRunAt: string | null = null;
    if (task) {
      try {
        const next = task.getNextRun();
        if (next instanceof Date) nextRunAt = next.toISOString();
      } catch {
        // node-cron can throw if a task has not fully initialised.
      }
    }
    return { ...job, nextRunAt };
  });
}

export async function triggerJob(jobName: string): Promise<{ success: boolean; error?: string }> {
  await runJob(jobName);
  const status = statusMap().get(jobName);
  if (status?.lastStatus === 'error') {
    return { success: false, error: status.lastError ?? 'Unknown error' };
  }
  return { success: true };
}

export function startCronJobs(): void {
  const tasks = taskMap();
  const timezone = process.env.CRON_TIMEZONE ?? 'Australia/Sydney';

  for (const job of jobDefinitions) {
    ensureStatus(job.name, job.schedule);
    if (tasks.has(job.name)) continue;
    if (!cron.validate(job.schedule)) {
      console.error(`[cron] Invalid schedule for ${job.name}: ${job.schedule}`);
      continue;
    }

    const task = cron.schedule(
      job.schedule,
      () => {
        void runJob(job.name);
      },
      { timezone },
    );
    tasks.set(job.name, task);
    console.log(`[cron] Registered ${job.name} (${job.schedule}, ${timezone})`);
  }
}
