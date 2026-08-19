const u={mp3:"audio/mpeg",m4a:"audio/mp4",mp4:"audio/mp4",alac:"audio/mp4",flac:"audio/flac",wav:"audio/wav",aac:"audio/aac",ogg:"audio/ogg",oga:"audio/ogg",opus:"audio/opus",wma:"audio/x-ms-wma",aiff:"audio/aiff",aif:"audio/aiff"};new Set(Object.keys(u));function i(a){const o=document.getElementById(a);if(!o)throw new Error(`#${a} not found`);return o}function n(){const a=i("app");a.innerHTML=`
    <h1>DustyJukebox</h1>
    <p class="lead">Googleドライブの音源ライブラリを索引化する準備段階です。</p>
    <p class="status error">VITE_GOOGLE_CLIENT_ID が未設定です。.env に設定してください。</p>
  `}function e(){n()}e();
