function bounded(value) { return typeof value === 'number' && isFinite(value) && value >= 0 && value <= 100; }
function fields(msg, stale) {
  function cap(m, unit, digits) { return m && !stale ? (m.usedBytes / unit).toFixed(digits) + '/' + Math.round(m.totalBytes / unit) : '—'; }
  return {cpuText:!stale && bounded(msg && msg.cpu)?Math.round(msg.cpu)+'%':'—',
    memoryText:!stale && msg && msg.memory?Math.round(msg.memory.percent)+'%':'—',
    diskText:!stale && msg && msg.disk?Math.round(msg.disk.percent)+'%':'—',
    memoryDetail:cap(msg && msg.memory,Math.pow(1024,3),1),diskDetail:cap(msg && msg.disk,1000000000,0),
    cpuWidth:!stale && bounded(msg && msg.cpu)?msg.cpu:0,
    memoryWidth:!stale && msg && msg.memory?msg.memory.percent:0,
    diskWidth:!stale && msg && msg.disk?msg.disk.percent:0};
}
function activityLabel(counts,stale) {
  if(stale||!counts)return '';
  var total=0,names=['thinking','working','attention'];
  for(var i=0;i<names.length;i++){
    var value=counts[names[i]];
    if(typeof value!=='number'||!isFinite(value)||value%1!==0||value<0)return '';
    total+=value;
  }
  if(!total||total>128)return '';
  return total+' ACTIVE'+(counts.attention?' · '+counts.attention+' WAIT':'');
}
module.exports={fields:fields,activityLabel:activityLabel};
