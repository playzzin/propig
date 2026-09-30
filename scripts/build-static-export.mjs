import {
  closeSync, copyFileSync, fsyncSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, readdirSync, realpathSync, renameSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = realpathSync(process.cwd());
const staticDistDir = '.next-static-export';
const output = join(root, staticDistDir);
const lockPath = join(root, '.static-export.lock');
const stagePrefix = '.propig-static-export-';
// Explicit build inputs, not a repository clone: no credentials, personal
// backups, Functions, logs, previous builds, or Git internals are copied.
const inputs = [
  'src', 'public', 'types', 'package.json', 'package-lock.json',
  'next.config.ts', 'next-env.d.ts', 'tsconfig.json',
  'tsconfig.typecheck.json', 'tsconfig.static-export.json', 'postcss.config.mjs',
];
const envInputs = ['.env', '.env.local', '.env.production', '.env.production.local'];

function present(path) {
  try { lstatSync(path); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function inspect(path, visit) {
  const stat = lstatSync(path);
  // Never dereference even an internal source link: it may point to a private
  // file or change after validation. node_modules is the only deliberate link.
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
    throw new Error(`Unsupported link or special file in build inputs: ${path}`);
  }
  if (basename(path).endsWith('.static-export-disabled')) {
    throw new Error(`Legacy disabled source found: ${path}. Stop old builds and restore it manually; no source was changed.`);
  }
  visit?.(path, stat);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) inspect(join(path, entry), visit);
  }
}

function copyTree(source, target, allowEnv = false) {
  inspect(source, (file, stat) => {
    const name = basename(file);
    if (!allowEnv && (/^\.env(?:\.|$)/i.test(name) || /\.(?:pem|key|p12|pfx|jks)$/i.test(name) || name === '.git')) {
      throw new Error(`Private input is not allowed in a build tree: ${file}`);
    }
    const destination = join(target, relative(source, file));
    if (stat.isDirectory()) mkdirSync(destination, { recursive: true, mode: 0o700 });
    else copyFileSync(file, destination);
  });
}

function createRscAliasFiles(exportDir) {
  inspect(exportDir, (file, stat) => {
    if (!stat.isFile()) return;
    const segments = relative(exportDir, file).split(sep);
    const index = segments.findIndex((segment) => segment.startsWith('__next.'));
    if (index < 0 || index === segments.length - 1 || !file.endsWith('.txt')) return;
    const alias = join(exportDir, ...segments.slice(0, index), segments.slice(index).join('.'));
    if (!present(alias)) copyFileSync(file, alias);
  });
}

