/* Ad-hoc code signature for the packaged macOS app.
 *
 * `mac.identity: null` tells electron-builder to skip signing entirely, which
 * leaves the bundle with NO signature at all. On macOS that costs two things:
 *
 *   1. Apple Silicon refuses to execute an unsigned arm64 binary, so a universal
 *      app can only fall back to its x86_64 slice under Rosetta — the native
 *      half is dead weight.
 *   2. TCC (the privacy system) identifies apps by their code signature. With no
 *      signature there is no stable identity, and the microphone prompt for LTC
 *      may never appear — the request is just denied.
 *
 * An ad-hoc signature ("-") costs nothing and needs no Apple account. It is not
 * a trusted signature — Gatekeeper still quarantines downloads, which is what
 * the DMG's READ ME FIRST covers — but it gives the binary a real code identity,
 * which is all the two problems above need.
 *
 * Deliberately no --options runtime: the hardened runtime is only meaningful
 * alongside notarization, and enabling it here would restrict Electron's JIT for
 * no gain.
 */
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;

  /* A universal build packs each architecture into its own *-temp directory and
     then merges them. Signing those halves makes their _CodeSignature/CodeResources
     differ, and the merge aborts ("Expected all non-binary files to have identical
     SHAs"). Only the merged bundle gets signed. */
  if (/-(x64|arm64)-temp\/?$/.test(context.appOutDir)) return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  /* Point the document type at our exported UTI. electron-builder writes
     CFBundleDocumentTypes from `fileAssociations` and has no option for
     LSItemContentTypes, but without it the type declaration and the document entry
     are two unrelated facts and Finder keeps showing a blank generic icon.
     Must happen BEFORE signing — editing a signed bundle invalidates it. */
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  /* Idempotent: this hook is registered for both afterPack and afterSign, so a bare
     Add would list the UTI twice. Clear it first; the Delete fails harmlessly the
     first time through. */
  spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Delete :CFBundleDocumentTypes:0:LSItemContentTypes', plist]);
  execFileSync('/usr/libexec/PlistBuddy', [
    '-c', 'Add :CFBundleDocumentTypes:0:LSItemContentTypes array',
    '-c', 'Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string com.cueflow.show',
    plist,
  ], { stdio: 'inherit' });

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });

  /* Fail the build rather than ship an unsigned bundle again.
     codesign -dv reports on STDERR, so read that, not stdout. */
  const res = spawnSync('codesign', ['-dv', appPath], { encoding: 'utf8' });
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  if (!/Signature=adhoc/i.test(out)) {
    throw new Error('ad-hoc signing did not take:\n' + out);
  }
  console.log(`  • ad-hoc signed  ${appPath}`);
};
