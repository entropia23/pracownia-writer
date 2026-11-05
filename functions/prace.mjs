import { getStore } from "@netlify/blobs";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
export const CHUNK=1000000, MAX=10000000;
const hash=x=>createHash("sha256").update(x).digest("hex");
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const answer=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export function validate(d) {
 if(!d||typeof d!=="object")fail("Nieprawidłowe dane.");
 const text=(key,max,required=false)=>{
  if(typeof d[key]!=="string"||d[key].length>max||(required&&!d[key].trim()))fail("Sprawdź pole: "+key);
  return d[key].trim();
 };
 const result={first:text("first",40,true),last:text("last",4),class:text("class",20,true),school:text("school",20,true),message:text("message",2000)};
 if(!["SP-ZNP","SP-G","LO-G"].includes(result.school))fail("Wybierz szkołę.");
 if(!Array.isArray(d.files)||d.files.length<1||d.files.length>4)fail("Dodaj od 1 do 4 plików.");
 result.files=d.files.map(f=>{
  if(!f||typeof f.name!=="string"||f.name.length>180||/[\\/\x00-\x1f]/.test(f.name)||!Number.isSafeInteger(f.size)||f.size<1)fail("Nieprawidłowy plik.");
  return {name:f.name,size:f.size};
 });
 if(result.files.reduce((s,f)=>s+f.size,0)>MAX)fail("Łączny limit wynosi 10 MB.");
 return result;
}
export function handler(getStoreImpl=getStore,accessCode=()=>process.env.CLASS_UPLOAD_CODE) {
 return async req=>{
 try {
  const u=new URL(req.url);
  if(req.method==="GET")return answer({available:Boolean(accessCode() && accessCode().length>=12),maxFiles:4,maxBytes:MAX});
  if(req.method!=="POST")return answer({error:"Niedozwolona metoda."},405);
  if(req.headers.get("origin")!==u.origin) return answer({error:"Otwórz formularz bezpośrednio na stronie."},403);
  const secret=accessCode();
  if(!secret||secret.length<12)return answer({error:"Wysyłanie nie jest jeszcze skonfigurowane."},503);
  const store=getStoreImpl({name:"prace-uczniow",consistency:"strong"});
  const step=u.searchParams.get("step");
  if(step==="start") {
   const raw=await req.text(); if(raw.length>12000)fail("Za dużo danych.",413);
   const d=JSON.parse(raw);
   if(d.website||typeof d.code!=="string"||d.code.length>200||!timingSafeEqual(Buffer.from(hash(d.code)),Buffer.from(hash(secret))))fail("Nieprawidłowy kod od nauczyciela.",403);
   const data=validate(d),token=randomBytes(32).toString("hex"),id=hash(token),created=Date.now();
   await store.setJSON("sessions/"+id,{...data,created,receipt:new Date(created).toISOString().slice(0,10)+"-"+id.slice(0,12)});
   return answer({token,chunkSize:CHUNK});
  }
  const token=(req.headers.get("authorization")||"").replace(/^Bearer /,"");
  if(!/^[a-f0-9]{64}$/.test(token))fail("Brak sesji.",401);
  const id=hash(token),session=await store.get("sessions/"+id,{type:"json"});
  if(!session||Date.now()-session.created>3600000)fail("Sesja wygasła. Wyślij formularz ponownie.",410);
  if(step==="chunk") {
   if(session.done)fail("Zgłoszenie już zapisano.",409);
   const i=Number(u.searchParams.get("file")),part=Number(u.searchParams.get("part")),f=session.files[i];
   if(!Number.isInteger(i)||!f||!Number.isInteger(part)||part<0||part>=Math.ceil(f.size/CHUNK))fail("Nieprawidłowy fragment.");
   const bytes=await req.arrayBuffer(),expected=Math.min(CHUNK,f.size-part*CHUNK);
   if(bytes.byteLength!==expected)fail("Nieprawidłowy rozmiar fragmentu.",413);
   const key="chunks/"+id+"/"+i+"/"+part;
   const write=await store.set(key,bytes,{onlyIfNew:true});
   if(!write.modified) {
    const old=await store.get(key,{type:"arrayBuffer"});
    if(hash(Buffer.from(old))!==hash(Buffer.from(bytes)))fail("Fragment już istnieje i ma inną zawartość.",409);
   }
   return answer({ok:true});
  }
  if(step==="finish") {
   if(session.done)return answer({ok:true,receipt:session.receipt});
   // Pliki nie mają publicznego adresu. Odczyt wyłącznie w panelu Netlify.
   for(let i=0;i<session.files.length;i++){
    const f=session.files[i],parts=[];
    for(let p=0;p<Math.ceil(f.size/CHUNK);p++){
     const chunk=await store.get("chunks/"+id+"/"+i+"/"+p,{type:"arrayBuffer"});
     if(!chunk||chunk.byteLength!==Math.min(CHUNK,f.size-p*CHUNK))fail("Brakuje części pliku. Ponów wysyłkę.");
     parts.push(Buffer.from(chunk));
    }
    const file=Buffer.concat(parts);
    await store.set("received/"+session.receipt+"/"+(i+1)+"-"+f.name,file,{onlyIfNew:true});
   }
   await store.setJSON("received/"+session.receipt+"/zgloszenie.json",{...session,done:true},{onlyIfNew:true});
   await store.setJSON("sessions/"+id,{...session,done:true});
   return answer({ok:true,receipt:session.receipt});
  }
  return answer({error:"Nieznana operacja."},400);
 }catch(e){return answer({error:e.status?e.message:"Nie udało się zapisać plików. Zachowaj je i spróbuj ponownie."},e.status||500);}
 };
}
export default handler();
export const config={path:"/api/prace",rateLimit:{windowLimit:300,windowSize:60,aggregateBy:["ip","domain"]}};