function boundaryGate() {
  const result = spawnSync(process.execPath, [
    join(root, 'scripts', 'verify-deployment-boundary.mjs'), '--require-static-export-runtime',
  ], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Static export blocked by the production runtime boundary gate.');
}

let lockFd;
let stage;
let backup;
let movedPrevious = false;
let keepRecovery = false;
let status = 1;
function journal(phase) {
  // This is recovery metadata only; never record environment values.
  writeFileSync(lockFd, JSON.stringify({ pid: process.pid, phase, stage, output, backup }) + '\n');
  fsyncSync(lockFd);
}

try {
  // A killed process deliberately leaves the lock and its owned stage behind.
  // Do not infer that a PID is dead across Windows/WSL or auto-delete stale data.
  lockFd = openSync(lockPath, 'wx', 0o600);
  journal('locked');
  for (const name of inputs) {
    const path = join(root, name);
    if (present(path)) inspect(path);
  }
  boundaryGate();
  // A sibling is outside the repo yet on the same filesystem for rename publish.
  // Only the exact mkdtemp result owned by this invocation may be cleaned up.
  stage = mkdtempSync(join(dirname(root), stagePrefix));
  const workspace = join(stage, 'workspace');
  mkdirSync(workspace, { mode: 0o700 });
  backup = join(stage, 'previous-output');
  journal('staging');
  for (const name of inputs) {
    if (present(join(root, name))) copyTree(join(root, name), join(workspace, name));
  }
  for (const name of envInputs) {
    const source = join(root, name);
    if (present(source)) {
      if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) {
        throw new Error(`Next environment input must be a regular file: ${name}`);
      }
      copyTree(source, join(workspace, name), true);
    }
  }
  // Route removal and Next's generated config/type mutations are staging-only.
  for (const name of ['src/app/api', 'src/api']) {
    rmSync(join(workspace, name), { recursive: true, force: true });
  }
  symlinkSync(join(root, 'node_modules'), join(workspace, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  journal('building');
  // Invoke the JS entry point directly: no shell or platform-specific .cmd shim.
  const result = spawnSync(process.execPath, [
    join(workspace, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build', '--webpack',
  ], {
    cwd: workspace, stdio: 'inherit',
    // CI makes Next fail on missing TypeScript dependencies instead of auto-
    // installing through the shared node_modules link. Never repair installs here.
    env: { ...process.env, CI: 'true', NODE_ENV: 'production', NEXT_EXPORT: 'true', NEXT_STATIC_EXPORT: 'true', NEXT_DIST_DIR: staticDistDir },
  });
  if (result.error) throw result.error;
  status = result.status ?? 1;
  if (status === 0) {
    let candidate = join(workspace, staticDistDir);
    const hasIndex = (directory) => present(join(directory, 'index.html')) && lstatSync(join(directory, 'index.html')).isFile();
    // Firebase serves staticDistDir itself. Publish only the public tree, not
    // a nested export plus private compiler/server artifacts from its parent.
    if (!hasIndex(candidate)) {
      const nested = join(candidate, 'export');
      const out = join(workspace, 'out');
      if (hasIndex(nested)) candidate = nested;
      else if (hasIndex(out)) candidate = out;
      else throw new Error('Next did not produce an exported index.html; previous output retained.');
    }
    const exportDir = candidate;
    inspect(candidate);
    inspect(exportDir, (file) => {
      if (/^\.env(?:\.|$)/i.test(basename(file)) || /\.(?:pem|key|p12|pfx|jks)$/i.test(file)) {
        throw new Error('Private file detected in static export; publication blocked.');
      }
    });
    createRscAliasFiles(exportDir);
    boundaryGate(); // Root contract may have changed while the snapshot built.
    if (present(output) && (!lstatSync(output).isDirectory() || lstatSync(output).isSymbolicLink())) {
      throw new Error('Refusing to replace a non-directory or linked static output.');
    }
    journal('publishing');
    // Portable Node has no atomic exchange of two nonempty directories. Each
    // rename is atomic, but there is a short two-rename gap. SIGKILL/power loss
    // here retains previous-output + journal for MANUAL recovery; never claim
    // crash-atomic visibility or delete a competing user's newly created output.
    if (present(output)) {
      renameSync(output, backup);
      movedPrevious = true;
    }
    try {
      if (present(output)) throw new Error('Output appeared during publish; refusing to overwrite it.');
      renameSync(candidate, output);
    } catch (error) {
      if (movedPrevious) {
        if (present(output)) {
          keepRecovery = true;
          throw new Error(`Publish collision: new output preserved; previous output retained at ${backup}. Original error: ${error.message}`);
        }
        try { renameSync(backup, output); movedPrevious = false; } catch (restoreError) {
          keepRecovery = true;
          throw new Error(`Publish recovery failed; previous output retained at ${backup}: ${restoreError.message}`);
        }
      }
      throw error;
    }
    // Publish committed. Remaining cleanup failures must not roll back new output.
    movedPrevious = false;
    journal('published');
  }
} catch (error) {
  console.error(error.code === 'EEXIST' && lockFd === undefined
    ? 'Static export lock exists. Check Windows/WSL builds and its recovery journal before manually moving it aside.'
    : error.message);
  status = 1;
} finally {
  if (stage && !keepRecovery) {
    try {
      if (dirname(stage) !== dirname(root) || !basename(stage).startsWith(stagePrefix)) throw new Error('Unsafe staging cleanup path.');
      // rm does not follow the node_modules link/junction.
      rmSync(stage, { recursive: true, force: true });
    } catch (error) {
      keepRecovery = true;
      console.error(`Staging cleanup failed; inspect ${stage}: ${error.message}`);
      status = 1;
    }
  }
  if (lockFd !== undefined) {
    closeSync(lockFd);
    if (!keepRecovery) rmSync(lockPath);
    else console.error(`Recovery data and lock retained: ${lockPath}. Do not delete until recovery is complete.`);
  }
}
process.exit(status);
