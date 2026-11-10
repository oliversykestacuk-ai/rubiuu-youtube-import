export const MAX_IMPORT_BYTES=100*1024*1024;
export function classifyLink(value){
  let url;try{url=new URL(value.trim());}catch{throw Error('Masukkan link lengkap, misalnya https://youtu.be/... atau https://.../musik.mp3.');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('Gunakan link HTTP/HTTPS tanpa username atau password.');
  if(url.href.length>2048)throw Error('Link terlalu panjang.');
  const host=url.hostname.toLowerCase();
  if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)){
    const id=host.endsWith('youtu.be')?url.pathname.split('/')[1]:url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
    if(!id||!/^[-\w]{11}$/.test(id))throw Error('Gunakan link satu video YouTube, bukan channel atau playlist.');
    return {kind:'youtube',url:`https://www.youtube.com/watch?v=${id}`,id};
  }
  return {kind:'audio',url:url.href};
}
function safeName(value,fallback='audio-link'){
  return value.replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').trim().slice(0,150)||fallback;
}
export async function fetchLinkedAudio(value,{signal,onProgress=()=>{},fetcher=fetch}={}){
  const link=classifyLink(value);
  let response;
  try{
    response=await fetcher(link.kind==='youtube'?'/api/import':link.url,link.kind==='youtube'?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:link.url}),signal}:{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  }catch(error){if(signal?.aborted)throw error;throw Error(link.kind==='youtube'?'Layanan YouTube tidak dapat dihubungi. Coba lagi nanti.':'Link tidak dapat diambil. Server sumber mungkin membatasi akses browser (CORS). Gunakan link unduhan audio langsung atau unggah dari komputer.');}
  if(!response.ok){let message;try{message=(await response.json()).error;}catch{}throw Error(message||`Impor gagal (${response.status}). Periksa link atau coba lagi.`);}
  const type=(response.headers.get('Content-Type')||'').split(';')[0];
  if(/html|json|xml/.test(type)){await response.body?.cancel();throw Error(link.kind==='youtube'?'Layanan YouTube belum terhubung. Administrator perlu mengaktifkannya terlebih dahulu.':'Link ini membuka halaman web. Gunakan link file audio langsung atau link video YouTube.');}
  const length=Number(response.headers.get('Content-Length'));
  if(length>MAX_IMPORT_BYTES){await response.body?.cancel();throw Error('Audio melebihi batas 100 MB.');}
  const chunks=[];let total=0;
  if(!response.body)throw Error('Audio tidak tersedia dari link ini.');
  const reader=response.body.getReader();
  try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_IMPORT_BYTES)throw Error('Audio melebihi batas 100 MB.');chunks.push(value);onProgress({bytes:total,total:length||null});}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  if(!total)throw Error('Link menghasilkan file kosong.');
  let name;
  try{name=decodeURIComponent(new URL(response.url||link.url).pathname.split('/').pop()||'audio-link');}catch{name='audio-link';}
  const encodedName=response.headers.get('X-Audio-Filename');
  if(encodedName)try{name=decodeURIComponent(encodedName);}catch{}
  const inferred={ 'audio/mpeg':'mp3','audio/mp4':'m4a','audio/wav':'wav','audio/x-wav':'wav','audio/flac':'flac','audio/ogg':'ogg','audio/webm':'webm' }[type];
  name=safeName(name);if(!/\.[a-z\d]{2,5}$/i.test(name)&&inferred)name+=`.${inferred}`;
  return {file:new File(chunks,name,{type:type||'application/octet-stream'}),kind:link.kind};
}
