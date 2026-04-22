export function DarkModeInit() {
  const script = `(function(){
    function applyTheme(m){
      if(m==='dark') document.documentElement.classList.add('dark');
      else if(m==='light') document.documentElement.classList.remove('dark');
      else{
        var h=parseInt(new Date().toLocaleString('en-US',{timeZone:'Asia/Ho_Chi_Minh',hour:'numeric',hour12:false}));
        document.documentElement.classList.toggle('dark',h>=18||h<6);
      }
    }
    var t=localStorage.getItem('theme')||'auto';
    applyTheme(t);
    if(t==='auto') setInterval(function(){applyTheme('auto');},60000);
  })();`
  return <script dangerouslySetInnerHTML={{ __html: script }} />
}
