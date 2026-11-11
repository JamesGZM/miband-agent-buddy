function probeDrawing(application) {
  var result={renderer:'native-geometry',queryAvailable:typeof application.canIUse==='function'};
  var queries={div:'div',arc:'progress',percent:'progress.attr.percent',radius:'progress.style.radius',position:'div.style.left',canvas:'canvas'};
  for(var key in queries){result[key]=null;if(result.queryAvailable)try{result[key]=application.canIUse(queries[key])===true;}catch(error){result[key]=null;}}
  return result;
}
module.exports={probeDrawing:probeDrawing};
