import { prisma } from "@/lib/db";
import { getNextCronDate } from "@/services/scheduler/cron-parser";
import { launchPipelineRun } from "@/services/orchestrator/run-launcher";
import type { RunMode } from "@/generated/prisma/client";

/**
 * Process all due scheduled runs.
 * Called every 60 seconds by the scheduler BullMQ worker.
 *
 * For each enabled schedule whose nextRunAt <= now:
 * 1. Skip if the parent project is deleted
 * 2. Claim the slot atomically (advance nextRunAt only if it is still the
 *    value we read), so concurrent ticks or replicas start exactly one run
 * 3. Enqueue the run; the worker pipeline executes it. Never run it inline.
 *
 * Errors on individual schedules are caught and logged so one
 * failure never blocks the rest.
 */
export async function processScheduledRuns(): Promise<number> {
  const now = new Date();

  const dueSchedules = await prisma.scheduledRun.findMany({
    where: {
      isEnabled: true,
      nextRunAt: { lte: now },
    },
    include: {
      project: {
        select: {
          id: true,
          workspaceId: true,
          status: true,
          deletedAt: true,
          defaultBranch: true,
        },
      },
    },
  });

  if (dueSchedules.length === 0) return 0;

  console.log(`[Scheduler] Found ${dueSchedules.length} due schedule(s)`);

  let triggered = 0;

  for (const schedule of dueSchedules) {
    // Skip soft-deleted or non-active projects
    if (schedule.project.deletedAt || schedule.project.status !== "active") {
      console.log(
        `[Scheduler] Skipping schedule ${schedule.id} — project inactive/deleted`
      );
      await advanceSchedule(schedule.id, schedule.cronExpression, now);
      continue;
    }

    const slot = schedule.nextRunAt;
    if (!slot) continue;

    let claimed = false;
    try {
      claimed = await claimSlot(schedule.id, schedule.cronExpression, slot, now);
      if (!claimed) continue; // another tick/replica took this slot

      const launch = await launchPipelineRun({
        projectId: schedule.projectId,
        mode: schedule.mode as RunMode,
        trigger: "scheduled",
        branch: schedule.project.defaultBranch,
        jobId: `sched:${schedule.id}:${slot.toISOString()}`,
      });
      if (!launch.ok) {
        console.warn(
          `[Scheduler] Schedule ${schedule.id} not started: ${launch.code} ${launch.reason}`
        );
        continue;
      }
      triggered++;
      console.log(
        `[Scheduler] Queued run ${launch.runId} for schedule ${schedule.id} (project ${schedule.projectId})`
      );
    } catch (error) {
      // The slot is already claimed (or unclaimable): don't retry the same window forever
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Scheduler] Failed to trigger schedule ${schedule.id}:`, message);
    }
  }

  console.log(`[Scheduler] Triggered ${triggered}/${dueSchedules.length} scheduled run(s)`);
  return triggered;
}

/**
 * Atomically take a due slot: advance nextRunAt to the next cron time only if
 * it still equals the value we read. Exactly one claimer sees count === 1.
 */
export async function claimSlot(
  scheduleId: string,
  cronExpression: string,
  seen: Date,
  now: Date
): Promise<boolean> {
  const { count } = await prisma.scheduledRun.updateMany({
    where: { id: scheduleId, nextRunAt: seen },
    data: { lastRunAt: now, nextRunAt: getNextCronDate(cronExpression, now) },
  });
  return count === 1;
}

/** Skip a due slot without running it (project inactive or deleted). */
async function advanceSchedule(
  scheduleId: string,
  cronExpression: string,
  now: Date
): Promise<void> {
  try {
    await prisma.scheduledRun.update({
      where: { id: scheduleId },
      data: { lastRunAt: now, nextRunAt: getNextCronDate(cronExpression, now) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Scheduler] Failed to advance schedule ${scheduleId}:`, message);
  }
}
