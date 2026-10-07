import { spawn } from 'node:child_process';

/** One Railway volume owner, with independently scheduled API/index/metadata processes. */
export function supervise(commands, { env = process.env, graceMs = 5000, stdio = 'inherit' } = {}) {
  if (!commands.length) throw new Error('At least one service is required.');
  const children = [];
  let stopping = false, result = 0, closed = 0, timer, finish;
  const done = new Promise(resolve => { finish = resolve; });
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    result = code;
    for (const child of children) child.kill('SIGTERM');
    timer = setTimeout(() => {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, graceMs);
    timer.unref();
  }
  for (const { name, command, args = [] } of commands) {
    const child = spawn(command, args, { env, stdio });
    children.push(child);
    child.once('error', () => {
      console.error(JSON.stringify({ event: 'service_spawn_error', service: name }));
      stop(1);
    });
    child.once('exit', (code, signal) => {
      if (!stopping) {
        console.error(JSON.stringify({ event: 'service_exit', service: name, code, signal }));
        stop(1);
      }
    });
    child.once('close', () => {
      if (++closed === commands.length) {
        clearTimeout(timer);
        finish(result);
      }
    });
  }
  return { children, done, stop };
}
