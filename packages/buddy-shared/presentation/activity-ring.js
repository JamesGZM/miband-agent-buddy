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
function source(counts, stale, theme, mode, breathLevel) {
  var total = count(counts, stale);
  if (total <= 1 || (mode !== 'thinking' && mode !== 'working' && mode !== 'attention')) return '';
  theme = theme === 'claude' || theme === 'deepseek' ? theme : 'chatgpt';
  var level = typeof breathLevel === 'number' && isFinite(breathLevel) ? Math.max(0, Math.min(31, Math.round(breathLevel))) : 0;
  var variant = mode === 'attention' ? 'attention' : 'active';
  return '/common/capsule/activity-' + theme + '-' + variant + '-' + Math.min(MAX_COLORS, total) + '-b' + level + '.png';
}
module.exports = {count: count, source: source, palettes: palettes, maxColors: MAX_COLORS};
