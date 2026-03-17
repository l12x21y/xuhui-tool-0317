import { execSync, spawn } from 'node:child_process';

const TARGET_PORTS = [
  3000, 3001, 3002, 3003, 3004,
  24678, 24679, 24680, 24681, 24682
];

function killConflictingPortsOnWindows(ports) {
  try {
    const output = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
    const lines = output.split(/\r?\n/);
    const pids = new Set();

    for (const line of lines) {
      if (!line.includes('LISTENING')) continue;
      const match = line.match(/\s+TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/i);
      if (!match) continue;
      const port = Number(match[1]);
      const pid = Number(match[2]);
      if (ports.includes(port) && Number.isFinite(pid) && pid > 0) {
        pids.add(pid);
      }
    }

    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`[dev] stopped PID ${pid}`);
      } catch {
      }
    }
  } catch (error) {
    console.warn('[dev] unable to scan/kill occupied ports, continue startup');
  }
}

function startServer() {
  const child = spawn('tsx', ['server.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

if (process.platform === 'win32') {
  killConflictingPortsOnWindows(TARGET_PORTS);
}

startServer();
