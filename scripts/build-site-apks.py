#!/usr/bin/env python3
"""Build signed permission-free mode launchers using the existing Windows Android SDK from WSL.
Usage: python3 scripts/build-site-apks.py --icons /absolute/path/to/icon-directory
Icons must contain corp.png/blog.png/shop.png/admin.png (512px square).
Signing key is private, outside the repository. Never delete it: updates need the same key.
"""
import argparse, hashlib, json, os, secrets, shutil, subprocess, tempfile, zipfile
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
SDK = Path('/mnt/c/Users/playz/AppData/Local/Android/Sdk')
JDK = Path('/mnt/c/Program Files/Android/Android Studio/jbr/bin')
TOOLS = SDK / 'build-tools/36.1.0'
PLATFORM = SDK / 'platforms/android-36/android.jar'
MODES = {'corp': ('ProPig 기업', '/corp'), 'blog': ('ProPig 블로그', '/blog'), 'shop': ('ProPig 생활', '/propig'), 'admin': ('ProPig 관리자', '/admin')}

def win(p):
    return subprocess.check_output(['wslpath', '-w', str(p)], text=True).strip()

def run(*args):
    subprocess.run([str(a) for a in args], check=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--icons', required=True, type=Path)
    args = parser.parse_args()
    for mode in MODES:
        if not (args.icons / f'{mode}.png').is_file():
            raise SystemExit(f'Missing icon: {mode}')
    private = Path.home() / '.local/share/propig-android-signing'
    private.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(private, 0o700)
    key = private / 'launcher.jks'
    password = private / 'password.txt'
    if key.exists() != password.exists():
        raise SystemExit('Incomplete signing identity; restore private backup, do not replace the key.')
    if not key.exists():
        password.write_text(secrets.token_urlsafe(36), encoding='utf-8')
        os.chmod(password, 0o600)
        run(JDK/'keytool.exe', '-genkeypair', '-keystore', win(key), '-storepass:file', win(password), '-keypass:file', win(password), '-alias', 'propig-launcher', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=ProPig Site Launchers', '-storetype', 'JKS')
        os.chmod(key, 0o600)
    work = Path(tempfile.mkdtemp(prefix='propig-apks-', dir='/mnt/c/Users/playz/AppData/Local/Temp'))
    output = ROOT / 'public/downloads/android'
    output.mkdir(parents=True, exist_ok=True)
    java = JDK/'java.exe'
    classes = work/'classes'; classes.mkdir()
    run(JDK/'javac.exe', '-encoding', 'UTF-8', '-source', '8', '-target', '8', '-bootclasspath', win(PLATFORM), '-d', win(classes), win(ROOT/'android/site-launcher/LauncherActivity.java'))
    dex = work/'dex'; dex.mkdir()
    run(java, '-cp', win(TOOLS/'lib/d8.jar'), 'com.android.tools.r8.D8', '--min-api', '23', '--lib', win(PLATFORM), '--output', win(dex), *[win(p) for p in classes.rglob('*.class')])
    manifest_entries = {}
    for mode, (label, route) in MODES.items():
        folder = work/mode; (folder/'res/drawable').mkdir(parents=True); (folder/'res/values').mkdir()
        shutil.copyfile(args.icons/f'{mode}.png', folder/'res/drawable/launcher.png')
        home = 'https://propig-63524.web.app' + route
        (folder/'res/values/strings.xml').write_text(f'<resources><string name="app_name">{escape(label)}</string><string name="site_home">{escape(home)}</string></resources>', encoding='utf-8')
        package = f'com.propig.launcher.{mode}'
        (folder/'AndroidManifest.xml').write_text(f'''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{package}" android:versionCode="1" android:versionName="1.0.0">
<uses-sdk android:minSdkVersion="23" android:targetSdkVersion="36"/>
<application android:label="@string/app_name" android:icon="@drawable/launcher" android:allowBackup="false" android:usesCleartextTraffic="false" android:theme="@android:style/Theme.Material.Light.NoActionBar">
<activity android:name="com.propig.launcher.LauncherActivity" android:exported="true" android:excludeFromRecents="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity>
</application></manifest>''', encoding='utf-8')
        raw = folder/'raw.apk'; aligned = folder/'aligned.apk'; signed = folder/'signed.apk'
        run(TOOLS/'aapt.exe', 'package', '-f', '-M', win(folder/'AndroidManifest.xml'), '-S', win(folder/'res'), '-I', win(PLATFORM), '-F', win(raw))
        with zipfile.ZipFile(raw, 'a', zipfile.ZIP_DEFLATED) as archive:
            archive.write(dex/'classes.dex', 'classes.dex')
        run(TOOLS/'zipalign.exe', '-f', '4', win(raw), win(aligned))
        run(java, '-jar', win(TOOLS/'lib/apksigner.jar'), 'sign', '--ks', win(key), '--ks-key-alias', 'propig-launcher', '--ks-pass', 'file:'+win(password), '--out', win(signed), win(aligned))
        run(java, '-jar', win(TOOLS/'lib/apksigner.jar'), 'verify', '--verbose', win(signed))
        run(TOOLS/'zipalign.exe', '-c', '4', win(signed))
        badge = subprocess.check_output([str(TOOLS/'aapt.exe'), 'dump', 'badging', win(signed)], text=True, encoding='utf-8')
        assert f"package: name='{package}'" in badge and "sdkVersion:'23'" in badge
        assert 'uses-permission:' not in badge
        filename = f'propig-{mode}-1.0.0.apk'
        shutil.copyfile(signed, output/filename)
        shutil.copyfile(args.icons/f'{mode}.png', output/f'{mode}.png')
        manifest_entries[mode] = dict(label=label, package=package, home=home, version='1.0.0', minAndroid='6.0', file=filename, bytes=signed.stat().st_size, sha256=hashlib.sha256(signed.read_bytes()).hexdigest())
    (output/'manifest.json').write_text(json.dumps(manifest_entries, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'output':str(output), 'build_workspace':str(work), 'verified_modes':list(manifest_entries)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
