import { prisma } from "@/lib/db";
import { getNextCronDate } from "@/services/scheduler/cron-parser";
import { executePipeline } from "@/services/orchestrator/pipeline";
import type { RunMode } from "@/generated/prisma/client";

/**
 * Process all due scheduled runs.
 * Called every 60 seconds by the scheduler BullMQ worker.
 *
 * For each enabled schedule whose nextRunAt <= now:
 * 1. Skip if the parent project is deleted
 * 2. Trigger the pipeline with the schedule's configured mode
 * 3. Update lastRunAt and compute the next nextRunAt
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

    try {
      await executePipeline({
        projectId: schedule.projectId,
        trigger: "scheduled",
        branch: schedule.project.defaultBranch,
        requestedMode: schedule.mode as RunMode,
      });

      await advanceSchedule(schedule.id, schedule.cronExpression, now);
      triggered++;

      console.log(
        `[Scheduler] Triggered run for schedule ${schedule.id} (project ${schedule.projectId})`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[Scheduler] Failed to trigger schedule ${schedule.id}:`,
        message
      );

      // Still advance the schedule so we don't retry the same window forever
      await advanceSchedule(schedule.id, schedule.cronExpression, now);
    }
  }

  console.log(`[Scheduler] Triggered ${triggered}/${dueSchedules.length} scheduled run(s)`);
  return triggered;
}

/**
 * Advance a schedule's lastRunAt to now and compute the next nextRunAt.
 */
async function advanceSchedule(
  scheduleId: string,
  cronExpression: string,
  now: Date
): Promise<void> {
  try {
    const nextRun = getNextCronDate(cronExpression, now);

    await prisma.scheduledRun.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: now,
        nextRunAt: nextRun,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[Scheduler] Failed to advance schedule ${scheduleId}:`,
      message
    );
  }
}
