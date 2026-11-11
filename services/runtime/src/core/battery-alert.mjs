// One notification per low-battery cycle, retained through transport reconnects.
export function createBatteryAlert() {
  let low=false, sequence=0;
  return {
    observe(percent) {
      if(!Number.isInteger(percent)||percent<0||percent>100)return;
      if(percent<20){if(!low)sequence++;low=true;}
      else low=false;
    },
    reset(){low=false;},
    snapshot(){return {active:low,sequence};}
  };
}
