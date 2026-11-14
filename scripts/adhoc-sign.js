// electron-builder afterPack hook.
//
// We have no Apple Developer ID, so electron-builder skips code signing. macOS on
// Apple Silicon refuses to launch a completely unsigned app ("app is damaged"), so
// give the bundle an ad-hoc signature. That is enough for the app to run locally;
// it is not enough to distribute it to other machines.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  console.log(`  • ad-hoc signed  ${app}`);
};
