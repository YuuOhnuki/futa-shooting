(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const ui = {
    titleScreen: document.getElementById("titleScreen"),
    resultScreen: document.getElementById("resultScreen"),
    decorFutas: document.getElementById("decorFutas"),
    hud: document.getElementById("hud"),
    comboSplash: document.getElementById("comboSplash"),
    mobileControls: document.getElementById("mobileControls"),
    score: document.getElementById("scoreDisplay"),
    hp: document.getElementById("hpDisplay"),
    time: document.getElementById("timeDisplay"),
    combo: document.getElementById("comboDisplay"),
    power: document.getElementById("powerDisplay"),
    titleHighScore: document.getElementById("titleHighScore"),
    gameHighScore: document.getElementById("gameHighScore"),
    resultHighScore: document.getElementById("resultHighScore"),
    finalScore: document.getElementById("finalScore"),
    maxCombo: document.getElementById("maxCombo"),
    accuracy: document.getElementById("accuracy"),
    rank: document.getElementById("rankDisplay"),
    newRecord: document.getElementById("newRecord"),
    start: document.getElementById("startButton"),
    restart: document.getElementById("restartButton"),
    backTitle: document.getElementById("backTitleButton"),
    soundTitle: document.getElementById("soundToggleTitle"),
    soundGame: document.getElementById("soundToggleGame"),
    left: document.getElementById("leftButton"),
    right: document.getElementById("rightButton"),
    fire: document.getElementById("fireButton"),
  };

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const STORAGE_KEY = "futa-shooting-highscore";
  const POWER_NAMES = {
    rapid: "連射アップ",
    wide: "ワイドショット",
    slow: "スロー",
    bonus: "ボーナス",
  };

  const FUTA_SOURCES = [
    "assets/futa.png",
    "assets/futa_rapid.png",
    "assets/futa_slow.png",
    "assets/futa_speed.png",
    "assets/futa_mini.png",
    "assets/futa_golden.png",
    "assets/futa_result.png",
  ];
  const futaImages = FUTA_SOURCES.map((src) => {
    const image = new Image();
    return { src, image, ready: false };
  });
  let futaReady = false;
  let futaImage = futaImages[0].image;
  for (const entry of futaImages) {
    entry.image.onload = () => {
      entry.ready = true;
      futaReady = true;
      if (!futaImage.complete || futaImage.naturalWidth === 0) futaImage = entry.image;
    };
    entry.image.onerror = () => {
      entry.ready = false;
    };
    entry.image.src = entry.src;
  }

  class SoundSystem {
    constructor() {
      this.enabled = true;
      this.ctx = null;
      this.lastBeat = 0;
    }

    ensure() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === "suspended") this.ctx.resume();
    }

    toggle() {
      this.enabled = !this.enabled;
      updateSoundLabels();
    }

    tone(freq, duration, type = "square", gain = 0.045) {
      if (!this.enabled) return;
      this.ensure();
      const osc = this.ctx.createOscillator();
      const vol = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      vol.gain.setValueAtTime(gain, this.ctx.currentTime);
      vol.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + duration,
      );
      osc.connect(vol).connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    }

    shoot() {
      this.tone(560, 0.055, "square", 0.025);
    }
    hit() {
      this.tone(860, 0.08, "triangle", 0.05);
    }
    power() {
      this.tone(660, 0.08, "sine", 0.045);
      setTimeout(() => this.tone(990, 0.09, "sine", 0.04), 70);
    }
    finish() {
      this.tone(220, 0.16, "sawtooth", 0.05);
    }

    urgentBeat(timeLeft, now) {
      if (!this.enabled || timeLeft > 10 || now - this.lastBeat < 0.33) return;
      this.lastBeat = now;
      this.tone(330 + (10 - timeLeft) * 18, 0.045, "triangle", 0.018);
    }
  }

  class Game {
    constructor() {
      this.sound = new SoundSystem();
      this.state = "title";
      this.highScore = Number(localStorage.getItem(STORAGE_KEY) || 0);
      this.keys = new Set();
      this.pointerDown = false;
      this.mobileMove = 0;
      this.lastTime = 0;
      this.resizeObserver = null;
      this.reset();
      this.bindEvents();
      this.updateHighScoreText();
      requestAnimationFrame((time) => this.loop(time));
    }

    reset() {
      this.score = 0;
      this.timeLeft = 60;
      this.elapsed = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.shots = 0;
      this.hits = 0;
      this.comboTimer = 0;
      this.comboFlash = 0;
      this.fireCooldown = 0;
      this.fireHeld = false;
      this.hp = 5;
      this.invulnerableTimer = 0;
      this.screenShake = 0;
      this.flash = 0;
      this.powerTimer = 0;
      this.powerType = "";
      this.itemTimer = 4.5;
      this.goldenTimer = 7 + Math.random() * 6;
      this.goldenLife = 0;
      this.particles = [];
      this.bullets = [];
      this.enemyBullets = [];
      this.items = [];
      this.popups = [];
      this.enemyShotTimer = 1.8;
      this.stars = Array.from({ length: 80 }, () => ({
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT,
        r: 1 + Math.random() * 2.4,
        speed: 12 + Math.random() * 34,
      }));
      this.player = { x: WIDTH / 2, y: HEIGHT - 58, radius: 26, speed: 480 };
      this.target = {
        x: 160 + Math.random() * (WIDTH - 320),
        y: 105 + Math.random() * 190,
        radius: 44,
        vx: 130,
        vy: 80,
        spin: 0,
        scale: 1,
        mood: Math.random() * 10,
        evadeCooldown: 0,
        feintTimer: 0,
        golden: false,
        imageEntry: this.pickFutaImage(),
      };
    }

    bindEvents() {
      ui.start.addEventListener("click", () => this.start());
      ui.restart.addEventListener("click", () => this.start());
      ui.backTitle.addEventListener("click", () => this.showTitle());
      ui.soundTitle.addEventListener("click", () => this.sound.toggle());
      ui.soundGame.addEventListener("click", () => this.sound.toggle());
      ui.fire.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.fireHeld = true;
        this.shoot();
      });
      ui.fire.addEventListener("pointerup", () => {
        this.fireHeld = false;
      });
      ui.fire.addEventListener("pointercancel", () => {
        this.fireHeld = false;
      });
      this.bindHoldButton(ui.left, -1);
      this.bindHoldButton(ui.right, 1);
      for (const button of [ui.left, ui.right, ui.fire]) {
        button.addEventListener("contextmenu", (event) => event.preventDefault());
        button.addEventListener("selectstart", (event) => event.preventDefault());
        button.addEventListener("dragstart", (event) => event.preventDefault());
      }

      window.addEventListener("keydown", (event) => {
        if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code))
          event.preventDefault();
        this.keys.add(event.code);
        if (event.code === "Space") {
          this.fireHeld = true;
          this.shoot();
        }
      });
      window.addEventListener("keyup", (event) => {
        this.keys.delete(event.code);
        if (event.code === "Space") this.fireHeld = false;
      });
      canvas.addEventListener("pointerdown", (event) => {
        this.pointerDown = true;
        this.fireHeld = true;
        this.movePlayerToPointer(event);
        this.shoot();
      });
      canvas.addEventListener("pointermove", (event) => {
        if (
          this.state === "playing" &&
          (this.pointerDown || event.pointerType === "mouse")
        ) {
          this.movePlayerToPointer(event);
        }
      });
      window.addEventListener("pointerup", () => {
        this.pointerDown = false;
        this.fireHeld = false;
      });
    }

    bindHoldButton(button, direction) {
      const start = (event) => {
        event.preventDefault();
        this.mobileMove = direction;
      };
      const stop = () => {
        if (this.mobileMove === direction) this.mobileMove = 0;
      };
      button.addEventListener("pointerdown", start);
      button.addEventListener("pointerup", stop);
      button.addEventListener("pointercancel", stop);
      button.addEventListener("pointerleave", stop);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
      button.addEventListener("selectstart", (event) => event.preventDefault());
      button.addEventListener("dragstart", (event) => event.preventDefault());
    }

    start() {
      this.reset();
      this.state = "playing";
      this.sound.ensure();
      ui.titleScreen.classList.remove("screen-active");
      ui.resultScreen.classList.remove("screen-active");
      ui.decorFutas.classList.remove("active");
      ui.hud.classList.add("active");
      ui.soundGame.classList.add("active");
      this.updateMobileControls();
      this.updateHud();
    }

    updateMobileControls() {
      const isDesktopPointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
      ui.mobileControls.classList.toggle("active", !isDesktopPointer);
    }

    showTitle() {
      this.state = "title";
      ui.titleScreen.classList.add("screen-active");
      ui.resultScreen.classList.remove("screen-active");
      ui.decorFutas.classList.add("active");
      ui.hud.classList.remove("active");
      ui.soundGame.classList.remove("active");
      ui.mobileControls.classList.remove("active");
      this.updateHighScoreText();
    }

    loop(time) {
      const dt = Math.min(0.033, (time - this.lastTime) / 1000 || 0);
      this.lastTime = time;
      if (this.state === "playing") this.update(dt, time / 1000);
      this.draw(time / 1000);
      requestAnimationFrame((next) => this.loop(next));
    }

    update(dt, now) {
      this.elapsed += dt;
      this.timeLeft = Math.max(0, 60 - this.elapsed);
      this.sound.urgentBeat(this.timeLeft, now);
      this.updateInput(dt);
      this.updateTarget(dt);
      this.updateBullets(dt);
      this.updateEnemyBullets(dt);
      this.updateItems(dt);
      this.updateEffects(dt);
      this.updateSpawns(dt);
      this.updateCombo(dt);
      this.updateHud();
      if (this.timeLeft <= 0 || this.hp <= 0) this.finish();
    }

    updateInput(dt) {
      let direction = this.mobileMove;
      if (this.keys.has("ArrowLeft")) direction -= 1;
      if (this.keys.has("ArrowRight")) direction += 1;
      this.player.x = clamp(
        this.player.x + direction * this.player.speed * dt,
        36,
        WIDTH - 36,
      );
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
      if (this.fireHeld) this.shoot();
    }

    updateTarget(dt) {
      const progress = this.elapsed / 60;
      const slowFactor = this.powerType === "slow" ? 0.45 : 1;
      const speed = (1 + progress * 1.45) * slowFactor;
      const feintActive = this.elapsed > 30 && this.target.feintTimer > 0;
      const chaos = Math.max(0, (12 - this.timeLeft) / 12);
      const drift =
        Math.sin(this.elapsed * (2.2 + this.target.mood + chaos * 3.2)) *
        (55 + chaos * 58);
      this.target.feintTimer -= dt;
      this.target.evadeCooldown -= dt;
      if (this.elapsed > 30 && Math.random() < dt * 0.9) {
        this.target.feintTimer = 0.34;
        this.target.vx *= -1.25;
      }
      if (chaos > 0 && Math.random() < dt * (0.85 + chaos * 1.8)) {
        this.target.vx += (Math.random() - 0.5) * (120 + chaos * 190);
        this.target.vy += (Math.random() - 0.5) * (90 + chaos * 140);
        this.target.spin += (Math.random() - 0.5) * chaos * 0.45;
      }
      if (Math.random() < dt * 0.14)
        this.target.vy += (Math.random() - 0.5) * 150;
      this.target.x +=
        (this.target.vx * speed + drift * (feintActive ? -2 : 1)) * dt +
        (Math.random() - 0.5) * chaos * 7;
      this.target.y +=
        this.target.vy * speed * dt + (Math.random() - 0.5) * chaos * 6;
      const targetSize = this.getTargetSize();
      const marginX = targetSize.width * this.target.scale * 0.5 + 18;
      const marginY = targetSize.height * this.target.scale * 0.5 + 18;
      const maxY = HEIGHT * 0.58;
      if (this.target.x < marginX || this.target.x > WIDTH - marginX)
        this.target.vx *= -1;
      if (this.target.y < marginY || this.target.y > maxY)
        this.target.vy *= -1;
      this.target.x = clamp(this.target.x, marginX, WIDTH - marginX);
      this.target.y = clamp(this.target.y, marginY, maxY);
      this.target.spin *= 0.9;
      this.target.scale += (1 - this.target.scale) * Math.min(1, dt * 7);
      if (this.target.golden) {
        this.goldenLife -= dt;
        if (this.goldenLife <= 0) this.disableGolden();
      }
    }

    updateBullets(dt) {
      for (const bullet of this.bullets) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
      }
      for (const bullet of this.bullets) {
        if (!bullet.dead && this.isTargetHit(bullet)) {
          bullet.dead = true;
          this.hitTarget(bullet.x, bullet.y);
        }
      }
      this.bullets = this.bullets.filter(
        (bullet) =>
          !bullet.dead &&
          bullet.y > -30 &&
          bullet.x > -30 &&
          bullet.x < WIDTH + 30,
      );
    }

    updateEnemyBullets(dt) {
      for (const bullet of this.enemyBullets) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        bullet.spin += dt * 8;
        if (
          this.invulnerableTimer <= 0 &&
          distance(bullet, this.player) < bullet.radius + this.player.radius * 0.72
        ) {
          bullet.dead = true;
          this.damagePlayer(bullet.x, bullet.y);
        }
      }
      this.enemyBullets = this.enemyBullets.filter(
        (bullet) =>
          !bullet.dead &&
          bullet.y < HEIGHT + 40 &&
          bullet.y > -40 &&
          bullet.x > -40 &&
          bullet.x < WIDTH + 40,
      );
    }

    pickFutaImage(preferGolden = false) {
      const readyEntries = futaImages.filter((entry) => entry.ready);
      if (preferGolden) {
        const golden = readyEntries.find((entry) => entry.src.includes("golden"));
        if (golden) return golden;
      }
      if (readyEntries.length === 0) return futaImages[0];
      return readyEntries[Math.floor(Math.random() * readyEntries.length)];
    }

    getTargetImage() {
      const entry = this.target.imageEntry;
      if (entry && entry.ready) return entry.image;
      const fallback = this.pickFutaImage(this.target.golden);
      this.target.imageEntry = fallback;
      return fallback.ready ? fallback.image : futaImage;
    }

    getTargetSize() {
      const image = this.getTargetImage();
      if (!futaReady || !image.naturalWidth || !image.naturalHeight) {
        const size = this.target.radius * 2;
        return { width: size, height: size };
      }
      const height = this.target.golden ? 132 : 118;
      return {
        width: height * (image.naturalWidth / image.naturalHeight),
        height,
      };
    }

    isTargetHit(point) {
      const size = this.getTargetSize();
      const scale = this.target.scale;
      const dx = (point.x - this.target.x) / (size.width * scale * 0.46);
      const dy = (point.y - this.target.y) / (size.height * scale * 0.46);
      return dx * dx + dy * dy <= 1;
    }

    updateItems(dt) {
      for (const item of this.items) {
        item.y += item.vy * dt;
        item.pulse += dt * 5;
        if (distance(item, this.player) < item.radius + this.player.radius) {
          item.dead = true;
          this.collectItem(item.type);
        }
      }
      this.items = this.items.filter(
        (item) => !item.dead && item.y < HEIGHT + 40,
      );
      if (this.powerTimer > 0) {
        this.powerTimer -= dt;
        if (this.powerTimer <= 0) this.powerType = "";
      }
    }

    updateEffects(dt) {
      this.screenShake = Math.max(0, this.screenShake - dt * 22);
      this.flash = Math.max(0, this.flash - dt * 2.4);
      this.comboFlash = Math.max(0, this.comboFlash - dt);
      for (const star of this.stars) {
        star.y += star.speed * dt * (this.timeLeft <= 10 ? 2.2 : 1);
        if (star.y > HEIGHT) {
          star.y = -8;
          star.x = Math.random() * WIDTH;
        }
      }
      for (const particle of this.particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;
        particle.vy += 90 * dt;
      }
      for (const popup of this.popups) {
        popup.y -= 58 * dt;
        popup.life -= dt;
      }
      this.particles = this.particles.filter((particle) => particle.life > 0);
      this.popups = this.popups.filter((popup) => popup.life > 0);
    }

    updateSpawns(dt) {
      this.itemTimer -= dt;
      this.goldenTimer -= dt;
      this.enemyShotTimer -= dt;
      if (this.itemTimer <= 0) {
        this.spawnItem();
        this.itemTimer = 8 + Math.random() * 5;
      }
      if (this.enemyShotTimer <= 0) {
        this.spawnEnemyBullet();
        const progress = this.elapsed / 60;
        const chaos = Math.max(0, (15 - this.timeLeft) / 15);
        this.enemyShotTimer = Math.max(0.28, 1.55 - progress * 0.8 - chaos * 0.55 + Math.random() * 0.35);
      }
      if (this.goldenTimer <= 0 && !this.target.golden) {
        this.enableGolden();
        this.goldenTimer = 14 + Math.random() * 10;
      }
    }

    updateCombo(dt) {
      if (this.combo > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }
    }

    shoot() {
      if (this.state !== "playing" || this.fireCooldown > 0) return;
      this.shots += 1;
      this.fireCooldown = this.powerType === "rapid" ? 0.11 : 0.24;
      const angles = this.powerType === "wide" ? [-0.22, 0, 0.22] : [0];
      for (const angle of angles) {
        this.bullets.push({
          x: this.player.x,
          y: this.player.y - 28,
          vx: Math.sin(angle) * 360,
          vy: -760 * Math.cos(angle),
          radius: 7,
        });
      }
      if (this.target.evadeCooldown <= 0 && Math.random() < 0.22) {
        this.target.vx += this.player.x < this.target.x ? 115 : -115;
        this.target.evadeCooldown = 1.1;
      }
      this.sound.shoot();
    }

    spawnEnemyBullet() {
      const angle = Math.atan2(
        this.player.y - this.target.y,
        this.player.x - this.target.x,
      );
      const progress = this.elapsed / 60;
      const speed = 160 + progress * 165 + Math.max(0, 15 - this.timeLeft) * 8;
      const spread = (Math.random() - 0.5) * (0.34 + progress * 0.28);
      this.enemyBullets.push({
        x: this.target.x,
        y: this.target.y + 14,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        radius: this.target.golden ? 13 : 10,
        spin: Math.random() * Math.PI,
        golden: this.target.golden,
      });
      if (this.timeLeft <= 12 && Math.random() < 0.45) {
        this.enemyBullets.push({
          x: this.target.x,
          y: this.target.y + 14,
          vx: Math.cos(angle - spread * 1.4) * (speed * 0.9),
          vy: Math.sin(angle - spread * 1.4) * (speed * 0.9),
          radius: 8,
          spin: Math.random() * Math.PI,
          golden: false,
        });
      }
    }

    damagePlayer(x, y) {
      this.hp = Math.max(0, this.hp - 1);
      this.combo = 0;
      this.invulnerableTimer = 1.15;
      this.screenShake = 12;
      this.popups.push({ x, y, text: "-HP", life: 0.9, golden: false });
      this.spawnBurst(x, y, "#ff4fa3", 18);
    }

    hitTarget(x, y) {
      this.hits += 1;
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboTimer = 2.05;
      const multiplier = 1 + Math.floor(this.combo / 5) * 0.25;
      const base = this.target.golden ? 550 : 100;
      const gained = Math.round(base * multiplier);
      this.score += gained;
      this.screenShake = this.target.golden ? 9 : 5;
      this.target.scale = this.target.golden ? 1.36 : 1.2;
      this.target.spin = (Math.random() - 0.5) * 0.8;
      this.target.vx += (Math.random() - 0.5) * 190;
      this.target.vy += (Math.random() - 0.5) * 130;
      if (!this.target.golden && Math.random() < 0.55) {
        this.target.imageEntry = this.pickFutaImage();
      }
      this.popups.push({
        x,
        y,
        text: `+${gained}`,
        life: 0.9,
        golden: this.target.golden,
      });
      this.spawnBurst(
        x,
        y,
        this.target.golden ? "#ffd84d" : "#4de7ff",
        this.target.golden ? 22 : 14,
      );
      if ([10, 20, 30].includes(this.combo))
        this.showComboSplash(`${this.combo} COMBO!`);
      else if (this.combo >= 40 && this.combo % 10 === 0)
        this.showComboSplash(`${this.combo} COMBO!`);
      if (this.target.golden) this.disableGolden();
      this.sound.hit();
    }

    collectItem(type) {
      if (type === "bonus") {
        this.score += 700;
        this.popups.push({
          x: WIDTH / 2,
          y: HEIGHT / 2,
          text: "+700 BONUS",
          life: 1.1,
          golden: true,
        });
      } else {
        this.powerType = type;
        this.powerTimer = 7.5;
      }
      this.spawnBurst(this.player.x, this.player.y - 20, "#fff36d", 24);
      this.sound.power();
    }

    spawnItem() {
      const types = ["rapid", "wide", "slow", "bonus"];
      this.items.push({
        x: 70 + Math.random() * (WIDTH - 140),
        y: -20,
        vy: 68,
        radius: 22,
        type: types[Math.floor(Math.random() * types.length)],
        pulse: 0,
      });
    }

    enableGolden() {
      this.target.golden = true;
      this.target.imageEntry = this.pickFutaImage(true);
      this.goldenLife = 4.6;
      this.flash = 1;
      this.showComboSplash("ゴールデン風太!");
    }

    disableGolden() {
      this.target.golden = false;
      this.target.imageEntry = this.pickFutaImage();
      this.goldenLife = 0;
    }

    spawnBurst(x, y, color, count) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 70 + Math.random() * 220;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2 + Math.random() * 5,
          color,
          life: 0.45 + Math.random() * 0.55,
        });
      }
    }

    showComboSplash(text) {
      ui.comboSplash.textContent = text;
      ui.comboSplash.classList.remove("show");
      void ui.comboSplash.offsetWidth;
      ui.comboSplash.classList.add("show");
    }

    movePlayerToPointer(event) {
      const rect = canvas.getBoundingClientRect();
      const scale = WIDTH / rect.width;
      this.player.x = clamp(
        (event.clientX - rect.left) * scale,
        36,
        WIDTH - 36,
      );
    }

    finish() {
      if (this.state !== "playing") return;
      this.state = "result";
      const oldHigh = this.highScore;
      this.highScore = Math.max(this.highScore, this.score);
      localStorage.setItem(STORAGE_KEY, String(this.highScore));
      ui.hud.classList.remove("active");
      ui.decorFutas.classList.add("active");
      ui.soundGame.classList.remove("active");
      ui.mobileControls.classList.remove("active");
      ui.resultScreen.classList.add("screen-active");
      ui.finalScore.textContent = this.score.toLocaleString();
      ui.maxCombo.textContent = String(this.maxCombo);
      ui.accuracy.textContent = `${Math.round((this.hits / Math.max(1, this.shots)) * 100)}%`;
      ui.rank.textContent = this.rankText();
      ui.newRecord.textContent = this.score > oldHigh ? "最高スコア更新!" : "";
      this.updateHighScoreText();
      this.sound.finish();
    }

    rankText() {
      if (this.score >= 15000) return "Sランク：超風太マスター";
      if (this.score >= 9500) return "Aランク：風太ハンター";
      if (this.score >= 5000) return "Bランク：なかなかの腕前";
      return "Cランク：まだまだ練習中";
    }

    updateHud() {
      ui.score.textContent = this.score.toLocaleString();
      ui.hp.textContent = "♥".repeat(this.hp).padEnd(5, "♡");
      ui.time.textContent = this.timeLeft.toFixed(1);
      ui.combo.textContent = String(this.combo);
      ui.power.textContent = this.powerType
        ? `${POWER_NAMES[this.powerType]} ${Math.ceil(this.powerTimer)}s`
        : "なし";
      ui.gameHighScore.textContent = this.highScore.toLocaleString();
    }

    updateHighScoreText() {
      ui.titleHighScore.textContent = this.highScore.toLocaleString();
      ui.gameHighScore.textContent = this.highScore.toLocaleString();
      ui.resultHighScore.textContent = this.highScore.toLocaleString();
    }

    draw(now) {
      const shakeX = (Math.random() - 0.5) * this.screenShake;
      const shakeY = (Math.random() - 0.5) * this.screenShake;
      ctx.save();
      ctx.translate(shakeX, shakeY);
      this.drawBackground(now);
      this.drawItems();
      this.drawEnemyBullets();
      this.drawBullets();
      this.drawPlayer();
      this.drawTarget();
      this.drawParticles();
      this.drawPopups();
      if (this.flash > 0) {
        ctx.fillStyle = `rgba(255, 238, 90, ${this.flash * 0.28})`;
        ctx.fillRect(-20, -20, WIDTH + 40, HEIGHT + 40);
      }
      if (this.timeLeft <= 10 && this.state === "playing") {
        ctx.strokeStyle = `rgba(255, 79, 163, ${0.35 + Math.sin(now * 12) * 0.18})`;
        ctx.lineWidth = 12;
        ctx.strokeRect(8, 8, WIDTH - 16, HEIGHT - 16);
      }
      ctx.restore();
    }

    drawBackground(now) {
      const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      grad.addColorStop(0, "#21145f");
      grad.addColorStop(0.45 + Math.sin(now * 0.3) * 0.1, "#7d35ff");
      grad.addColorStop(1, "#ff4fa3");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      for (const star of this.stars) {
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255, 216, 77, 0.13)";
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(
          130 + i * 190 + Math.sin(now + i) * 24,
          120 + Math.cos(now * 0.8 + i) * 42,
          70,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }

    drawPlayer() {
      const { x, y } = this.player;
      ctx.save();
      ctx.translate(x, y);
      if (this.invulnerableTimer > 0) ctx.globalAlpha = 0.45 + Math.sin(this.elapsed * 24) * 0.25;
      ctx.fillStyle = "#241846";
      ctx.beginPath();
      ctx.roundRect(-36, 16, 72, 20, 8);
      ctx.fill();
      ctx.fillStyle = "#4de7ff";
      ctx.beginPath();
      ctx.moveTo(0, -38);
      ctx.lineTo(28, 24);
      ctx.lineTo(-28, 24);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff36d";
      ctx.beginPath();
      ctx.arc(0, -6, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawTarget() {
      const target = this.target;
      const image = this.getTargetImage();
      const size = this.getTargetSize();
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(target.spin);
      ctx.scale(target.scale, target.scale);
      if (target.golden) {
        ctx.fillStyle = "rgba(255, 216, 77, 0.32)";
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          target.radius + 18 + Math.sin(this.elapsed * 12) * 5,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      if (futaReady) {
        ctx.fillStyle = target.golden
          ? "rgba(255, 216, 77, 0.22)"
          : "rgba(255, 255, 255, 0.18)";
        ctx.beginPath();
        ctx.roundRect(
          -size.width / 2 - 8,
          -size.height / 2 - 8,
          size.width + 16,
          size.height + 16,
          18,
        );
        ctx.fill();
        ctx.drawImage(
          image,
          -size.width / 2,
          -size.height / 2,
          size.width,
          size.height,
        );
        ctx.strokeStyle = target.golden ? "#ffd84d" : "#ffffff";
        ctx.lineWidth = target.golden ? 6 : 3;
        ctx.beginPath();
        ctx.roundRect(
          -size.width / 2 - 8,
          -size.height / 2 - 8,
          size.width + 16,
          size.height + 16,
          18,
        );
        ctx.stroke();
      } else {
        ctx.fillStyle = target.golden ? "#ffd84d" : "#ff8fc9";
        ctx.beginPath();
        ctx.arc(0, 0, target.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#241846";
        ctx.beginPath();
        ctx.arc(-15, -8, 5, 0, Math.PI * 2);
        ctx.arc(15, -8, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#241846";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 9, 15, 0.1, Math.PI - 0.1);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawBullets() {
      for (const bullet of this.bullets) {
        ctx.fillStyle = "#fff36d";
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ff8c24";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    drawEnemyBullets() {
      for (const bullet of this.enemyBullets) {
        ctx.save();
        ctx.translate(bullet.x, bullet.y);
        ctx.rotate(bullet.spin);
        ctx.fillStyle = bullet.golden ? "#ffd84d" : "#ff4fa3";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(
          -bullet.radius,
          -bullet.radius,
          bullet.radius * 2,
          bullet.radius * 2,
          6,
        );
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#241846";
        ctx.beginPath();
        ctx.arc(-3, -2, 2, 0, Math.PI * 2);
        ctx.arc(4, -2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    drawItems() {
      for (const item of this.items) {
        const size = item.radius + Math.sin(item.pulse) * 3;
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#ffd84d";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.roundRect(-size, -size, size * 2, size * 2, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ff2f95";
        ctx.font = "900 15px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          item.type === "bonus" ? "BONUS" : POWER_NAMES[item.type].slice(0, 2),
          0,
          0,
        );
        ctx.restore();
      }
    }

    drawParticles() {
      for (const particle of this.particles) {
        ctx.globalAlpha = Math.max(0, particle.life * 1.7);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    drawPopups() {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const popup of this.popups) {
        ctx.globalAlpha = Math.max(0, popup.life);
        ctx.fillStyle = popup.golden ? "#ffd84d" : "#ffffff";
        ctx.strokeStyle = "#241846";
        ctx.lineWidth = 5;
        ctx.font = "900 28px sans-serif";
        ctx.strokeText(popup.text, popup.x, popup.y);
        ctx.fillText(popup.text, popup.x, popup.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function updateSoundLabels() {
    const text = game.sound.enabled ? "SOUND ON" : "SOUND OFF";
    ui.soundTitle.textContent = text;
    ui.soundGame.textContent = text;
  }

  const game = new Game();
  updateSoundLabels();
})();
