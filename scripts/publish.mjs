import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKS = [
  ['npm', ['test']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'lint']],
];

const NETLIFY_DASHBOARD_URL = 'https://app.netlify.com/';

export function isSensitivePath(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const basename = normalized.split('/').at(-1)?.toLowerCase() ?? '';
  return (
    /^\.env(?:\..*)?$/.test(basename) ||
    /(^|\/)(?:secrets?|credentials?|private)(?:\/|$)/i.test(normalized) ||
    /(?:secret|credential|token|private[-_.]?key)/i.test(basename) ||
    /\.(?:pem|key|p12|pfx|crt|cer)$/i.test(basename)
  );
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32' && command === 'npm',
    ...options,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`La comanda ${command} ${args.join(' ')} ha fallat.`);
  }
  return result.stdout.toString('utf8');
}

function nulSeparatedPaths(output) {
  return output.split('\0').filter(Boolean);
}

function literalPathspec(filePath) {
  return `:(literal)${filePath}`;
}

function displayPath(filePath) {
  return JSON.stringify(filePath);
}

export function formatFileSummary(filePaths) {
  const fileSummary = filePaths.slice(0, 2).map((filePath) => basename(filePath)).join(', ');
  const remainingCount = filePaths.length - Math.min(filePaths.length, 2);
  return `${fileSummary}${remainingCount > 0 ? ` +${remainingCount} more` : ''}`;
}

async function askForConfirmation(question) {
  const terminal = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await terminal.question(`${question} Escriu PUBLICAR per continuar: `);
    return answer.trim() === 'PUBLICAR';
  } finally {
    terminal.close();
  }
}

async function runPublication() {
  for (const [command, args] of CHECKS) {
    stdout.write(`\n> ${command} ${args.join(' ')}\n`);
    const exitCode = run(command, args);
    if (exitCode !== 0) {
      stdout.write(`\nPublicació aturada: ${command} ${args.join(' ')} ha fallat (codi ${exitCode}).\n`);
      return exitCode;
    }
  }

  const branch = capture('git', ['branch', '--show-current']).trim();
  if (branch !== 'main') {
    stdout.write(`\nPublicació aturada: la branca actual és ${branch || '(desconeguda)'}, no main.\n`);
    return 1;
  }

  stdout.write('\nComprovant origin/main...\n');
  if (run('git', ['fetch', '--quiet', 'origin', 'main']) !== 0) {
    stdout.write('\nPublicació aturada: no s’ha pogut actualitzar la referència remota origin/main.\n');
    return 1;
  }
  if (run('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD']) !== 0) {
    stdout.write('\nPublicació aturada: origin/main conté canvis que no són a la branca local. Sincronitza main abans de publicar.\n');
    return 1;
  }

  const conflictedPaths = nulSeparatedPaths(capture('git', ['diff', '--name-only', '--diff-filter=U', '-z']));
  if (conflictedPaths.length > 0) {
    stdout.write('\nPublicació aturada: hi ha conflictes sense resoldre.\n');
    for (const filePath of conflictedPaths) stdout.write(`  - ${displayPath(filePath)}\n`);
    return 1;
  }

  const changedPaths = new Set([
    ...nulSeparatedPaths(capture('git', ['diff', 'HEAD', '--name-only', '-z'])),
    ...nulSeparatedPaths(capture('git', ['ls-files', '--others', '--exclude-standard', '-z'])),
  ]);
  const safePaths = [...changedPaths].filter((filePath) => !isSensitivePath(filePath));
  const excludedPaths = [...changedPaths].filter(isSensitivePath);
  const commitsToPush = capture('git', ['log', '--oneline', 'origin/main..HEAD'])
    .split(/\r?\n/)
    .filter(Boolean);
  const committedPaths = nulSeparatedPaths(capture('git', ['diff', '--name-only', '-z', 'origin/main..HEAD']));
  const sensitiveCommittedPaths = [...new Set(committedPaths.filter(isSensitivePath))];
  if (sensitiveCommittedPaths.length > 0) {
    stdout.write('\nPublicació aturada: hi ha commits locals pendents amb fitxers sensibles. No s’enviarà cap commit.\n');
    for (const filePath of sensitiveCommittedPaths) stdout.write(`  - ${displayPath(filePath)}\n`);
    return 1;
  }

  if (excludedPaths.length > 0) {
    stdout.write('\nFitxers sensibles exclosos (no se’n mostrarà el contingut):\n');
    for (const filePath of excludedPaths) stdout.write(`  - ${displayPath(filePath)}\n`);
  }

  if (safePaths.length === 0 && commitsToPush.length === 0) {
    stdout.write('\nNo hi ha canvis publicables. No es crearà cap commit ni s’executarà cap push.\n');
    return 0;
  }

  stdout.write('\nFitxers que s’inclouran en el commit:\n');
  if (safePaths.length === 0) stdout.write('  (cap; només hi ha commits locals pendents de publicar)\n');
  for (const filePath of safePaths) stdout.write(`  - ${displayPath(filePath)}\n`);

  if (commitsToPush.length > 0) {
    stdout.write('\nCommits locals que també s’enviaran a origin/main:\n');
    for (const commit of commitsToPush) stdout.write(`  - ${commit}\n`);
  }

  if (!(await askForConfirmation('\nConfirma la publicació?'))) {
    stdout.write('\nPublicació cancel·lada. No s’han afegit fitxers, creat commits ni fet push.\n');
    return 0;
  }

  if (safePaths.length > 0) {
    const pathspecs = safePaths.map(literalPathspec);
    if (run('git', ['add', '-A', '--', ...pathspecs]) !== 0) {
      stdout.write('\nPublicació aturada: git add ha fallat.\n');
      return 1;
    }

    const fileSummary = formatFileSummary(safePaths);
    const commitMessage = `chore: publish Paraules (${fileSummary})`;
    const commitStatus = run('git', ['commit', '--only', '-m', commitMessage, '--', ...pathspecs]);
    if (commitStatus !== 0) {
      stdout.write('\nPublicació aturada: no s’ha pogut crear el commit.\n');
      return commitStatus;
    }
  } else {
    stdout.write('\nNo hi ha canvis de fitxers; no es crearà cap commit buit.\n');
  }

  stdout.write('\nEnviant origin/main...\n');
  const pushStatus = await new Promise((resolve) => {
    const child = spawn('git', ['push', 'origin', 'main'], { stdio: 'inherit' });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
  if (pushStatus !== 0) {
    stdout.write('\nEl push ha fallat. Revisa la sortida anterior; no s’ha pogut confirmar la publicació a GitHub.\n');
    stdout.write(`Panell de Netlify: ${NETLIFY_DASHBOARD_URL}\n`);
    return pushStatus;
  }

  stdout.write('\nPush completat a GitHub. Si Netlify està connectat amb aquest repositori, el desplegament s’iniciarà automàticament.\n');
  stdout.write(`Panell de desplegaments de Netlify: ${NETLIFY_DASHBOARD_URL}\n`);
  return 0;
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMainModule) {
  runPublication().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    stdout.write(`\nPublicació aturada: ${error instanceof Error ? error.message : 'error inesperat'}\n`);
    process.exitCode = 1;
  });
}
