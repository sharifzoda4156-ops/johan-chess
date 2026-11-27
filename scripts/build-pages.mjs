import {cp,mkdir,readFile,writeFile,rm,access,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

async function listFiles(dir,base=dir,skipTop=new Set(['engine'])){
 const entries=await readdir(dir,{withFileTypes:true});
 const files=[];
 for(const entry of entries){
  const full=join(dir,entry.name);
  const rel=relative(base,full).split(sep).join('/');
  if(entry.isDirectory()){
   if(dir===base&&skipTop.has(entry.name))continue;
   files.push(...await listFiles(full,base,skipTop));
  }else if(entry.isFile()){
   files.push({full,rel});
  }
 }
 return files.sort((a,b)=>a.rel.localeCompare(b.rel));
}

export async function computeAssetHash(publicDir){
 const h=createHash('sha256');
 const files=await listFiles(publicDir);
 for(const f of files){
  h.update(f.rel);
  h.update('\0');
  h.update(await readFile(f.full));
  h.update('\0');
 }
 return h.digest('hex').slice(0,8);
}

export function stampHtml(html,version){
 if(!html.includes('<html lang="ru">'))throw Error('Expected HTML root');
 let out=html.replace('<html lang="ru">','<html lang="ru" data-hosting="pages">');
 const assets=['style.css','mobile-ui.css','app.js','logo.svg','knight-mark.svg','favicon.svg'];
 for(const asset of assets){
  const escaped=asset.replace(/\./g,'\\.');
  out=out.replace(new RegExp(`((?:href|src)=")${escaped}(")`,'g'),`$1${asset}?v=${version}$2`);
 }
 return out;
}

export function stampJsImports(source,version){
 // Append cache-busting query only to top-level relative JS modules, never to ./engine/* worker assets.
 return source.replace(/(from\s*['"]\.\/(?!engine\/)([A-Za-z0-9._-]+\.js))(['"])/g,`$1?v=${version}$3`);
}

export async function buildPages({root=new URL('../',import.meta.url),out=new URL('dist/',root)}={}){
 const publicDir=fileURLToPath(new URL('public/',root));
 const outDir=fileURLToPath(out);
 await access(new URL('public/engine-path.js',root));
 await access(new URL('public/chess.js',root));
 const version=await computeAssetHash(publicDir);
 await rm(outDir,{recursive:true,force:true});
 await mkdir(outDir,{recursive:true});
 await cp(publicDir,outDir,{recursive:true});
 try{
  const asmSrc=fileURLToPath(new URL('node_modules/stockfish/bin/stockfish-18-asm.js',root));
  await access(asmSrc);
  await cp(asmSrc,join(outDir,'engine','stockfish-18-asm.js'));
 }catch{}

 const htmlFile=join(outDir,'index.html');
 const html=await readFile(htmlFile,'utf8');
 await writeFile(htmlFile,stampHtml(html,version));

 // Stamp top-level ES module imports in dist/*.js without touching engine-path.js or dist/engine/
 const topEntries=await readdir(outDir,{withFileTypes:true});
 for(const entry of topEntries){
  if(!entry.isFile()||!entry.name.endsWith('.js')||entry.name==='engine-path.js')continue;
  const jsPath=join(outDir,entry.name);
  const src=await readFile(jsPath,'utf8');
  const stamped=stampJsImports(src,version);
  if(stamped!==src)await writeFile(jsPath,stamped);
 }

 await writeFile(join(outDir,'.nojekyll'),'');
 await cp(fileURLToPath(new URL('README.md',root)),join(outDir,'SOURCE-AND-LICENSES.md'));
 return {outDir,version};
}

const isMain=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(isMain){
 const {version}=await buildPages();
 console.log(`GitHub Pages build: dist/ (v=${version})`);
}
