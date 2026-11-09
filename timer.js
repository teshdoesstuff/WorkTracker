// Wrapped so these names can't collide with script.js, which shares the global scope.
(() => {
  const STORAGE_KEY = 'worktracker-time';
  const TITLE_PREFIX = "Time's up · ";
  const DEFAULT_DURATION = 5 * 60 * 1000;

  const display = document.getElementById('timer-display');
  const statusText = document.getElementById('timer-status');
  const stopwatchTab = document.getElementById('mode-stopwatch');
  const countdownTab = document.getElementById('mode-countdown');
  const fields = document.getElementById('countdown-fields');
  const hoursInput = document.getElementById('countdown-hours');
  const minutesInput = document.getElementById('countdown-minutes');
  const secondsInput = document.getElementById('countdown-seconds');
  const startBtn = document.getElementById('timer-start');
  const stopBtn = document.getElementById('timer-stop');
  const resetBtn = document.getElementById('timer-reset');

  // Running timers store the wall-clock moment they started or end, not a ticking count,
  // so they stay accurate in background tabs and carry on through a page reload.
  const time = load();

  let frame = 0;
  let finishTimeout = 0;
  let audio = null;

  function defaults() {
    return {
      mode: 'stopwatch',
      stopwatch: { elapsed: 0, startedAt: null },
      countdown: {
        duration: DEFAULT_DURATION,
        remaining: DEFAULT_DURATION,
        endsAt: null,
        finished: false,
      },
    };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.stopwatch && saved.countdown) return saved;
    } catch {
      // Unreadable or blocked storage: start with fresh timers.
    }
    return defaults();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(time));
    } catch {
      // Storage is unavailable: the timers still work until the page closes.
    }
  }

  function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = String(Math.floor(totalSeconds / 60) % 60).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function stopwatchMs() {
    const { elapsed, startedAt } = time.stopwatch;
    return elapsed + (startedAt === null ? 0 : Date.now() - startedAt);
  }

  function countdownMs() {
    const { remaining, endsAt } = time.countdown;
    return endsAt === null ? remaining : Math.max(0, endsAt - Date.now());
  }

  function isRunning(mode = time.mode) {
    return mode === 'stopwatch'
      ? time.stopwatch.startedAt !== null
      : time.countdown.endsAt !== null;
  }

  /* Drawing */

  // The countdown rounds up so it starts on the full time and shows zero only when it's over.
  function renderDisplay() {
    const seconds = time.mode === 'stopwatch'
      ? Math.floor(stopwatchMs() / 1000)
      : Math.ceil(countdownMs() / 1000);
    display.textContent = formatTime(seconds);
  }

  function renderControls() {
    const isCountdown = time.mode === 'countdown';
    const running = isRunning();
    const { duration, remaining, finished } = time.countdown;

    stopwatchTab.setAttribute('aria-pressed', String(!isCountdown));
    countdownTab.setAttribute('aria-pressed', String(isCountdown));
    fields.hidden = !isCountdown;
    [hoursInput, minutesInput, secondsInput].forEach((input) => {
      input.disabled = running;
    });

    startBtn.disabled = running || (isCountdown && duration === 0);
    stopBtn.disabled = !running;
    resetBtn.disabled = isCountdown
      ? !running && !finished && remaining === duration
      : !running && time.stopwatch.elapsed === 0;

    statusText.textContent = isCountdown && finished ? "Time's up" : '';
    display.classList.toggle('finished', isCountdown && finished);
    renderDisplay();
  }

  function fillCountdownFields() {
    const totalSeconds = Math.floor(time.countdown.duration / 1000);
    hoursInput.value = Math.floor(totalSeconds / 3600);
    minutesInput.value = Math.floor(totalSeconds / 60) % 60;
    secondsInput.value = totalSeconds % 60;
  }

  function loop() {
    frame = 0;
    checkCountdownFinished();
    renderDisplay();
    keepLooping();
  }

  function keepLooping() {
    if (!frame && (isRunning('stopwatch') || isRunning('countdown'))) {
      frame = requestAnimationFrame(loop);
    }
  }

  /* Countdown finishing */

  // Browsers pause animation frames in background tabs, so a timeout also watches for the end.
  function scheduleFinish() {
    clearTimeout(finishTimeout);
    if (isRunning('countdown')) {
      finishTimeout = setTimeout(checkCountdownFinished, countdownMs());
    }
  }

  function checkCountdownFinished() {
    if (!isRunning('countdown') || countdownMs() > 0) return;

    clearTimeout(finishTimeout);
    time.countdown.endsAt = null;
    time.countdown.remaining = 0;
    time.countdown.finished = true;
    save();
    renderControls();
    if (document.activeElement === stopBtn || document.activeElement === document.body) {
      startBtn.focus({ preventScroll: true });
    }
    document.title = TITLE_PREFIX + document.title;
    beep();
  }

  function clearFinished() {
    time.countdown.finished = false;
    document.title = document.title.replace(TITLE_PREFIX, '');
  }

  // Browsers only allow sound once it's been set up from a click, so Start prepares it.
  function prepareAudio() {
    try {
      audio = audio || new AudioContext();
      audio.resume();
    } catch {
      audio = null;
    }
  }

  function beep() {
    if (!audio) return;
    [0, 0.3, 0.6].forEach((delay) => {
      const at = audio.currentTime + delay;
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      tone.frequency.value = 880;
      volume.gain.setValueAtTime(0.2, at);
      volume.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      tone.connect(volume).connect(audio.destination);
      tone.start(at);
      tone.stop(at + 0.2);
    });
  }

  /* Buttons */

  function start() {
    if (time.mode === 'stopwatch') {
      time.stopwatch.startedAt = Date.now();
    } else {
      const { countdown } = time;
      if (countdown.finished || countdown.remaining <= 0) countdown.remaining = countdown.duration;
      clearFinished();
      prepareAudio();
      countdown.endsAt = Date.now() + countdown.remaining;
      scheduleFinish();
    }
    save();
    renderControls();
    keepLooping();
    stopBtn.focus();
  }

  function stop() {
    if (time.mode === 'stopwatch') {
      time.stopwatch.elapsed = stopwatchMs();
      time.stopwatch.startedAt = null;
    } else {
      time.countdown.remaining = countdownMs();
      time.countdown.endsAt = null;
      clearTimeout(finishTimeout);
    }
    save();
    renderControls();
    startBtn.focus();
  }

  function reset() {
    if (time.mode === 'stopwatch') {
      time.stopwatch = { elapsed: 0, startedAt: null };
    } else {
      clearTimeout(finishTimeout);
      clearFinished();
      time.countdown.endsAt = null;
      time.countdown.remaining = time.countdown.duration;
    }
    save();
    renderControls();
    startBtn.focus();
  }

  function setMode(mode) {
    time.mode = mode;
    save();
    renderControls();
  }

  function readField(input, max) {
    const value = Math.floor(Number(input.value));
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  }

  function onDurationInput() {
    const hours = readField(hoursInput, 99);
    const minutes = readField(minutesInput, 59);
    const seconds = readField(secondsInput, 59);
    clearFinished();
    time.countdown.duration = (hours * 3600 + minutes * 60 + seconds) * 1000;
    time.countdown.remaining = time.countdown.duration;
    save();
    renderControls();
  }

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  resetBtn.addEventListener('click', reset);
  stopwatchTab.addEventListener('click', () => setMode('stopwatch'));
  countdownTab.addEventListener('click', () => setMode('countdown'));
  [hoursInput, minutesInput, secondsInput].forEach((input) => {
    input.addEventListener('input', onDurationInput);
    input.addEventListener('change', fillCountdownFields);
  });

  fillCountdownFields();
  renderControls();
  checkCountdownFinished();
  scheduleFinish();
  keepLooping();
})();
