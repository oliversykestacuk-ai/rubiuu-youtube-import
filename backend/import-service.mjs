import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {timingSafeEqual} from 'node:crypto';
import {classifyLink,MAX_IMPORT_BYTES} from '../dist/link-import.js';

const python=process.env.RUBIUU_PYTHON||'python3';
let active=0,ready;
const buckets=new Map();
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
export function authorize(req){
  const token=process.env.IMPORT_SERVICE_TOKEN;
  if(!token)return process.env.NODE_ENV!=='production';
  const supplied=Buffer.from(String(req.headers['x-import-token']||'')),expected=Buffer.from(token);
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
function run(args,{signal,timeout=120000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(python,['-m','yt_dlp',...args],{shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    let errorText='',settled=false,timedOut=false;
    const kill=()=>{try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}};
    const abort=()=>kill();
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)kill();
    const timer=setTimeout(()=>{timedOut=true;kill();},timeout);
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
    child.stderr.on('data',data=>{errorText=(errorText+data.toString()).slice(-6000);});child.stdout.resume();
    child.on('error',()=>finish(Error('Layanan pengambil YouTube belum terpasang.')));
    child.on('close',code=>{
      if(signal?.aborted)return finish(Error('Pengambilan audio dibatalkan.'));
      if(timedOut)return finish(Error('Pengambilan audio melewati batas 2 menit. Coba video lebih pendek.'));
      if(code===0)return finish();
      if(/sign in|bot|captcha|HTTP Error 403|PO Token/i.test(errorText))return finish(Error('YouTube membatasi akses dari server ini. Coba lagi nanti atau unggah file dari komputer.'));
      if(/private|unavailable|not available|members.only|removed|copyright|age.restricted/i.test(errorText))return finish(Error('Video tidak tersedia untuk diambil. Gunakan video publik lain atau unggah file dari komputer.'));
      if(/No module named|not found/i.test(errorText))return finish(Error('Komponen YouTube belum lengkap di server.'));
      finish(Error('Audio YouTube gagal diambil. Periksa link atau coba video publik lain.'));
    });
  });
}
export function downloaderReady(){return ready??=(run(['--version'],{timeout:10000}).then(()=>true,()=>false));}
async function bodyJson(req){
  let body='';for await(const part of req){body+=part.toString();if(body.length>4096)throw Error('Permintaan terlalu besar.');}
  try{return JSON.parse(body);}catch{throw Error('Permintaan tidak valid.');}
}
export function canonicalYoutube(value){const link=classifyLink(value);if(link.kind!=='youtube')throw Error('Layanan ini hanya menerima link video YouTube.');return link.url;}
export async function handleImportApi(req,res){
  const route=new URL(req.url,'http://localhost').pathname;
  if(!route.startsWith('/api/'))return false;
  if(!authorize(req)){json(res,401,{error:'Layanan belum diotorisasi.'});return true;}
  if(route==='/api/health'&&req.method==='GET'){json(res,200,{youtube:await downloaderReady()});return true;}
  if(route!=='/api/import'||req.method!=='POST'){json(res,404,{error:'Endpoint tidak tersedia.'});return true;}
  if(!String(req.headers['content-type']||'').startsWith('application/json')){json(res,415,{error:'Permintaan JSON diperlukan.'});return true;}
  let url;try{url=canonicalYoutube((await bodyJson(req)).url||'');}catch(error){json(res,400,{error:error.message});return true;}
  if(!await downloaderReady()){json(res,503,{error:'YouTube belum aktif. Layanan pengambil audio perlu dipasang terlebih dahulu.'});return true;}
  const key=String(req.headers['x-client-key']||req.socket.remoteAddress||'unknown');
  const now=Date.now();for(const [id,bucket]of buckets)if(now-bucket.start>600000)buckets.delete(id);
  const bucket=buckets.get(key)||{start:now,count:0};
  if(bucket.count>=10){json(res,429,{error:'Maksimal 10 impor per 10 menit. Coba lagi nanti.'});return true;}
  if(active>=2){json(res,429,{error:'Layanan sedang sibuk. Coba lagi sebentar.'});return true;}
  bucket.count++;buckets.set(key,bucket);active++;
  const controller=new AbortController();const onClose=()=>{if(!res.writableFinished)controller.abort();};res.on('close',onClose);
  let dir;
  try{
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'rubiuu-audio-'));
    await run(['--ignore-config','--no-playlist','--no-progress','--no-warnings','--no-cache-dir','--no-mtime','--write-info-json','--socket-timeout','15','--retries','1','--fragment-retries','1','--abort-on-unavailable-fragment','--max-filesize','100M','--match-filter','duration <= 1200 & !is_live','--js-runtimes',`node:${process.execPath}`,'-f','bestaudio[ext=m4a]/bestaudio','-o',path.join(dir,'audio.%(ext)s'),'--',url],{signal:controller.signal});
    const names=await fs.readdir(dir),audioName=names.find(name=>/^audio\.(m4a|webm|opus|ogg|mp3|aac)$/.test(name));
    if(!audioName)throw Error('Audio tidak tersedia, melebihi 20 menit / 100 MB, atau merupakan siaran langsung.');
    const file=path.join(dir,audioName),stat=await fs.stat(file);if(stat.size>MAX_IMPORT_BYTES||!stat.size)throw Error('Ukuran audio harus antara 1 byte dan 100 MB.');
    let info={};try{info=JSON.parse(await fs.readFile(path.join(dir,'audio.info.json'),'utf8'));}catch{}
    if(info.duration>1200)throw Error('Audio maksimal 20 menit.');
    const ext=path.extname(audioName),title=String(info.title||'youtube-audio').replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').slice(0,120)+ext;
    const mime={'.m4a':'audio/mp4','.webm':'audio/webm','.opus':'audio/ogg','.ogg':'audio/ogg','.mp3':'audio/mpeg','.aac':'audio/aac'}[ext];
    const audio=await fs.readFile(file);if(controller.signal.aborted)return true;
    res.writeHead(200,{'Content-Type':mime,'Content-Length':audio.length,'X-Audio-Filename':encodeURIComponent(title),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(audio);
  }catch(error){if(!res.destroyed&&!res.headersSent)json(res,502,{error:error.message});}
  finally{res.off('close',onClose);active--;if(dir)await fs.rm(dir,{recursive:true,force:true});}
  return true;
}
