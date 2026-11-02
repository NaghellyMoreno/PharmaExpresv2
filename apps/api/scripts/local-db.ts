// PostgreSQL local sin Docker (solo desarrollo): usa binarios reales de PostgreSQL
// vía embedded-postgres. Con Docker, init.sh usa docker-compose.yml.
// Uso: tsx scripts/local-db.ts start | stop   (datos en pgdata/, PID en .run/)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(__dirname, '../../..');
const dataDir = path.join(root, 'pgdata');
const pidFile = path.join(root, '.run/local-db.pid');
const PORT = 5433;

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function serve() {
  const first = !existsSync(path.join(dataDir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'pharma',
    password: 'pharma',
    port: PORT,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
  if (first) await pg.initialise();
  await pg.start();
  if (first) await pg.createDatabase('pharma');
  const stop = async () => {
    await pg.stop();
    rmSync(pidFile, { force: true });
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  console.log('ready');
  setInterval(() => {}, 1 << 30);
}

async function start() {
  if (existsSync(pidFile) && isAlive(Number(readFileSync(pidFile, 'utf8')))) {
    console.log('PostgreSQL local ya está corriendo.');
    return;
  }
  mkdirSync(path.dirname(pidFile), { recursive: true });
  const child = spawn(process.execPath, [...process.execArgv, __filename, 'serve'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  writeFileSync(pidFile, String(child.pid));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PostgreSQL local tardó demasiado')), 120_000);
    child.stdout!.on('data', (d) => {
      if (String(d).includes('ready')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', () => {
      clearTimeout(timer);
      reject(new Error('PostgreSQL local no arrancó'));
    });
  });
  child.stdout!.destroy();
  child.unref();
  console.log(`PostgreSQL local listo en el puerto ${PORT}.`);
}

function stopCmd() {
  if (existsSync(pidFile)) {
    const pid = Number(readFileSync(pidFile, 'utf8'));
    if (isAlive(pid)) process.kill(pid, 'SIGTERM');
    rmSync(pidFile, { force: true });
  }
}

const cmd = process.argv[2];
if (cmd === 'serve') void serve();
else if (cmd === 'start') start().catch((e) => { console.error(e.message); process.exit(1); });
else if (cmd === 'stop') stopCmd();
else { console.error('Uso: local-db.ts start|stop'); process.exit(1); }
