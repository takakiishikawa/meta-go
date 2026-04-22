export function DarkModeInit() {
  const script = `(function(){
    var TZ='Asia/Ho_Chi_Minh';
    function vnParts(){
      var p={};
      new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'numeric',minute:'numeric',second:'numeric',hour12:false})
        .formatToParts(new Date())
        .forEach(function(x){p[x.type]=parseInt(x.value)||0;});
      return p;
    }
    function isDarkNow(){var h=vnParts().hour;return h>=18||h<6;}
    function apply(){document.documentElement.classList.toggle('dark',isDarkNow());}
    function schedule(){
      var t=vnParts(),h=t.hour,m=t.minute,s=t.second;
      var nextH=(h<6)?6:(h<18)?18:6;
      var extraDay=(h>=18)?1:0;
      var msLeft=((nextH-h+24*extraDay)*3600-m*60-s)*1000+1000;
      setTimeout(function(){
        if((localStorage.getItem('theme')||'auto')==='auto'){apply();schedule();}
      },msLeft);
    }
    var stored=localStorage.getItem('theme');
    if(stored==='dark') document.documentElement.classList.add('dark');
    else if(stored==='light') document.documentElement.classList.remove('dark');
    else{apply();schedule();}
  })();`
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
