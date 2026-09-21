import { detectTaskDependencyCycles } from "./workflow";

import type { ProductionProjectAggregate } from "./types";

const closed = new Set(["approved", "done", "cancelled", "out-of-scope"]);
export function productionScheduleReadiness(aggregate: ProductionProjectAggregate) {
  const open = aggregate.tasks.filter((task) => !closed.has(task.status));
  const activeIds = new Set(aggregate.assignments.filter((assignment) => assignment.status === "active").map((assignment) => assignment.id));
  const tasks = new Set(aggregate.tasks.map((task) => task.id));
  const missingEstimateIds: string[] = [], missingAssignmentTaskIds: string[] = [];
  const missingCalendarAssignmentIds = new Set<string>(), missingDependencyIds = new Set<string>();
  for (const task of open) {
    const estimate = task.estimateHours;
    if (!estimate || ![estimate.optimistic, estimate.likely, estimate.pessimistic].every((value) => Number.isFinite(value) && value >= 0)
      || estimate.optimistic > estimate.likely || estimate.likely > estimate.pessimistic) missingEstimateIds.push(task.id);
    if (!task.assignmentIds.length || task.assignmentIds.some((id) => !activeIds.has(id))) missingAssignmentTaskIds.push(task.id);
    for (const id of task.assignmentIds) {
      const calendars = (aggregate.resourceCalendars ?? []).filter((calendar) => calendar.assignmentId === id);
      const calendar = calendars[0];
      let timezoneValid = false;
      try { if (calendar?.timezone) { new Intl.DateTimeFormat("en", { timeZone: calendar.timezone }); timezoneValid = true; } } catch { /* Invalid zone stays unknown. */ }
      if (calendars.length !== 1 || !calendar || !timezoneValid || !Number.isFinite(calendar.dailyHours) || !Number.isFinite(calendar.weeklyHours) || calendar.dailyHours <= 0 || calendar.dailyHours > 24
        || calendar.weeklyHours <= 0 || calendar.weeklyHours > 168 || !calendar.workingWeekdays.length
        || new Set(calendar.workingWeekdays).size !== calendar.workingWeekdays.length
        || calendar.workingWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) missingCalendarAssignmentIds.add(id);
    }
    for (const dependency of task.dependencyTaskIds) if (!tasks.has(dependency)) missingDependencyIds.add(dependency);
  }
  const cycleTaskIds = [...new Set(detectTaskDependencyCycles(aggregate.tasks.filter((task) => !["cancelled", "out-of-scope"].includes(task.status))).flat())];
  return Object.freeze({ complete: !cycleTaskIds.length && !missingEstimateIds.length && !missingAssignmentTaskIds.length && !missingCalendarAssignmentIds.size && !missingDependencyIds.size,
    cycleTaskIds, missingEstimateIds, missingAssignmentTaskIds, missingCalendarAssignmentIds: [...missingCalendarAssignmentIds], missingDependencyIds: [...missingDependencyIds] });
}
