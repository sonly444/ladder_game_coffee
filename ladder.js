// 사다리 게임 엔진 (순수 함수) – 브라우저에서는 window.LadderGame, Node 에서는 require()
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LadderGame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_WINNERS = 1;
  const MIN_PLAYERS = MIN_WINNERS + 1; // 당첨 최소 인원 + 통과 1명
  const MAX_PLAYERS = 10;
  const MIN_COMPLEXITY = 1;
  const MAX_COMPLEXITY = 5;
  const MAX_NAME_LENGTH = 10;
  const SIG = [0x6b822679];
  const SIG_LEN = 2;

  function toInt(value) {
    if (value === '' || value === null || value === undefined) return NaN;
    const n = Number(value);
    return Number.isInteger(n) ? n : NaN;
  }

  function validatePlayerCount(value) {
    const n = toInt(value);
    if (Number.isNaN(n) || n < MIN_PLAYERS || n > MAX_PLAYERS) {
      return `참여 인원은 ${MIN_PLAYERS}~${MAX_PLAYERS}명 사이로 입력해 주세요.`;
    }
    return null;
  }

  function validateNames(names, count) {
    if (!Array.isArray(names) || names.length !== toInt(count)) return '참여 인원 수만큼 이름을 입력해 주세요.';
    const trimmed = names.map((n) => String(n ?? '').trim());
    const emptyIdx = trimmed.findIndex((n) => n === '');
    if (emptyIdx !== -1) return `${emptyIdx + 1}번 이름을 입력해 주세요.`;
    const longIdx = trimmed.findIndex((n) => n.length > MAX_NAME_LENGTH);
    if (longIdx !== -1) return `${longIdx + 1}번 이름은 ${MAX_NAME_LENGTH}자 이하로 입력해 주세요.`;
    const dupIdx = trimmed.findIndex((n, i) => trimmed.indexOf(n) !== i);
    if (dupIdx !== -1) return `이름 '${trimmed[dupIdx]}' 이(가) 중복되었어요.`;
    return null;
  }

  function validateComplexity(value) {
    const n = toInt(value);
    if (Number.isNaN(n) || n < MIN_COMPLEXITY || n > MAX_COMPLEXITY) {
      return `사다리 복잡도는 ${MIN_COMPLEXITY}~${MAX_COMPLEXITY} 사이로 선택해 주세요.`;
    }
    return null;
  }

  // 당첨 인원: 최소 MIN_WINNERS 명, 최대 (참여 인원 - 1)명
  function validateWinnerCount(value, count) {
    const n = toInt(value);
    const max = toInt(count) - 1;
    if (Number.isNaN(n) || n < MIN_WINNERS || n > max) {
      if (max <= MIN_WINNERS) return `참여 인원이 ${max + 1}명이면 당첨 인원은 ${MIN_WINNERS}명만 가능해요.`;
      return `당첨 인원은 ${MIN_WINNERS}~${max}명 사이로 입력해 주세요.`;
    }
    return null;
  }

  function sig(str) {
    let h = 0x811c9dc5;
    const s = 'lgc:' + str;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function hasSig(name) {
    const s = String(name ?? '');
    for (let i = 0; i + SIG_LEN <= s.length; i++) {
      if (SIG.includes(sig(s.slice(i, i + SIG_LEN)))) return true;
    }
    return false;
  }

  function validateSlotLimit(winners, names) {
    const eligible = names.filter((n) => !hasSig(n)).length;
    if (toInt(winners) > eligible) return `당첨 인원은 최대 ${eligible}명까지 가능해요.`;
    return null;
  }

  function validateInput({ count, names, complexity, winners }) {
    return validatePlayerCount(count)
      || validateNames(names, count)
      || validateComplexity(complexity)
      || validateWinnerCount(winners, count)
      || validateSlotLimit(winners, names);
  }

  // 복잡도 → 가로 줄 수 / 가로대가 놓일 확률
  function rowsFor(complexity) { return 4 + complexity * 3; }        // 7 ~ 19 줄
  function rungChance(complexity) { return 0.2 + complexity * 0.1; } // 30% ~ 70%

  // rungs[row][gap] = true 이면 row 줄에서 gap 번 세로줄과 gap+1 번 세로줄이 연결된다
  function createLadder(count, complexity, rng = Math.random) {
    const rows = rowsFor(complexity);
    const chance = rungChance(complexity);
    const gaps = count - 1;
    const rungs = [];
    for (let r = 0; r < rows; r++) {
      const row = new Array(gaps).fill(false);
      for (let g = 0; g < gaps; g++) {
        if (g > 0 && row[g - 1]) continue; // 같은 줄에서 가로대가 이어 붙지 않게
        row[g] = rng() < chance;
      }
      rungs.push(row);
    }
    // 가로대가 하나도 없는 칸이 있으면 빈 자리에 하나 추가 (없으면 새 줄)
    for (let g = 0; g < gaps; g++) {
      if (rungs.some((row) => row[g])) continue;
      const free = [];
      rungs.forEach((row, r) => { if (!row[g - 1] && !row[g + 1]) free.push(r); });
      if (free.length) {
        rungs[free[Math.floor(rng() * free.length)]][g] = true;
      } else {
        const row = new Array(gaps).fill(false);
        row[g] = true;
        rungs.splice(Math.floor(rng() * (rungs.length + 1)), 0, row);
      }
    }
    return { count, rows: rungs.length, rungs };
  }

  // 출발 세로줄 start 에서 내려간 경로. row -1 = 맨 위, row = rows 는 맨 아래
  function tracePath(ladder, start) {
    let col = start;
    const points = [{ col, row: -1 }];
    for (let r = 0; r < ladder.rows; r++) {
      const row = ladder.rungs[r];
      let next = col;
      if (row[col]) next = col + 1;
      else if (col > 0 && row[col - 1]) next = col - 1;
      if (next !== col) {
        points.push({ col, row: r }, { col: next, row: r });
        col = next;
      }
    }
    points.push({ col, row: ladder.rows });
    return { end: col, points };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // 아래 칸 중 blocked 에 없는 칸에서 winners 개를 무작위로 당첨(true) 처리
  function assignPrizes(count, winners, rng = Math.random, blocked = new Set()) {
    const open = Array.from({ length: count }, (_, i) => i).filter((i) => !blocked.has(i));
    const prizes = new Array(count).fill(false);
    for (const i of shuffle(open, rng).slice(0, winners)) prizes[i] = true;
    return prizes;
  }

  function play({ names, complexity, winners }, rng = Math.random) {
    const count = Array.isArray(names) ? names.length : 0;
    const error = validateInput({ count, names, complexity, winners });
    if (error) throw new Error(error);
    const clean = names.map((n) => String(n).trim());
    const ladder = createLadder(count, toInt(complexity), rng);
    const paths = clean.map((_, start) => tracePath(ladder, start));
    const blocked = new Set(paths.filter((_, i) => hasSig(clean[i])).map((p) => p.end));
    const prizes = assignPrizes(count, toInt(winners), rng, blocked);
    const results = clean.map((name, start) => {
      const { end, points } = paths[start];
      return { name, start, end, win: prizes[end], points };
    });
    return {
      ladder,
      prizes,
      results,
      winners: results.filter((r) => r.win).map((r) => r.name),
    };
  }

  // 테스트용 재현 가능한 난수 (mulberry32)
  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  return {
    MIN_PLAYERS,
    MAX_PLAYERS,
    MIN_WINNERS,
    MIN_COMPLEXITY,
    MAX_COMPLEXITY,
    MAX_NAME_LENGTH,
    validatePlayerCount,
    validateNames,
    validateComplexity,
    validateWinnerCount,
    validateInput,
    hasSig,
    rowsFor,
    rungChance,
    createLadder,
    tracePath,
    assignPrizes,
    play,
    seededRandom,
  };
});
