import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {statfs} from 'node:fs/promises';
import {cpuTotals,cpuUsage} from './cpu.mjs';
const exec=promisify(execFile);

export function memoryFromVm(text,totalBytes) {
  const pageSize=Number(text.match(/page size of (\d+) bytes/)?.[1]);
  const fields=['Anonymous pages','Pages wired down','Pages occupied by compressor'];
  const counts=fields.map(name=>Number(text.match(new RegExp(`^${name}:\\s+(\\d+)\\.`, 'm'))?.[1]));
  const usedBytes=counts.reduce((a,b)=>a+b,0)*pageSize;
  if(!Number.isSafeInteger(usedBytes)||pageSize<=0||totalBytes<=0||usedBytes<0||usedBytes>totalBytes) throw new Error('Invalid VM counters');
  return {usedBytes,totalBytes,percent:usedBytes/totalBytes*100};
}
export function diskFromFs(fs) {
  const totalBytes=Number(fs.blocks)*Number(fs.bsize),usedBytes=Number(fs.blocks-fs.bfree)*Number(fs.bsize);
  if(!Number.isFinite(totalBytes)||totalBytes<=0||usedBytes<0||usedBytes>totalBytes)throw new Error('Invalid disk counters');
  return {usedBytes,totalBytes,percent:usedBytes/totalBytes*100};
}
export function createSampler() {
  let previous=null;
  return async()=>{
    const current=cpuTotals(),cpu=previous?cpuUsage(previous,current):null;previous=current;
    const values=await Promise.allSettled([
      process.platform==='darwin'?exec('/usr/bin/vm_stat',[],{timeout:1500,maxBuffer:65536,env:{...process.env,LC_ALL:'C'}}).then(r=>memoryFromVm(r.stdout,os.totalmem())):Promise.reject(new Error('macOS required')),
      statfs(process.platform==='darwin'?'/System/Volumes/Data':'/').then(diskFromFs)
    ]);
    return {sampledAt:Date.now(),cpu:cpu===-1?null:cpu,memory:values[0].status==='fulfilled'?values[0].value:null,disk:values[1].status==='fulfilled'?values[1].value:null};
  };
}
