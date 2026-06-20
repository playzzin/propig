import { copyFileSync, existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const apiDir = join(root, 'src', 'app', 'api');
const nextBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next');
const disabledRouteSuffix = '.static-export-disabled';
const staticDistDir = '.next-static-export';

function removeGeneratedDir(name) {
  const target = join(root, name);
  if (!target.startsWith(root + sep)) {
    throw new Error(`Refusing to remove path outside workspace: ${target}`);
  }
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
}

function restoreStaleDisabledRoutes(dir) {
  if (!existsSync(dir)) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      restoreStaleDisabledRoutes(fullPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(disabledRouteSuffix)) {
      continue;
    }

    const originalPath = fullPath.slice(0, -disabledRouteSuffix.length);
    if (existsSync(originalPath)) {
      throw new Error(`Refusing to overwrite route file while restoring: ${originalPath}`);
    }
    renameSync(fullPath, originalPath);
  }
}

function collectRouteFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectRouteFiles(fullPath);
    }
    return entry.isFile() && entry.name === 'route.ts' ? [fullPath] : [];
  });
}

function disabledRoutePath(routePath) {
  return `${routePath}${disabledRouteSuffix}`;
}

function collectFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }
    return entry.isFile() ? [fullPath] : [];
  });
}

function createRscAliasFiles(distDirName) {
  const distDir = join(root, distDirName);

  for (const filePath of collectFiles(distDir)) {
    const relativeSegments = filePath.slice(distDir.length + 1).split(sep);
    const nextSegmentIndex = relativeSegments.findIndex((segment) => segment.startsWith('__next.'));

    if (nextSegmentIndex < 0 || nextSegmentIndex === relativeSegments.length - 1 || !filePath.endsWith('.txt')) {
      continue;
    }

    const parentSegments = relativeSegments.slice(0, nextSegmentIndex);
    const aliasName = relativeSegments.slice(nextSegmentIndex).join('.');
    const aliasPath = join(distDir, ...parentSegments, aliasName);

    if (!existsSync(aliasPath)) {
      copyFileSync(filePath, aliasPath);
    }
  }
}

const disabledRoutes = [];
let status = 1;

try {
  restoreStaleDisabledRoutes(apiDir);

  removeGeneratedDir(staticDistDir);
  removeGeneratedDir('out');

  for (const routePath of collectRouteFiles(apiDir)) {
    const disabledPath = disabledRoutePath(routePath);
    if (existsSync(disabledPath)) {
      throw new Error(`Temporary disabled route already exists: ${disabledPath}`);
    }
    renameSync(routePath, disabledPath);
    disabledRoutes.push([disabledPath, routePath]);
  }

  const result = spawnSync(nextBin, ['build', '--webpack'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      NEXT_STATIC_EXPORT: 'true',
      NEXT_DIST_DIR: staticDistDir,
    },
  });

  if (result.error) {
    throw result.error;
  }

  status = result.status ?? 1;

  if (status === 0) {
    createRscAliasFiles(staticDistDir);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  status = 1;
} finally {
  for (const [disabledPath, routePath] of disabledRoutes.reverse()) {
    if (existsSync(disabledPath)) {
      renameSync(disabledPath, routePath);
    }
  }
}

process.exit(status);
