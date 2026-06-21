const questions = [
  { text: '恋人からのLINEの返信が遅いと、「嫌われたかも」と不安になる', dimension: 'anxiety' },
  { text: '恋人と毎日会うよりも、適度に「1人の時間」がないと息苦しく感じる', dimension: 'avoidance' },
  { text: 'パートナーが異性の友達と楽しそうにしていると、気になって仕方がない', dimension: 'anxiety' },
  { text: '弱みや悩みを恋人に見せるのは抵抗がある', dimension: 'avoidance' },
  { text: '「本当に好き？」と何度も確認したくなることがある', dimension: 'anxiety' },
  { text: '関係が深まるにつれて、少し距離を置きたくなることがある', dimension: 'avoidance' },
  { text: '恋人と離れている時間が長いと、自分だけ取り残されている気がする', dimension: 'anxiety' },
  { text: '「結婚」「将来」といった話題が出ると、プレッシャーに感じる', dimension: 'avoidance' },
  { text: '些細なケンカのあと、「もう別れるかもしれない」と頭をよぎる', dimension: 'anxiety' },
  { text: '恋人に頼るよりも、自分のことは自分で解決したいと思う', dimension: 'avoidance' },
  { text: '相手の愛情が足りないと感じると、自分の価値まで否定されたように感じる', dimension: 'anxiety' },
  { text: '「好き」「愛してる」と言葉にするのは照れくさいし、あまり言わない', dimension: 'avoidance' },
];

const typeResults = {
  secure: {
    name: '安定型',
    character: 'ナチュラルパートナー',
    eng: 'Secure — Natural Partner',
    icon: '🌿',
    color: '#60d0a0',
    catchphrase: '信頼が、いちばんのラブレター。',
    pattern: 'あなたは恋愛において安定した関係を築ける人です。パートナーを信頼し、適切な距離感で向き合えます。自分の気持ちも相手の気持ちも大切にでき、素直に愛情を表現できるのが最大の魅力です。',
    strengths: [
      '素直に愛情を表現でき、パートナーも安心できる',
      'ケンカしても感情的にならず、建設的に話し合える',
      '相手の自立も自分の自立も尊重できるバランス感覚',
    ],
    warnings: [
      '不安型・回避型のパートナーの行動に振り回される可能性がある',
      '「自分は大丈夫」と思い込み、関係の問題を見逃しがち',
      '安定しすぎてマンネリ化に気づきにくいことも',
    ],
    advice: 'あなたの安定感は素晴らしい強みです。ただし、パートナーが不安型や回避型の場合、相手の「クセ」を理解した上で接すると、より深い関係を築けます。相手の愛着スタイルにも興味を持ってみましょう。',
    compatibility: 'どのタイプとも比較的うまくやれますが、安定型同士が最も安定した関係になります。不安型のパートナーには安心感を、回避型のパートナーには適度な距離感を提供できるでしょう。',
  },
  anxious: {
    name: '不安型',
    character: 'ラブシーカー',
    eng: 'Anxious — Love Seeker',
    icon: '🔥',
    color: '#f0a060',
    catchphrase: '愛されたい、だから全力で愛す。',
    pattern: 'あなたは恋愛に情熱的で、パートナーとの繋がりを強く求めるタイプです。相手の些細な言動にも敏感に反応し、「本当に愛されているか」を確認したくなる傾向があります。その情熱は、深い愛情の裏返しです。',
    strengths: [
      '愛情深く、パートナーに惜しみなく尽くせる',
      '関係に全力で向き合う情熱とコミット力がある',
      '相手の気持ちの変化に敏感で、察する力が高い',
    ],
    warnings: [
      'LINEの既読スルーや返信の遅さに過敏に反応しがち',
      '嫉妬や束縛が関係を苦しくしてしまうリスクがある',
      '回避型のパートナーを追いかけてしまう「追い-逃げパターン」に注意',
    ],
    advice: '不安を感じたとき、すぐにパートナーに確認するのではなく、一度立ち止まって「この不安は事実に基づいているか？」と自問してみましょう。感情と事実を分けることで、より冷静に関係を見つめられるようになります。',
    compatibility: '安定型のパートナーとの相性が最も良好です。安心感を与えてくれる存在が、あなたの不安を和らげます。回避型とは「追い-逃げ」の悪循環に陥りやすいので注意が必要です。',
  },
  avoidant: {
    name: '回避型',
    character: 'シングルウルフ',
    eng: 'Avoidant — Single Wolf',
    icon: '🏔️',
    color: '#60a0d0',
    catchphrase: '愛してる、でも近すぎないで。',
    pattern: 'あなたは自立心が強く、親密になりすぎることに居心地の悪さを感じるタイプです。「1人の時間」がないとストレスが溜まり、感情を表に出すのが苦手な傾向があります。それは弱さではなく、自分を守る方法なのです。',
    strengths: [
      '冷静で客観的な判断ができ、関係のバランサーになれる',
      '自立しているので、共依存の関係にはなりにくい',
      '相手に過度な期待をしないため、プレッシャーを与えにくい',
    ],
    warnings: [
      '「冷たい」「本気じゃない」と誤解されやすい',
      '本当は愛情があっても、表現しないことで伝わらないことがある',
      '問題が起きたとき、向き合わずに距離を取って逃げてしまうパターンに注意',
    ],
    advice: '感情を言葉にするのが苦手でも、小さな行動で愛情を示すことはできます。「ありがとう」「一緒にいて楽しい」といったシンプルな言葉から始めてみましょう。完璧に表現する必要はありません。',
    compatibility: '安定型のパートナーがあなたに合っています。あなたの距離感を尊重しつつ、安心できる関係を提供してくれます。不安型のパートナーとは、相手の求める親密さとあなたの必要な距離感がぶつかりやすい傾向があります。',
  },
  fearful: {
    name: '恐れ回避型',
    character: 'ムーンウォーカー',
    eng: 'Fearful-Avoidant — Moon Walker',
    icon: '🌊',
    color: '#d080c0',
    catchphrase: '近づきたい、でも怖い。その葛藤が、あなたの深さ。',
    pattern: 'あなたは「親密になりたい」と「傷つくのが怖い」の間で揺れ動くタイプです。相手に近づくと急に距離を取りたくなったり、離れると寂しくなったり。その矛盾は苦しいかもしれませんが、それだけ深い感受性を持っている証でもあります。',
    strengths: [
      '深い感受性を持ち、相手の痛みに強く共感できる',
      '内省的で、自分と向き合う力がある',
      '一度信頼した相手には、とても深い愛情を注げる',
    ],
    warnings: [
      '「ホットコールド」な態度がパートナーを混乱させることがある',
      '自分でも自分の気持ちがわからなくなることがある',
      '過去の経験が現在の関係に影を落としている可能性がある',
    ],
    advice: '「近づきたいけど怖い」と感じたとき、その感情を否定せずに受け止めてみてください。そして、信頼できる人に少しずつ自分の気持ちを話す練習をしましょう。安全な関係の中で、少しずつ「怖くない」という経験を積み重ねることが大切です。',
    compatibility: '安定型のパートナーの存在が最も助けになります。一貫した愛情と安心感が、あなたの「怖い」を和らげてくれます。もし深い悩みがある場合は、専門家（カウンセラー）に相談することも検討してみてください。',
  },
};

