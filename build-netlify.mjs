import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const files=["formularz.html","index.html","kontakt-github.html","portal/index.html","portal/logowanie-testy-wzor.html","portal/materials_lo1.html","portal/materials_lo2.html","portal/materials_lo3.html","portal/materials_sp1-3.html","portal/materials_sp4.html","portal/materials_sp5.html","portal/materials_sp6.html","portal/materials_sp7.html","portal/materials_sp8.html","portal/school.css","test-internet-klasa4.html","test-ip-binarny.html","test-systemy-sieci.html"];
for(const file of files){
 const dest=file==='index.html'?'writer.html':file;
 let source=await readFile(file,'utf8');
 if(file.endsWith('.html')) source=source.replaceAll('https://entropia23.github.io/pracownia-writer/','/').replaceAll('href="https://szkolylodz.wordpress.com/"','href="/portal/index.html"');
 await mkdir(path.dirname('site/'+dest),{recursive:true});await writeFile('site/'+dest,source);
}
await writeFile('site/index.html','<!doctype html><html lang="pl"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/portal/index.html"><title>Informatyka</title><a href="/portal/index.html">Otwórz serwis Informatyka</a></html>');
console.log('Prepared school portal and preserved Writer page at /writer.html');
