#!/usr/bin/env node
'use strict';

/**
 * Assembles a release folder you can hand to someone: the app plus the
 * install instructions, and a zip of the two.
 *
 *   node scripts/release.js            build the app first, then assemble
 *   node scripts/release.js --no-build use whatever is already in dist/
 *
 * The zip is made with `ditto`, not `zip`. A .app is a folder full of
 * symlinks and signed frameworks; `zip` and Finder's "Compress" can mangle
 * both, which is what produces "the application is damaged" on the other end.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { version, build } = require(path.join(ROOT, 'package.json'));
const APP = `${build.productName}.app`;

const packed = path.join(ROOT, 'dist', 'mac-arm64', APP);
const folder = path.join(ROOT, 'dist', `${build.productName} ${version}`);
const zip = path.join(ROOT, 'dist', `${build.productName}-${version}-arm64-folder.zip`);

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit' });

if (!process.argv.includes('--no-build')) {
  run('npx', ['electron-builder', '--dir']);
}

if (!fs.existsSync(packed)) {
  console.error(`No app at ${packed}. Run without --no-build.`);
  process.exit(1);
}

fs.rmSync(folder, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.mkdirSync(folder, { recursive: true });

// ditto, not fs.cpSync: it preserves the symlinks and extended attributes the
// code signature is computed over.
run('ditto', [packed, path.join(folder, APP)]);
fs.copyFileSync(path.join(ROOT, 'INSTALL.txt'), path.join(folder, 'INSTALL — read me first.txt'));

run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', folder, zip]);

// A signature that survived the copy is the whole point; fail loudly if not.
run('codesign', ['--verify', '--deep', '--strict', path.join(folder, APP)]);

const mb = (n) => `${(n / 1e6).toFixed(0)} MB`;
console.log(`\nFolder  ${folder}`);
console.log(`Zip     ${zip}  (${mb(fs.statSync(zip).size)})`);
console.log('\nSend the zip, not the bare folder — cloud drives and chat apps');
console.log('rewrite .app folders in transit and break the signature.');
