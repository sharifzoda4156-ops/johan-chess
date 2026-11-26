const CATALOG='https://raw.githubusercontent.com/sharifzoda4156-ops/johan-chess/puzzle-catalog/catalog.json';
const BASE='https://github.com/sharifzoda4156-ops/johan-chess/releases/download/';
export const MAX_CATALOG=8*1024*1024,MAX_PACK=1024*1024;
export function requestSpec(path,params){
 if(path==='/api/puzzle-data/catalog')return {url:CATALOG,limit:MAX_CATALOG};
 if(path!=='/api/puzzle-data/pack')return null;
 const tag=params.get('tag'),asset=params.get('asset'),o=params.get('offset'),l=params.get('length');
 if(!/^lichess-data-\d{1,20}-\d{1,5}$/.test(tag||'')||!/^band-\d{1,2}-\d{1,5}\.bin$/.test(asset||'')||!/^\d{1,9}$/.test(o||'')||!/^\d{1,7}$/.test(l||''))throw Error('Invalid pack request');
 const offset=Number(o),length=Number(l);if(length<1||length>MAX_PACK||offset+length>128*1024*1024)throw Error('Invalid pack range');
 return {url:BASE+tag+'/'+asset,limit:length,offset,length};
}
export function validRange(value,offset,length){
 const m=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(value||'');return !!m&&Number(m[1])===offset&&Number(m[2])===offset+length-1&&Number(m[3])>=offset+length&&Number(m[3])<=128*1024*1024;
}
export async function downloadPuzzleData(spec,fetcher=fetch){
 let url=spec.url;const signal=AbortSignal.timeout(30000),range=spec.length?'bytes='+spec.offset+'-'+(spec.offset+spec.length-1):null;
 for(let i=0;i<5;i++){
  const r=await fetcher(url,{redirect:'manual',signal,headers:{'Accept-Encoding':'identity',...(range?{Range:range}:{})}});
  if([301,302,303,307,308].includes(r.status)){
   await r.body?.cancel();const next=new URL(r.headers.get('location')||'',url);
   if(!['github.com','raw.githubusercontent.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(next.hostname)||next.protocol!=='https:'||next.port||next.username||next.password)throw Error('Invalid redirect');
   url=next.href;continue;
  }
  if(range?(r.status!==206||!validRange(r.headers.get('content-range'),spec.offset,spec.length)):r.status!==200){await r.body?.cancel();throw Error('Puzzle data unavailable');}
  const chunks=[];let size=0;
  for await(const chunk of r.body){size+=chunk.length;if(size>spec.limit)throw Error('Puzzle download too large');chunks.push(chunk);}
  if(range&&size!==spec.length)throw Error('Incomplete puzzle pack');
  return Buffer.concat(chunks,size);
 }
 throw Error('Too many redirects');
}
