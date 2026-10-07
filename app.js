// UI: 입력 폼, 사다리 그리기/애니메이션, 당첨 놀리기 화면
(function () {
  const G = window.LadderGame;

  const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00',
    '#0c8599', '#d6336c', '#5c940d', '#4263eb', '#862e9c'];
  const COMPLEXITY_LABELS = { 1: '단순', 2: '쉬움', 3: '보통', 4: '복잡', 5: '지옥' };
  const TAUNTS = [
    'ㅋㅋㅋㅋㅋㅋㅋㅋ',
    '아아 말고 라떼로 부탁해요~ ☕',
    '지갑 열리는 소리 들린다 💸',
    '사다리는 거짓말을 안 해요 🪜',
    '다음엔 운이 좋을 거예요… 아마도?',
    '샷 추가도 되죠? 😏',
  ];
  const RAIN = ['ㅋ', 'ㅋㅋ', 'ㅋㅋㅋ', '☕', '😜', '🤪', '킹', '💸', '🫵'];
  const LADDER_DRAW_MS = 900;
  const PATH_SPEED = 0.9; // px/ms
  const PAD = 6;

  const colorOf = (start) => COLORS[start % COLORS.length];
  const $ = (id) => document.getElementById(id);
  const els = {
    setup: $('setup'), form: $('setup-form'), count: $('player-count'), nameList: $('name-list'),
    complexity: $('complexity'), complexityLabel: $('complexity-label'),
    winners: $('winner-count'), winnerHint: $('winner-hint'), error: $('error'),
    game: $('game'), board: $('board'), canvas: $('ladder-canvas'),
    topLabels: $('top-labels'), bottomLabels: $('bottom-labels'),
    start: $('start-btn'), skip: $('skip-btn'), again: $('again-btn'), reset: $('reset-btn'),
    resultList: $('result-list'),
    tease: $('tease'), teaseNames: $('tease-names'), teaseTaunt: $('tease-taunt'),
    teaseClose: $('tease-close'),
  };
  const ctx = els.canvas.getContext('2d');

  let input = null;  // 마지막으로 시작한 입력값 (다시 하기용)
  let game = null;
  let geo = null;    // { width, height, colX(i), rowY(r), paths: [{ pts, len }] }
  let view = null;   // { ladder: 0~1, done, current, t }
  let running = false;
  let skipping = false;
  let tauntTimer = null;
  let round = 0;     // 새 게임마다 증가 – 이전 애니메이션이 새 게임에 끼어들지 않게

  // ---------- 입력 폼 ----------
  function renderNameInputs() {
    const count = Math.min(G.MAX_PLAYERS, Math.max(G.MIN_PLAYERS, Number(els.count.value) || 0));
    const prev = [...els.nameList.querySelectorAll('input')].map((i) => i.value);
    els.nameList.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const row = document.createElement('label');
      row.className = 'name-item';
      row.innerHTML = `<span>${i + 1}번</span>`;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.maxLength = G.MAX_NAME_LENGTH;
      inp.placeholder = i === 0 ? '예: 홍길동' : `${i + 1}번 이름`;
      inp.value = prev[i] || '';
      inp.enterKeyHint = i === count - 1 ? 'done' : 'next';
      inp.addEventListener('keydown', (e) => {
        const next = els.nameList.querySelectorAll('input')[i + 1];
        if (e.key === 'Enter' && !e.isComposing && next) {
          e.preventDefault();
          next.focus();
        }
      });
      row.appendChild(inp);
      els.nameList.appendChild(row);
    }
    updateWinnerLimit(count);
  }

  function updateWinnerLimit(count) {
    const min = G.MIN_WINNERS;
    const max = Math.max(min, count - 1);
    els.winners.min = String(min);
    els.winners.max = String(max);
    els.winnerHint.textContent = max === min ? `(${min}명)` : `(${min}~${max}명)`;
    const w = Number(els.winners.value);
    if (w > max) els.winners.value = String(max);
    if (w < min) els.winners.value = String(min);
  }

  function updateComplexityLabel() {
    const c = els.complexity.value;
    els.complexityLabel.textContent = `${c} · ${COMPLEXITY_LABELS[c]}`;
  }

  function readInput() {
    return {
      count: els.count.value,
      names: [...els.nameList.querySelectorAll('input')].map((i) => i.value),
      complexity: els.complexity.value,
      winners: els.winners.value,
    };
  }

  function showError(msg) {
    els.error.textContent = msg || '';
    els.error.hidden = !msg;
  }

  // ---------- 사다리 보드 ----------
  function layout() {
    const count = game.ladder.count;
    const avail = els.board.parentElement.clientWidth;
    const width = Math.max(avail, count * 84);
    const height = Math.max(320, 60 + game.ladder.rows * 28);
    const dpr = window.devicePixelRatio || 1;
    els.board.style.width = width + 'px';
    els.canvas.style.width = width + 'px';
    els.canvas.style.height = height + 'px';
    els.canvas.width = Math.round(width * dpr);
    els.canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const span = height - PAD * 2;
    geo = {
      width,
      height,
      colX: (i) => ((i + 0.5) * width) / count,
      rowY: (r) => PAD + ((r + 1) * span) / (game.ladder.rows + 1),
    };
    geo.paths = game.results.map((r) => {
      const pts = r.points.map((p) => ({ x: geo.colX(p.col), y: geo.rowY(p.row) }));
      return { pts, len: pathLength(pts) };
    });
    [...els.topLabels.children].forEach((el, i) => { el.style.left = geo.colX(i) + 'px'; });
    [...els.bottomLabels.children].forEach((el, i) => { el.style.left = geo.colX(i) + 'px'; });
  }

  function pathLength(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
  }

  function drawPath(result, t) {
    const { pts, len } = geo.paths[result.start];
    let remain = len * t;
    ctx.strokeStyle = colorOf(result.start);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    let head = pts[0];
    for (let i = 1; i < pts.length && remain > 0; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      const k = Math.min(1, remain / seg);
      head = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      ctx.lineTo(head.x, head.y);
      remain -= seg;
    }
    ctx.stroke();
    if (t < 1) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    const { width, height, colX, rowY } = geo;
    const { rungs, count } = game.ladder;
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 위에서 아래로 내려오며 그려지는 사다리
    const yLimit = PAD + view.ladder * (height - PAD * 2);
    ctx.strokeStyle = '#a89282';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let c = 0; c < count; c++) {
      ctx.moveTo(colX(c), PAD);
      ctx.lineTo(colX(c), yLimit);
    }
    rungs.forEach((row, r) => {
      const y = rowY(r);
      if (y > yLimit) return;
      row.forEach((on, g) => {
        if (!on) return;
        ctx.moveTo(colX(g), y);
        ctx.lineTo(colX(g + 1), y);
      });
    });
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    for (let i = 0; i < view.done; i++) drawPath(game.results[i], 1);
    if (view.current !== null) drawPath(game.results[view.current], view.t);
    ctx.globalAlpha = 1;
  }

  function animate(duration, onFrame) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const my = round;
      function frame(now) {
        if (my !== round) { resolve(); return; }
        const t = skipping ? 1 : Math.min(1, (now - t0) / duration);
        onFrame(t);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function renderLabels() {
    els.topLabels.innerHTML = '';
    els.bottomLabels.innerHTML = '';
    game.results.forEach((r) => {
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = r.name;
      tag.title = r.name;
      tag.style.background = colorOf(r.start);
      els.topLabels.appendChild(tag);
    });
    game.prizes.forEach(() => {
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.textContent = '?';
      els.bottomLabels.appendChild(tag);
    });
  }

  function revealPrize(result) {
    const tag = els.bottomLabels.children[result.end];
    tag.textContent = result.win ? '☕ 당첨' : '통과 😎';
    tag.classList.add('revealed', result.win ? 'win' : 'pass', 'hit');
    tag.style.setProperty('--hit-color', colorOf(result.start));
  }

  function setButtons(phase) {
    els.start.hidden = phase !== 'ready';
    els.skip.hidden = phase !== 'running';
    els.again.hidden = phase !== 'done';
    els.start.disabled = phase !== 'ready';
  }

  async function newGame() {
    const my = ++round;
    game = G.play(input);
    view = { ladder: 0, done: 0, current: null, t: 0 };
    skipping = false;
    els.resultList.hidden = true;
    els.resultList.innerHTML = '';
    renderLabels();
    layout();
    setButtons('drawing');
    running = true;
    await animate(LADDER_DRAW_MS, (t) => { view.ladder = t; draw(); });
    if (my !== round) return;
    running = false;
    skipping = false;
    setButtons('ready');
  }

  async function runAll() {
    if (running) return;
    const my = round;
    running = true;
    setButtons('running');
    const tops = els.topLabels.children;
    for (const result of game.results) {
      tops[result.start].classList.add('active');
      view.current = result.start;
      const dur = Math.min(2200, Math.max(900, geo.paths[result.start].len / PATH_SPEED));
      await animate(dur, (t) => { view.t = t; draw(); });
      if (my !== round) return;
      view.done = result.start + 1;
      view.current = null;
      tops[result.start].classList.remove('active');
      revealPrize(result);
    }
    draw();
    running = false;
    skipping = false;
    setButtons('done');
    showResults();
    if (game.winners.length) setTimeout(() => { if (my === round) openTease(); }, 500);
  }

  function showResults() {
    els.resultList.innerHTML = '';
    for (const r of game.results) {
      const li = document.createElement('li');
      li.className = r.win ? 'win' : '';
      li.textContent = `${r.name} → ${r.win ? '☕ 커피 당첨!' : '통과 😎'}`;
      els.resultList.appendChild(li);
    }
    els.resultList.hidden = false;
  }

  // ---------- 킹 받쥬? ----------
  function openTease() {
    els.teaseNames.innerHTML = '';
    game.winners.forEach((name, i) => {
      const li = document.createElement('li');
      li.textContent = name;
      li.style.animationDelay = `${i * 0.15}s`;
      els.teaseNames.appendChild(li);
    });
    const rain = els.tease.querySelector('.tease-rain');
    rain.innerHTML = '';
    for (let i = 0; i < 32; i++) {
      const s = document.createElement('span');
      s.textContent = RAIN[Math.floor(Math.random() * RAIN.length)];
      s.style.left = `${Math.random() * 100}%`;
      s.style.fontSize = `${1 + Math.random() * 1.6}rem`;
      s.style.animationDuration = `${2.5 + Math.random() * 3}s`;
      s.style.animationDelay = `${-Math.random() * 5}s`;
      rain.appendChild(s);
    }
    let k = 0;
    els.teaseTaunt.textContent = TAUNTS[0];
    clearInterval(tauntTimer);
    tauntTimer = setInterval(() => {
      k = (k + 1) % TAUNTS.length;
      els.teaseTaunt.textContent = TAUNTS[k];
    }, 1400);
    els.tease.hidden = false;
    els.teaseClose.focus();
  }

  function closeTease() {
    clearInterval(tauntTimer);
    els.tease.hidden = true;
    els.tease.querySelector('.tease-rain').innerHTML = '';
  }

  // ---------- 이벤트 ----------
  els.form.addEventListener('input', () => showError(null));
  els.count.addEventListener('input', renderNameInputs);
  els.complexity.addEventListener('input', updateComplexityLabel);
  els.winners.addEventListener('change', () => updateWinnerLimit(els.nameList.children.length));

  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = readInput();
    const error = G.validateInput(data);
    showError(error);
    if (error) return;
    input = { names: data.names, complexity: Number(data.complexity), winners: Number(data.winners) };
    els.setup.hidden = true;
    els.game.hidden = false;
    newGame();
  });

  els.start.addEventListener('click', runAll);
  els.skip.addEventListener('click', () => { skipping = true; });
  els.again.addEventListener('click', () => { closeTease(); newGame(); });
  els.reset.addEventListener('click', () => {
    round++;
    running = false;
    skipping = false;
    closeTease();
    els.game.hidden = true;
    els.setup.hidden = false;
  });
  els.teaseClose.addEventListener('click', closeTease);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.tease.hidden) closeTease();
  });
  window.addEventListener('resize', () => {
    if (game && !els.game.hidden) { layout(); draw(); }
  });

  renderNameInputs();
  updateComplexityLabel();
})();