let currentQuestion = 0;
let answers = new Array(12).fill(3);

const showScreen = (screenId) => {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  window.scrollTo(0, 0);
};

const renderQuestion = () => {
  const q = questions[currentQuestion];
  document.getElementById('question-text').textContent = q.text;
  document.getElementById('progress-fill').style.width = `${((currentQuestion + 1) / 12) * 100}%`;
  document.getElementById('progress-text').textContent = `${currentQuestion + 1} / 12`;
  const slider = document.getElementById('answer-slider');
  slider.value = answers[currentQuestion];
  document.getElementById('btn-prev').disabled = currentQuestion === 0;
};

const calculateResult = () => {
  const anxietyScores = [];
  const avoidanceScores = [];
  questions.forEach((q, i) => {
    if (q.dimension === 'anxiety') anxietyScores.push(answers[i]);
    else avoidanceScores.push(answers[i]);
  });
  const anxietyScore = anxietyScores.reduce((a, b) => a + b, 0) / anxietyScores.length;
  const avoidanceScore = avoidanceScores.reduce((a, b) => a + b, 0) / avoidanceScores.length;

  let type;
  if (anxietyScore <= 3.0 && avoidanceScore <= 3.0) type = 'secure';
  else if (anxietyScore > 3.0 && avoidanceScore <= 3.0) type = 'anxious';
  else if (anxietyScore <= 3.0 && avoidanceScore > 3.0) type = 'avoidant';
  else type = 'fearful';

  return { type, anxietyScore, avoidanceScore };
};

