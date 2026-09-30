import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const inside = (directory, file) => {
  const relative = path.relative(directory, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
const sourceExtension = /\.[cm]?[jt]sx?$/;

async function sourceFiles(directory) {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) files.push(...await sourceFiles(file));
    else if (item.isFile() && sourceExtension.test(file)) files.push(file);
  }
  return files;
}

// Exclude an independent browser app only while no other source imports it
// into the website. Unknown API calls in website code must still fail.
export async function verifyStandaloneClients(root, definitions = []) {
  assert.ok(Array.isArray(definitions), 'standaloneClients must be an array.');
  const directories = [];
  for (const definition of definitions) {
    assert.equal(typeof definition.directory, 'string');
    assert.match(definition.directory, /^src\/components\/(?:[\w-]+\/)*[\w-]+$/,
      'Standalone client must have a dedicated component directory, never an app route.');
    assert.equal(typeof definition.entryPoint, 'string');
    const directory = path.resolve(root, definition.directory);
    const entryPoint = path.resolve(root, definition.entryPoint);
    assert.match(definition.buildScript, /^scripts\/(?:[\w-]+\/)*[\w.-]+\.mjs$/);
    assert.ok(inside(directory, entryPoint), 'Standalone entry point must exist inside its directory.');
    // A scoped checkout may omit the entire independent application. Nothing
    // is excluded in that case; a partially present app must still be verified.
    if (!existsSync(directory) && !existsSync(path.join(root, definition.buildScript))) continue;
    assert.ok(existsSync(entryPoint), 'Standalone entry point must exist inside its directory.');
    const buildAst = ts.createSourceFile(definition.buildScript, await readFile(path.join(root, definition.buildScript), 'utf8'), ts.ScriptTarget.Latest, true);
    let registered = false;
    const visitBuild = node => {
      if (ts.isPropertyAssignment(node) && node.name.getText(buildAst) === 'entryPoints'
        && ts.isArrayLiteralExpression(node.initializer)) {
        registered ||= node.initializer.elements.some(item => ts.isStringLiteralLike(item) && item.text === definition.entryPoint);
      }
      ts.forEachChild(node, visitBuild);
    };
    visitBuild(buildAst);
    assert.ok(registered, `Standalone build must explicitly register ${definition.entryPoint}.`);
    directories.push(directory);
  }
  if (!directories.length) return directories;

  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  assert.ok(!config.error, 'Cannot inspect standalone imports without a valid tsconfig.');
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  for (const file of await sourceFiles(path.join(root, 'src'))) {
    if (directories.some(directory => inside(directory, file))) continue;
    const ast = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = node => {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) specifier = node.moduleSpecifier;
      else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        specifier = node.arguments[0];
        assert.ok(specifier && ts.isStringLiteralLike(specifier),
          `Cannot prove standalone separation for a computed import in ${path.relative(root, file)}. Use an explicit module path.`);
      }
      else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) specifier = node.moduleReference.expression;
      else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal;
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const resolved = ts.resolveModuleName(specifier.text, file, options, ts.sys).resolvedModule?.resolvedFileName;
        if (resolved) assert.ok(!directories.some(directory => inside(directory, path.resolve(resolved))),
          `Standalone client imported by website source ${path.relative(root, file)}: ${specifier.text}. Move it to a website runtime before shipping.`);
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  return directories;
}

export function isStandaloneClientFile(file, directories) {
  return directories.some(directory => inside(directory, file));
}
