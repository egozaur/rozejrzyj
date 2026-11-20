/* Wspólny kod gry „Rozejrzyj się”: pula liter, normalizacja słów, połączenie ze wspólną bazą słów na serwerze PL3Y
   (z kolejką offline), tryb lokalny ?local=1 (ta sama klasa RzWords w przeglądarce) i dźwięk (WebAudio, bez plików). */
(function () {
  const API = 'https://pl3y-server.pl3y.workers.dev';

// Token sesji PL3Y: wydaje go serwer po podaniu hasła w bramce (/auth.js), tu tylko go odczytujemy.
// Do zapytań HTTP idzie nagłówkiem Authorization, do WebSocketu parametrem ?tok= (przeglądarka nie ustawi nagłówka).
const plToken = () => { try { const t = localStorage.getItem('pl3y_token'); return t && Number(localStorage.getItem('pl3y_token_exp')) > Date.now() ? t : ''; } catch (e) { return ''; } };
const authHead = (h = {}) => { const t = plToken(); return t ? { ...h, Authorization: 'Bearer ' + t } : h; };
const wsTok = () => { const t = plToken(); return t ? '?tok=' + encodeURIComponent(t) : ''; };
// Serwer odrzucił sesję (401): pokaż bramkę hasła.
const onAuthFail = r => { if (r.status === 401 && window.PL3Y && window.PL3Y.expired) window.PL3Y.expired(); };
  const LOCAL = new URLSearchParams(location.search).has('local');
  const APP = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // Ta sama pula co na serwerze (worker/src/rozejrzyj/words.js). Bez Ą Ę Ń Ó Ź Ć Q V X Y.
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'Ł', 'M', 'N', 'O', 'P', 'R', 'S', 'Ś', 'T', 'U', 'W', 'Z', 'Ż'];
  const MAX_LEN = 40;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pl');
  const lower = L => L.toLocaleLowerCase('pl');
  const rand = n => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % n; };
  function shuffle(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ---------- tryb lokalny: prawdziwa klasa RzWords z pamięcią w localStorage ----------
  let localDO = null;
  async function local() {
    if (localDO) return localDO;
    const { RzWords } = await import('/mafia/worker/src/rozejrzyj/words.js');
    const KEY = 'rz_local_db';
    const load = () => new Map(Object.entries(store.get(KEY, {})));
    const save = m => store.set(KEY, Object.fromEntries(m));
    const storage = {
      get: async k => { const v = load().get(k); return v === undefined ? undefined : structuredClone(v); },
      put: async (k, v) => { const m = load(); m.set(k, structuredClone(v)); save(m); },
      list: async ({ prefix = '' } = {}) => new Map([...load()].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1))),
    };
    localDO = new RzWords({ storage }, {});
    return localDO;
  }

  async function api(method, path, body) {
    if (LOCAL) {
      const d = await local();
      const res = await d.fetch(new Request('https://words' + path.replace(/^\/api\/rz/, ''), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
    try {
      const r = await fetch(API + path, { method, signal: ctl.signal, headers: authHead(body !== undefined ? { 'Content-Type': 'application/json' } : {}), body: body !== undefined ? JSON.stringify(body) : undefined });
      onAuthFail(r);
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // ---------- zapis rund z kolejką offline ----------
  const QKEY = LOCAL ? 'rz_queue_local' : 'rz_queue';
  let flushing = null;
  async function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      let q = store.get(QKEY, []);
      while (q.length) {
        try { await api('POST', '/api/rz/rounds', q[0]); }
        catch (e) { if (!(e.status >= 400 && e.status < 500) || e.status === 401 || e.status === 429) break; }   // 4xx = zła runda, nie ponawiamy; 401 (sesja) i 429 (tempo) zostają w kolejce
        q = store.get(QKEY, []).slice(1);
        store.set(QKEY, q);
      }
      return q.length;
    })();
    try { return await flushing; } finally { flushing = null; }
  }
  function saveRound(letter, words) {
    store.set(QKEY, [...store.get(QKEY, []), { letter, words }]);
    return flush();
  }
  const pending = () => store.get(QKEY, []).length;

  // ---------- słownik: lista rzeczowników + słowa przyjęte w grach (z serwera, pamiętane lokalnie) ----------
  const LKEY = LOCAL ? 'rz_learned_local' : 'rz_learned';
  let learned = new Set(store.get(LKEY, []));
  const nouns = () => window.RZ_NOUNS instanceof Set ? window.RZ_NOUNS : new Set();
  const known = w => nouns().has(w) || learned.has(w);
  function setLearned(list) { learned = new Set(list || []); store.set(LKEY, [...learned]); }
  function learn(words) { for (const w of words) learned.add(w); store.set(LKEY, [...learned]); }

  const stats = () => api('GET', '/api/rz/stats').then(s => { setLearned(s.learned); return s; });
  const exportAll = () => api('GET', '/api/rz/export');
  const merge = (from, to) => api('PUT', '/api/rz/alias', { from, to });
  const unmerge = w => api('DELETE', '/api/rz/alias/' + encodeURIComponent(w));

  // ---------- dźwięk ----------
  const Snd = (() => {
    let ctx = null, out = null;
    const st = { on: true };
    Object.assign(st, store.get('rz_snd', {}));
    function init() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      try { ctx = new AC(); } catch (e) { return false; }
      const comp = ctx.createDynamicsCompressor(); comp.connect(ctx.destination);
      out = ctx.createGain(); out.gain.value = .8; out.connect(comp);
      return true;
    }
    function tone(f, t0, dur, type, vol, f2) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine';
      o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
      g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + .01); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + .05);
    }
    // Dzwonek: podstawa + alikwoty, jak uderzenie w szklankę.
    function bell(f, t0, vol, dur = 1.2) { tone(f, t0, dur, 'sine', vol); tone(f * 2.76, t0, dur * .5, 'sine', vol * .35); tone(f * 5.4, t0, dur * .25, 'sine', vol * .12); }
    const play = fn => { if (!st.on || !init()) return; try { fn(ctx.currentTime); } catch (e) {} };
    return {
      get on() { return st.on; },
      toggle() { st.on = !st.on; store.set('rz_snd', st); if (st.on) init(); return st.on; },
      unlock() { if (st.on) init(); },
      click: () => play(t => tone(1800, t, .03, 'square', .04)),
      drum: () => play(t => { tone(900, t, .04, 'triangle', .12); tone(2200, t, .02, 'square', .03); }),
      reveal: () => play(t => { bell(523.25, t, .22); bell(783.99, t + .09, .18); bell(1046.5, t + .18, .14, 1.6); }),
      accept: () => play(t => { bell(880, t, .14, .6); bell(1318.5, t + .06, .08, .5); }),
      warn: () => play(t => { bell(659.25, t, .12, .5); bell(622.25, t + .1, .09, .5); }),
      error: () => play(t => { tone(180, t, .16, 'sawtooth', .08, 140); tone(185, t + .03, .14, 'square', .03, 150); }),
      tick: last => play(t => tone(last ? 1400 : 1100, t, .07, 'square', .07)),
      out: () => play(t => { tone(392, t, .35, 'triangle', .2, 330); tone(311, t + .22, .6, 'triangle', .2, 196); }),
      veto: () => play(t => { tone(220, t, .5, 'sawtooth', .07, 110); tone(110, t, .5, 'sine', .25, 70); }),
      win: () => play(t => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, t + i * .13, .18, 1.8)); }),
      fanfare: () => play(t => { [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, t + i * .11, .17, 2)); }),
    };
  })();

  window.RZ = { API, LOCAL, APP, LETTERS, MAX_LEN, esc, norm, lower, rand, shuffle, store, api, flush, saveRound, pending, known, learn, stats, exportAll, merge, unmerge, Snd };
})();