const showResult = () => {
  const { type, anxietyScore, avoidanceScore } = calculateResult();
  const data = typeResults[type];

  document.getElementById('result-icon').textContent = data.icon;
  document.getElementById('result-type-name').textContent = data.name;
  document.getElementById('result-type-name').style.color = data.color;
  document.getElementById('result-type-eng').textContent = `${data.character}  —  ${data.eng}`;
  document.getElementById('result-catchphrase').textContent = data.catchphrase;
  document.getElementById('result-pattern').textContent = data.pattern;

  const anxietyBar = document.getElementById('anxiety-bar');
  const avoidanceBar = document.getElementById('avoidance-bar');
  anxietyBar.style.width = '0%';
  avoidanceBar.style.width = '0%';
  document.getElementById('anxiety-value').textContent = anxietyScore.toFixed(1);
  document.getElementById('avoidance-value').textContent = avoidanceScore.toFixed(1);

  setTimeout(() => {
    anxietyBar.style.width = `${(anxietyScore / 5) * 100}%`;
    avoidanceBar.style.width = `${(avoidanceScore / 5) * 100}%`;
  }, 100);

  const strengthsList = document.getElementById('result-strengths');
  strengthsList.innerHTML = data.strengths.map(s => `<li>${s}</li>`).join('');

  const warningsList = document.getElementById('result-warnings');
  warningsList.innerHTML = data.warnings.map(w => `<li>${w}</li>`).join('');

  document.getElementById('result-advice').textContent = data.advice;
  document.getElementById('result-compatibility').textContent = data.compatibility;

  showScreen('screen-result');
};

const generateShareImage = async () => {
  const { type, anxietyScore, avoidanceScore } = calculateResult();
  const data = typeResults[type];
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);

  ctx.font = '80px serif';
  ctx.textAlign = 'center';
  ctx.fillText(data.icon, 600, 120);

  ctx.fillStyle = data.color;
  ctx.font = 'bold 48px sans-serif';
  ctx.fillText(data.name, 600, 200);

  ctx.fillStyle = '#ffffff';
  ctx.font = '20px sans-serif';
  ctx.fillText(data.eng, 600, 240);

  ctx.font = '28px sans-serif';
  ctx.fillStyle = '#e0e0e0';
  ctx.fillText(data.catchphrase, 600, 300);

  ctx.textAlign = 'left';
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('不安スコア', 200, 380);
  ctx.fillStyle = '#333333';
  ctx.fillRect(200, 390, 800, 30);
  ctx.fillStyle = '#f0a060';
  ctx.fillRect(200, 390, (anxietyScore / 5) * 800, 30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(anxietyScore.toFixed(1), 1020, 415);

  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('回避スコア', 200, 460);
  ctx.fillStyle = '#333333';
  ctx.fillRect(200, 470, 800, 30);
  ctx.fillStyle = '#60a0d0';
  ctx.fillRect(200, 470, (avoidanceScore / 5) * 800, 30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(avoidanceScore.toFixed(1), 1020, 495);

  ctx.textAlign = 'center';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('LoveLab — 恋愛アタッチメント診断', 600, 580);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
};

const getShareText = () => {
  const { type } = calculateResult();
  const data = typeResults[type];
  return `私の恋愛スタイルは「${data.character}」でした！\n\n${data.catchphrase}\n\n恋愛の"クセ"を心理学で読み解く 💕\n#LoveLab #恋愛診断 #アタッチメントスタイル`;
};

document.addEventListener('DOMContentLoaded', () => {
  const slider = document.getElementById('answer-slider');

  document.getElementById('btn-start').addEventListener('click', () => {
    showScreen('screen-questions');
    renderQuestion();
  });

  document.getElementById('btn-next').addEventListener('click', () => {
    answers[currentQuestion] = parseInt(slider.value);
    if (currentQuestion < 11) {
      currentQuestion++;
      renderQuestion();
    } else {
      showScreen('screen-analyzing');
      setTimeout(showResult, 2500);
    }
  });

  document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentQuestion > 0) {
      answers[currentQuestion] = parseInt(slider.value);
      currentQuestion--;
      renderQuestion();
    }
  });

  document.getElementById('btn-share-x').addEventListener('click', () => {
    const text = encodeURIComponent(getShareText());
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  });

  document.getElementById('btn-share-line').addEventListener('click', () => {
    const text = encodeURIComponent(getShareText());
    window.open(`https://social-plugins.line.me/lineit/share?text=${text}`, '_blank');
  });

  document.getElementById('btn-download').addEventListener('click', async () => {
    const blob = await generateShareImage();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lovelab-result.png';
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-retry').addEventListener('click', () => {
    answers = new Array(12).fill(3);
    currentQuestion = 0;
    showScreen('screen-landing');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
});
