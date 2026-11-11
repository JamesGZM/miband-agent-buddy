// Each color represents one concurrent main session, not an AI provider.
var palettes = {
  chatgpt: ['#728BFF', '#65D9BC', '#EFB86C', '#C795E8', '#EE92A5', '#8CD8EE'],
  claude: ['#EBA270', '#79CFC3', '#A6B7FA', '#D39BE0', '#EBD080', '#F09CAA'],
  deepseek: ['#4D6BFE', '#64D6BE', '#E9B67D', '#BD9AE8', '#E992B1', '#8ACDEB']
};
var MAX_COLORS = 6;
function count(counts, stale) {
  if (stale || !counts) return 0;
  var total = 0, names = ['thinking', 'working', 'attention'];
  for (var i = 0; i < names.length; i++) {
    var value = counts[names[i]];
    if (typeof value !== 'number' || !isFinite(value) || value % 1 !== 0 || value < 0) return 0;
    total += value;
  }
  return total > 128 ? 0 : total;
}
// Host-side display compilation. The band consumes these colors, not AI sessions.
function colors(theme,mode,counts) {
  theme=theme==='claude'||theme==='deepseek'?theme:'chatgpt';
  var palette=palettes[theme]||palettes.chatgpt,color=palette[0];
  if(mode==='attention')color='#FFBD64';else if(mode==='complete')color='#77EDBD';else if(mode==='error')color='#FF7766';
  else if(mode==='offline')color=theme==='claude'?'#947F74':theme==='deepseek'?'#6C7A9C':'#7187B0';
  else if(mode==='sleep')color=theme==='claude'?'#C58768':theme==='deepseek'?'#3A52C4':color;
  var active=mode==='thinking'||mode==='working'||mode==='attention';
  var total=active?Math.max(1,Math.min(MAX_COLORS,count(counts,false))):1,result=[color];
  for(var i=1;i<total;i++)result.push(palette[i]);
  return result;
}
module.exports = {count: count, colors: colors, palettes: palettes, maxColors: MAX_COLORS};
