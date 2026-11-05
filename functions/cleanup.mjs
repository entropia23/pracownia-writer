import { getStore } from "@netlify/blobs";
// Usuwa wyłącznie tymczasowe fragmenty i sesje starsze niż 24 h.
// Odebrane prace w received/ pozostają do dyspozycji nauczyciela.
export default async () => {
 const s=getStore({name:"prace-uczniow",consistency:"strong"});
 let count=0;
 for await(const page of s.list({prefix:"sessions/",paginate:true})){
  for(const blob of page.blobs){
   const v=await s.get(blob.key,{type:"json"});
   if(!v||Date.now()-v.created<86400000)continue;
   const id=blob.key.slice("sessions/".length);
   for(let i=0;i<v.files.length;i++)for(let p=0;p<Math.ceil(v.files[i].size/1000000);p++)await s.delete("chunks/"+id+"/"+i+"/"+p);
   await s.delete(blob.key);count++;
   if(count>=100)return new Response("Temporary uploads cleaned");
  }
 }
 return new Response("Temporary uploads cleaned");
};
export const config={schedule:"0 3 * * *"};
