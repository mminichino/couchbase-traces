import CheckAlertTask from '@/tasks/checkAlerts';
import PingTask from '@/tasks/pingTask';
import { TaskName } from '@/tasks/types';

export function createTask(argv: { taskName: TaskName }) {
  switch (argv.taskName) {
    case TaskName.CHECK_ALERTS:
      return new CheckAlertTask(argv);
    case TaskName.PING:
      return new PingTask(argv);
    default:
      throw new Error('Unknown task');
  }
}
