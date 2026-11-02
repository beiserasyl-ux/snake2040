/* SNAKE 2040 — ойын логикасы */
(() => {
  'use strict';

  // ---------- Тұрақтылар ----------
  const N = 20, CS = 20;                       // 20x20 тор, әр ұяшық 20px
  const DIFF = {
    easy:   { name: 'Оңай',     base: 160 },   // base — бастапқы кідіріс (мс)
    normal: { name: 'Қалыпты',  base: 120 },
    hard:   { name: 'Қиын',     base: 85 }
  };
  const SKINS = { neon: ['#00e5ff', '#7c4dff'], pink: ['#ff4fd8', '#ffb300'], lime: ['#7cfc00', '#00bfa5'] };
  const V = { u: { x: 0, y: -1 }, d: { x: 0, y: 1 }, l: { x: -1, y: 0 }, r: { x: 1, y: 0 } };
  const DIR_NAME = { u: 'жоғары', d: 'төмен', l: 'солға', r: 'оңға' };
  // e.code қолданамыз: пернетақта қабаты (қазақша/орысша) әсер етпейді
  const KEYMAP = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const live = $('status');

  // ---------- LocalStorage (қатемен қорғалған) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* жазылмаса, ойын жалғасады */ }
    }
  };

  // ---------- Күй ----------
  let snake, dir, dname, queue, apple, score, level, state = 'idle', timer = null;
  let best = store.get('snake2040-best', 0);
  let diff = store.get('snake2040-diff', 'normal');
  let skin = store.get('snake2040-skin', 'neon');
  let sound = store.get('snake2040-sound', true);
  let particles = [];

  // ---------- NVDA хабарламасы: қайталануды болдырмау ----------
  let lastMsg = '', lastT = 0;
  function say(msg) {
    const now = Date.now();
    if (msg === lastMsg && now - lastT < 600) return;
    lastMsg = msg; lastT = now;
    live.textContent = '';                      // бірдей мәтін қайта оқылу үшін тазалаймыз
    setTimeout(() => { live.textContent = msg; }, 60);
  }

  // ---------- Дыбыс (Web Audio) ----------
  let actx = null;
  function beep(freq, dur = 0.1, type = 'sine', delay = 0) {
    if (!sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      const t0 = actx.currentTime + delay;
      g.gain.setValueAtTime(0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t0); o.stop(t0 + dur);
    } catch { /* дыбыс қолжетімсіз */ }
  }

  // ---------- UI жаңарту ----------
  function updateHud(bump) {
    $('score').textContent = score;
    $('best').textContent = Math.max(best, score);
    $('level').textContent = level + 1;
    $('diff-label').textContent = DIFF[diff].name;
    if (bump && !reduce) {
      const s = $('score'); s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump');
    }
  }
  function describe() {   // Canvas-қа мәтіндік балама (тек оқиғаларда жаңартылады)
    const stateText = { idle: 'Ойын басталмаған.', playing: 'Ойын жүріп жатыр.', paused: 'Ойын тоқтатылған.', over: 'Ойын аяқталды.' }[state];
    $('cv-desc').textContent = `${stateText} Жылан ұзындығы ${snake.length}, бағыты ${DIR_NAME[dname]}. ` +
      `Алма ${apple.y + 1}-қатар, ${apple.x + 1}-бағанда. Ұпай ${score}, деңгей ${level + 1}.`;
  }
  function showOverlay(title, text, btn, focusBtn) {
    $('ov-title').textContent = title; $('ov-text').textContent = text; $('btn-main').textContent = btn;
    $('overlay').hidden = false;
    if (focusBtn) $('btn-main').focus();
  }
  function lockSettings() {
    $('settings').disabled = state === 'playing';
    $('sel-diff').disabled = state === 'playing' || state === 'paused';
  }
  function renderRecords() {
    const list = store.get('snake2040-records', []);
    const ol = $('rec-list'); ol.innerHTML = '';
    if (!list.length) { const li = document.createElement('li'); li.textContent = 'Әзірге рекорд жоқ.'; ol.appendChild(li); return; }
    list.forEach(r => { const li = document.createElement('li'); li.textContent = `${r.s} ұпай — ${DIFF[r.d] ? DIFF[r.d].name : r.d}`; ol.appendChild(li); });
  }

  // ---------- Ойын логикасы ----------
  function delay() { return Math.max(45, DIFF[diff].base - level * 10); }

  function spawnApple() {
    const free = [];
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if (!snake.some(s => s.x === x && s.y === y)) free.push({ x, y });
    apple = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function start() {
    clearTimeout(timer);
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = V.r; dname = 'r'; queue = []; score = 0; level = 0; particles = [];
    document.body.style.setProperty('--hue', 200);
    spawnApple();
    state = 'playing';
    $('overlay').hidden = true; lockSettings(); updateHud(); describe();
    cv.focus();
    say('Ойын басталды!'); beep(520, 0.08); beep(780, 0.1, 'sine', 0.09);
    schedule();
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused'; clearTimeout(timer); lockSettings(); describe();
    showOverlay('Ойын тоқтатылды', 'Жалғастыру үшін Space басыңыз.', 'Жалғастыру', false);
    say('Ойын тоқтатылды');
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'playing'; $('overlay').hidden = true; lockSettings(); describe(); cv.focus();
    say('Ойын жалғастырылды'); schedule();
  }
  function toggle() {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
    else start();
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(() => { tick(); }, delay()); }

  function tick() {
    if (state !== 'playing') return;
    if (queue.length) { dname = queue.shift(); dir = V[dname]; }
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const eat = apple && head.x === apple.x && head.y === apple.y;
    const body = eat ? snake : snake.slice(0, -1);   // құйрық жылжиды, сондықтан оны есептемейміз
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || body.some(s => s.x === head.x && s.y === head.y)) {
      return gameOver();
    }
    snake.unshift(head);
    if (eat) {
      score++;
      burst(head.x, head.y, '#ff5fa2', 10, '+1');
      let msg = `Алма жедіңіз! ${score} ұпай.`;
      if (score % 5 === 0) {                          // әр 5 ұпай: деңгей, жылдамдық, эффект
        level++;
        document.body.style.setProperty('--hue', (200 + level * 47) % 360);
        burst(head.x, head.y, '#ffd23f', 28);
        msg += ' Жылдамдық артты!';
        beep(660, 0.1); beep(990, 0.15, 'triangle', 0.1);
      } else beep(660, 0.07, 'square');
      say(msg);
      spawnApple(); updateHud(true); describe();
      if (!apple) return gameOver(true);
    } else snake.pop();
    schedule();
  }

  function gameOver(win) {
    state = 'over'; clearTimeout(timer); lockSettings();
    const record = score > best && score > 0;
    if (record) { best = score; store.set('snake2040-best', best); }
    if (score > 0) {
      const list = store.get('snake2040-records', []);
      list.push({ s: score, d: diff });
      list.sort((a, b) => b.s - a.s);
      store.set('snake2040-records', list.slice(0, 5));
    }
    renderRecords(); updateHud(); describe();
    const msg = `Ойын аяқталды! Сіздің ұпайыңыз: ${score}.` + (record ? ' Жаңа рекорд орнатылды!' : '');
    say(msg);
    beep(220, 0.2, 'sawtooth'); beep(150, 0.3, 'sawtooth', 0.2);
    showOverlay(win ? 'Керемет! Алаң толды!' : 'Ойын аяқталды!',
      `Сіздің ұпайыңыз: ${score}.` + (record ? ' Жаңа рекорд!' : ` Рекорд: ${best}.`), 'Қайта ойнау', true);
  }

  // ---------- Бағыт беру ----------
  function setDir(d) {
    if (state !== 'playing') return;
    const last = queue.length ? queue[queue.length - 1] : dname;
    const opposite = { u: 'd', d: 'u', l: 'r', r: 'l' };
    if (d === last || d === opposite[last]) return;   // кері бұрылуға болмайды
    if (queue.length < 2) queue.push(d);
  }

  // ---------- Бөлшектер / эффектілер ----------
  function burst(gx, gy, color, n, text) {
    if (reduce) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2.5;
      particles.push({ x: gx * CS + CS / 2, y: gy * CS + CS / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 30, color });
    }
    if (text) particles.push({ x: gx * CS + CS / 2, y: gy * CS, vx: 0, vy: -0.8, life: 40, color: '#ffffff', text });
  }

  // ---------- Сызу ----------
  const hex = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function draw(t) {
    // Фон және тор
    const g = ctx.createLinearGradient(0, 0, 400, 400);
    g.addColorStop(0, '#1a1f55'); g.addColorStop(1, '#2b1760');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) if ((x + y) % 2 === 0) { rr(x * CS + 1, y * CS + 1, CS - 2, CS - 2, 5); ctx.fill(); }

    if (snake) {
      // Алма (жеңіл пульсация)
      if (apple) {
        const p = reduce ? 0 : Math.sin(t / 200) * 1.2, cx = apple.x * CS + CS / 2, cy = apple.y * CS + CS / 2 + 1, r = 7 + p;
        const ag = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, r);
        ag.addColorStop(0, '#ffb3cc'); ag.addColorStop(1, '#ff2d6f');
        ctx.shadowColor = '#ff2d6f'; ctx.shadowBlur = reduce ? 0 : 12;
        ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#4ae38a';
        ctx.beginPath(); ctx.ellipse(cx + 3, cy - r, 4, 2, -0.5, 0, 7); ctx.fill();
      }
      // Жылан денесі: құйрықтан басқа қарай
      const [c1, c2] = SKINS[skin], len = snake.length;
      ctx.shadowColor = c1; ctx.shadowBlur = reduce ? 0 : 10;
      for (let i = len - 1; i >= 0; i--) {
        const s = snake[i], pad = i === 0 ? 0.5 : 2;
        ctx.fillStyle = i === 0 ? '#ffffff' : mix(c1, c2, i / Math.max(1, len - 1));
        rr(s.x * CS + pad, s.y * CS + pad, CS - pad * 2, CS - pad * 2, 7); ctx.fill();
      }
      ctx.shadowBlur = 0;
      // Бас: көздер мен тіл
      const h = snake[0], cx = h.x * CS + CS / 2, cy = h.y * CS + CS / 2, px = -dir.y, py = dir.x;
      ctx.fillStyle = mix(c1, c2, 0.15); rr(h.x * CS + 2.5, h.y * CS + 2.5, CS - 5, CS - 5, 6); ctx.fill();
      [-1, 1].forEach(sd => {
        const ex = cx + dir.x * 3 + px * 4.5 * sd, ey = cy + dir.y * 3 + py * 4.5 * sd;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 3.3, 0, 7); ctx.fill();
        ctx.fillStyle = '#14163a'; ctx.beginPath(); ctx.arc(ex + dir.x, ey + dir.y, 1.6, 0, 7); ctx.fill();
      });
      if (state === 'playing' && !reduce && Math.floor(t / 300) % 2) {
        ctx.strokeStyle = '#ff2d6f'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(cx + dir.x * 9, cy + dir.y * 9); ctx.lineTo(cx + dir.x * 14, cy + dir.y * 14); ctx.stroke();
      }
    }
    // Бөлшектер және "+1" анимациясы
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.life--;
      ctx.globalAlpha = Math.min(1, p.life / 20);
      if (p.text) { ctx.fillStyle = p.color; ctx.font = 'bold 16px Verdana'; ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, p.y); }
      else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    requestAnimationFrame(draw);
  }

  // ---------- Пернетақта ----------
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'SELECT' || tag === 'INPUT') return;     // параметрлерді пернемен өзгерту үшін
    if (KEYMAP[e.code]) { e.preventDefault(); setDir(KEYMAP[e.code]); }
    else if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'KeyR') { e.preventDefault(); start(); }
    else if (e.code === 'Enter' && (tag === 'BODY' || tag === 'CANVAS')) { e.preventDefault(); toggle(); }
  });
  // Space батырмада "click" шақырмауы үшін
  document.addEventListener('keyup', e => { if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') e.preventDefault(); });

  // ---------- Батырмалар ----------
  $('btn-main').addEventListener('click', () => { if (state === 'paused') resume(); else start(); });
  $('btn-pause').addEventListener('click', () => { if (state === 'idle' || state === 'over') start(); else toggle(); });
  $('btn-restart').addEventListener('click', start);
  document.querySelectorAll('.dpad [data-dir]').forEach(b => b.addEventListener('click', () => setDir(b.dataset.dir)));

  // Свайп (телефон)
  let tx = 0, ty = 0;
  cv.addEventListener('touchstart', e => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  cv.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    setDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u'));
  }, { passive: true });

  // ---------- Параметрлер ----------
  $('sel-diff').value = diff; $('sel-skin').value = skin; $('chk-sound').checked = sound;
  $('sel-diff').addEventListener('change', e => { diff = e.target.value; store.set('snake2040-diff', diff); updateHud(); });
  $('sel-skin').addEventListener('change', e => { skin = e.target.value; store.set('snake2040-skin', skin); });
  $('chk-sound').addEventListener('change', e => { sound = e.target.checked; store.set('snake2040-sound', sound); });

  // ---------- Бастапқы күй ----------
  snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]; dir = V.r; dname = 'r'; queue = [];
  score = 0; level = 0; apple = { x: 14, y: 10 };
  updateHud(); renderRecords(); lockSettings(); describe();
  requestAnimationFrame(draw);
})();
