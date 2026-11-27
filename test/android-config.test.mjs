import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Android manifest and adaptive icon resources define the J-Knight launcher icon',()=>{
 const manifest=read('android/app/src/main/AndroidManifest.xml');
 assert.match(manifest,/android:icon="@mipmap\/ic_launcher"/);
 assert.match(manifest,/android:roundIcon="@mipmap\/ic_launcher_round"/);
 for(const file of ['ic_launcher.xml','ic_launcher_round.xml']){
  const xml=read('android/app/src/main/res/mipmap-anydpi-v26/'+file);
  assert.match(xml,/@drawable\/ic_launcher_background/);
  assert.match(xml,/@drawable\/ic_launcher_foreground/);
 }
 const bg=read('android/app/src/main/res/drawable/ic_launcher_background.xml');
 const fg=read('android/app/src/main/res/drawable/ic_launcher_foreground.xml');
 assert.match(bg,/#FF0B0E14/);
 assert.match(fg,/#FF34D399/);
 assert.match(fg,/#FFF59E0B/);
});

test('MainActivity implements Onyx bars, file chooser, saveFile, oversized replies, cancelLogin and push updates',()=>{
 const java=read('android/app/src/main/java/com/johansystems/chess/MainActivity.java');
 assert.match(java,/setStatusBarColor\(0xff0b0e14\)/);
 assert.match(java,/setNavigationBarColor\(0xff0b0e14\)/);
 assert.match(java,/onShowFileChooser/);
 assert.match(java,/ACTION_OPEN_DOCUMENT/);
 assert.match(java,/ACTION_CREATE_DOCUMENT/);
 assert.match(java,/rejectOversized\(/);
 assert.match(java,/notifyLichessUpdate\(\)/);
 assert.match(java,/"cancelLogin"\.equals\(op\)/);
});

test('Lichess.java drains OAuth headers, supports cancelLogin, live chat, abort and resilient reconnects',()=>{
 const java=read('android/app/src/main/java/com/johansystems/chess/Lichess.java');
 assert.match(java,/readHeaderLine\(/);
 assert.match(java,/void cancelLogin\(\)/);
 assert.match(java,/case "cancelLogin":/);
 assert.match(java,/activity\.notifyLichessUpdate\(\)/);
 assert.match(java,/"chatLine"\.equals\(type\)/);
 assert.match(java,/\/api\/board\/game\/"\+target\+"\/chat/);
 assert.match(java,/"abort"/);
 assert.doesNotMatch(java,/NET_CAPABILITY_VALIDATED/);
 const main=read('android/app/src/main/java/com/johansystems/chess/MainActivity.java');
 assert.match(main,/void onStart\(\)/);
 assert.match(main,/void onStop\(\)/);
 assert.doesNotMatch(main,/hasWindowFocus\(\)/);
});

test('ChessImport.java returns aligned game metadata fields',()=>{
 const java=read('android/app/src/main/java/com/johansystems/chess/ChessImport.java');
 for(const field of ['whiteRating','blackRating','result','url']){
  assert.match(java,new RegExp(`"${field}"`));
 }
});

test('Android build and workflow support persistent release signing without committing keystores',()=>{
 const gradle=read('android/app/build.gradle');
 assert.match(gradle,/signingConfigs/);
 assert.match(gradle,/ANDROID_KEYSTORE_PATH/);
 assert.match(gradle,/ANDROID_KEYSTORE_PASSWORD/);
 assert.match(gradle,/ANDROID_KEY_ALIAS/);
 assert.match(gradle,/ANDROID_KEY_PASSWORD/);
 const yml=read('.github/workflows/android.yml');
 assert.match(yml,/ANDROID_KEYSTORE_BASE64/);
 assert.match(yml,/:app:assembleRelease/);
 assert.match(yml,/apksigner.*verify/);
});

