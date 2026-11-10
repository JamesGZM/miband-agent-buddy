import os from 'node:os';
export function cpuTotals(cpus = os.cpus()) {
  return cpus.reduce((sum, cpu) => ({
    idle: sum.idle + cpu.times.idle,
    total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0)
  }), { idle: 0, total: 0 });
}

export function cpuUsage(before, after) {
  const total = after.total - before.total;
  const idle = after.idle - before.idle;
  if (total <= 0 || idle < 0 || idle > total) return -1;
  return Math.round((1 - idle / total) * 1000) / 10;
}
