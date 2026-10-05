"use client";

import { MotionGlobalConfig } from "motion/react";
import { useEffect, useRef } from "react";
import { CROWD_SPRITES, FIREWORK_MONO, FIREWORK_SPRITES, SHOOTING_STARS, SPARKLE_MONO, SPARKLE_SPRITES, WALKER_SPRITES } from "./festivalArt";
import { applyFestival, FESTIVAL_STOPS, type FestivalState } from "./festivalTheme";

// 축제 무대(장식 캔버스) — 고객 화면 콘텐츠 "뒤"에서만 그린다(z-0, 콘텐츠는 z-10). 화면 읽기 프로그램에는 숨긴다.
// 휴대폰 시각에 따라 강도가 바뀐다(festivalTheme): 14:30 불꽃놀이 등장 → 17:00 최고조 → 밤에는 가끔.
// 불꽃·반짝이·별똥별·군중은 Flaticon 그림(festivalArt)을 스프라이트로 쓰고, 그 위에 불티 입자를 더한다.
// 동작 줄이기 설정이면 움직이지 않는 한 장면만 그린다. 탭이 숨으면 멈춘다.

type Spark = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    max: number;
    color: string;
    size: number;
    glitter: boolean;
    gravity: number;
    drag: number;
};
type Rocket = { x: number; y: number; vy: number; vx: number; peakY: number; color: string; scale: number };
// 그림 불꽃: 터진 자리에서 확 피었다가 천천히 흘러내리며 사라진다
type Bloom = { img: CanvasImageSource; x: number; y: number; size: number; life: number; max: number; rot: number; spin: number };
type Glint = { img: CanvasImageSource | null; x: number; y: number; life: number; max: number; size: number; rot: number };
type Shooting = { img: CanvasImageSource; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; flip: boolean };
type Dust = { x: number; y: number; vy: number; phase: number; size: number };
type Person = { sprite: number; x: number; front: boolean; h: number; phase: number; speed: number; jump: boolean; phone: boolean; flip: boolean };

const FIREWORK_COLORS = ["#ffd27a", "#ffb547", "#ff8a4c", "#ff6a55", "#fff3c9", "#ffc0d9", "#9fe3ff"];
const MAX_PEOPLE = 44;
const CLOCK_MS = 30_000;

function makeCrowd(): Person[] {
    // 위치·키·걸음은 매번 조금씩 다르게(랜덤). 앞쪽 사람부터 보이도록 섞어 두고, 군중 값만큼 앞에서부터 그린다.
    return Array.from({ length: MAX_PEOPLE }, (_, index) => {
        const front = index % 5 < 2;
        const walker = Math.random() < 0.16;
        return {
            sprite: walker ? -1 - Math.floor(Math.random() * WALKER_SPRITES.length) : Math.floor(Math.random() * CROWD_SPRITES.length),
            x: Math.random(),
            front,
            // 앞줄 머리가 하단 행동 바 위로 살짝 보일 만큼의 키
            h: front ? 84 + Math.random() * 30 : 62 + Math.random() * 20,
            phase: Math.random() * Math.PI * 2,
            speed: walker ? (Math.random() < 0.5 ? -1 : 1) * (0.012 + Math.random() * 0.018) : 0,
            jump: !walker && Math.random() < 0.25,
            phone: Math.random() < 0.3,
            flip: Math.random() < 0.5,
        };
    }).sort(() => Math.random() - 0.5);
}

function loadImage(src: string): HTMLImageElement {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
    return img;
}

const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;

// 검정 그림을 원하는 색으로 칠한 사본(선택하면 바깥에 불빛 테두리까지 미리 구워 둔다 — 매 프레임 그림자 계산을 피함)
function tintSprite(img: HTMLImageElement, color: string, glow: string | null, size: number): HTMLCanvasElement {
    const pad = glow ? 10 : 0;
    const canvas = document.createElement("canvas");
    canvas.width = size + pad * 2;
    canvas.height = size + pad * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    const solid = document.createElement("canvas");
    solid.width = size;
    solid.height = size;
    const sctx = solid.getContext("2d");
    if (!sctx) return canvas;
    sctx.drawImage(img, 0, 0, size, size);
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = color;
    sctx.fillRect(0, 0, size, size);
    if (glow) {
        ctx.shadowColor = glow;
        ctx.shadowBlur = 9;
        ctx.shadowOffsetY = -2;
    }
    ctx.drawImage(solid, pad, pad);
    return canvas;
}

export function FestivalStage() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const state = useRef<FestivalState>({ p: 1.6, fx: 0.35, crowd: 0.55, ember: 1, daylight: false });
    // 실루엣 색·불빛 테두리 색(시간대) — 바뀌면 군중 스프라이트를 다시 칠한다
    const palette = useRef({ sil: "rgba(10,8,12,0.95)", horizon: "rgba(240,120,40,0.28)" });

    // 휴대폰 시각 → 색·강도. 30초마다, 그리고 화면으로 돌아올 때 다시 계산한다.
    useEffect(() => {
        const root = document.documentElement;
        const tick = () => {
            state.current = applyFestival(FESTIVAL_STOPS);
            palette.current = {
                sil: root.style.getPropertyValue("--fest-sil") || palette.current.sil,
                horizon: root.style.getPropertyValue("--fest-horizon") || palette.current.horizon,
            };
        };
        tick();
        // 첫 계산 뒤부터는 색이 바뀔 때 부드럽게 전환(globals.css html[data-fest-anim])
        const raf = requestAnimationFrame(() => root.setAttribute("data-fest-anim", ""));
        const timer = setInterval(tick, CLOCK_MS);
        const onVisible = () => {
            if (!document.hidden) tick();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelAnimationFrame(raf);
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        // 단위 테스트(jsdom)에는 캔버스가 없다 — 애니메이션을 끈 환경에서는 그리지 않는다.
        if (!canvas || MotionGlobalConfig.skipAnimations) return;
        const context = canvas.getContext("2d");
        if (!context) return;
        const ctx = context;
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

        let width = 0;
        let height = 0;
        const resize = () => {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        resize();
        window.addEventListener("resize", resize);

        // 그림은 필요해질 때(축제 이펙트·군중이 보이기 시작할 때) 한 번만 받는다
        let fireworkImgs: HTMLImageElement[] = [];
        let monoImgs: HTMLImageElement[] = [];
        let sparkleImgs: HTMLImageElement[] = [];
        let sparkleMono: HTMLImageElement | null = null;
        let shootingImgs: HTMLImageElement[] = [];
        let crowdImgs: HTMLImageElement[] = [];
        let walkerImgs: HTMLImageElement[] = [];
        const ensureFx = () => {
            if (fireworkImgs.length) return;
            fireworkImgs = FIREWORK_SPRITES.map(loadImage);
            monoImgs = FIREWORK_MONO.map(loadImage);
            sparkleImgs = SPARKLE_SPRITES.map(loadImage);
            sparkleMono = loadImage(SPARKLE_MONO);
            shootingImgs = SHOOTING_STARS.map(loadImage);
        };
        const ensureCrowd = () => {
            if (crowdImgs.length) return;
            crowdImgs = CROWD_SPRITES.map(loadImage);
            walkerImgs = WALKER_SPRITES.map(loadImage);
        };
        // 칠한 사본 캐시: 단색 불꽃(색별), 반짝이(밤/낮), 군중(시간대 색)
        const monoTints = new Map<string, HTMLCanvasElement>();
        let crowdTintKey = "";
        let crowdTints: (HTMLCanvasElement | null)[] = [];
        let walkerTints: (HTMLCanvasElement | null)[] = [];
        const monoTint = (img: HTMLImageElement, color: string) => {
            const key = img.src + color;
            let tinted = monoTints.get(key);
            if (!tinted) {
                tinted = tintSprite(img, color, null, 256);
                monoTints.set(key, tinted);
            }
            return tinted;
        };
        const refreshCrowdTints = (s: FestivalState) => {
            const glow = s.daylight ? null : palette.current.horizon;
            const key = palette.current.sil + glow;
            const allReady = crowdImgs.every(ready) && walkerImgs.every(ready);
            if (key === crowdTintKey && crowdTints.length && allReady) return;
            crowdTints = crowdImgs.map((img) => (ready(img) ? tintSprite(img, palette.current.sil, glow, 144) : null));
            walkerTints = walkerImgs.map((img) => (ready(img) ? tintSprite(img, palette.current.sil, glow, 120) : null));
            if (allReady) crowdTintKey = key;
        };

        const crowd = makeCrowd();
        const sparks: Spark[] = [];
        const rockets: Rocket[] = [];
        const blooms: Bloom[] = [];
        const glints: Glint[] = [];
        const shootings: Shooting[] = [];
        const dust: Dust[] = [];
        const flashes: { x: number; y: number; life: number; r: number }[] = [];
        let last = performance.now();
        let frame = 0;
        let running = true;

        const launch = (fx: number) => {
            // 휴대폰에서는 카드가 폭을 거의 채우므로 주로 위쪽(제목 옆 빈 하늘)에서 터지게 하고, 가끔 더 낮게도 터진다.
            // 왼쪽 위는 메뉴판 머리 글씨(대동제 표시·제목·부제) 자리라 대부분 오른쪽 하늘에서 터지게 하고,
            // 가끔 왼쪽에서 터질 때는 카드 뒤 낮은 곳에서 터져 은은하게만 비치게 한다(글씨 뒤 불꽃 금지).
            const left = Math.random() < 0.2;
            const x = left ? width * (0.04 + Math.random() * 0.3) : width * (0.62 + Math.random() * 0.34);
            const peakY = left
                ? height * (0.4 + Math.random() * 0.2)
                : height * (Math.random() < 0.75 ? 0.06 + Math.random() * 0.22 : 0.3 + Math.random() * 0.25);
            rockets.push({
                x,
                y: height + 10,
                vx: (Math.random() - 0.5) * 0.6,
                // 중력(0.12)으로 감속해 딱 peakY 근처에서 멈추는 초속
                vy: -Math.sqrt(2 * 0.12 * (height + 10 - peakY)) * 1.03,
                peakY,
                color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)],
                scale: 0.6 + fx * 0.5 + Math.random() * 0.3,
            });
        };

        const pushSpark = (x: number, y: number, angle: number, speed: number, color: string, extra: Partial<Spark> = {}) =>
            sparks.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0,
                max: 55 + Math.random() * 35,
                color,
                size: 1.2 + Math.random() * 1.4,
                glitter: Math.random() < 0.35,
                gravity: 0.045,
                drag: 0.975,
                ...extra,
            });

        // 터지는 모양은 매번 랜덤: 그림 불꽃(9종 + 단색 2종을 랜덤 색으로) 또는 입자 불꽃(국화·링·버드나무·이중)
        const burst = (rocket: Rocket) => {
            const { x, y, scale } = rocket;
            const sprites = fireworkImgs.filter(ready);
            const monos = monoImgs.filter(ready);
            const useSprite = sprites.length > 0 && Math.random() < 0.6;
            if (useSprite) {
                const mono = monos.length > 0 && Math.random() < 0.2;
                const img = mono ? monoTint(monos[Math.floor(Math.random() * monos.length)], rocket.color) : sprites[Math.floor(Math.random() * sprites.length)];
                blooms.push({ img, x, y, size: (84 + Math.random() * 64) * scale, life: 0, max: 100 + Math.random() * 40, rot: (Math.random() - 0.5) * 0.6, spin: (Math.random() - 0.5) * 0.004 });
                // 그림 둘레로 반짝이는 불티를 조금 흩뿌려 살아 움직이게
                for (let i = 0; i < 22; i++) pushSpark(x, y, Math.random() * Math.PI * 2, (1 + Math.random() * 2.4) * scale, rocket.color, { glitter: true, size: 1.1 });
                // 가끔 옆에서 작은 꽃이 하나 더 터진다
                if (Math.random() < 0.35) {
                    const img2 = sprites[Math.floor(Math.random() * sprites.length)];
                    const a = Math.random() * Math.PI * 2;
                    blooms.push({ img: img2, x: x + Math.cos(a) * 60 * scale, y: y + Math.sin(a) * 40 * scale, size: 70 * scale, life: -14, max: 90, rot: 0, spin: 0.003 });
                }
            } else {
                const kind = Math.random();
                const second = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
                const count = Math.round(34 + scale * 40);
                if (kind < 0.4) {
                    for (let i = 0; i < count; i++) pushSpark(x, y, (i / count) * Math.PI * 2 + Math.random() * 0.2, (1.8 + Math.random() * 2.8) * scale, i % 3 === 0 ? second : rocket.color);
                } else if (kind < 0.62) {
                    for (let i = 0; i < count; i++) pushSpark(x, y, (i / count) * Math.PI * 2, 3.1 * scale, rocket.color, { size: 1.6, glitter: false });
                } else if (kind < 0.84) {
                    for (let i = 0; i < count; i++)
                        pushSpark(x, y, (i / count) * Math.PI * 2 + Math.random() * 0.3, (1.4 + Math.random() * 2.2) * scale, i % 2 ? "#ffd27a" : "#ffb547", {
                            max: 100 + Math.random() * 50,
                            gravity: 0.06,
                            drag: 0.965,
                            glitter: true,
                        });
                } else {
                    for (let i = 0; i < count; i++) pushSpark(x, y, (i / count) * Math.PI * 2, 3.4 * scale, rocket.color, { glitter: false });
                    for (let i = 0; i < count / 2; i++) pushSpark(x, y, (i / (count / 2)) * Math.PI * 2 + 0.2, 1.7 * scale, second, { size: 1.8 });
                }
            }
            flashes.push({ x, y, life: 0, r: 70 * scale });
            // 터진 자리 둘레에 별빛(반짝이 그림)이 잠깐 반짝인다
            for (let i = 0; i < 4; i++) {
                const a = Math.random() * Math.PI * 2;
                const d = 40 + Math.random() * 70 * scale;
                glints.push({ img: pickSparkle(), x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, life: -Math.random() * 30, max: 40, size: 14 + Math.random() * 14, rot: Math.random() });
            }
        };

        const pickSparkle = (): CanvasImageSource | null => {
            const s = state.current;
            const gold = sparkleImgs.filter(ready);
            if (sparkleMono && ready(sparkleMono) && Math.random() < 0.45) return monoTint(sparkleMono, s.daylight ? "#e0761f" : "#fff3c9");
            return gold.length ? gold[Math.floor(Math.random() * gold.length)] : null;
        };

        const launchShooting = () => {
            const imgs = shootingImgs.filter(ready);
            if (!imgs.length) return;
            // 별 그림은 오른쪽 위를 향한다 — 왼쪽 아래에서 오른쪽 위로, 또는 뒤집어 반대로 가로지른다
            const flip = Math.random() < 0.5;
            const size = 64 + Math.random() * 40;
            const speed = 5 + Math.random() * 3;
            shootings.push({
                img: imgs[Math.floor(Math.random() * imgs.length)],
                x: flip ? width + size : -size,
                y: height * (0.12 + Math.random() * 0.22),
                vx: flip ? -speed : speed,
                vy: -speed * 0.38,
                life: 0,
                max: Math.ceil((width + size * 2) / speed),
                size,
                flip,
            });
        };

        const drawSprite = (img: CanvasImageSource, x: number, y: number, size: number, rot = 0, flip = false) => {
            ctx.save();
            ctx.translate(x, y);
            if (rot) ctx.rotate(rot);
            if (flip) ctx.scale(-1, 1);
            ctx.drawImage(img, -size / 2, -size / 2, size, size);
            ctx.restore();
        };

        const render = (now: number) => {
            const s = state.current;
            // 60fps 기준 배수. 화면 복귀 직후 rAF 시각이 last보다 이를 수 있어 0 아래로는 내리지 않는다.
            const dt = Math.max(0, Math.min(3, (now - last) / 16.67));
            last = Math.max(last, now);
            const t = now / 1000;
            ctx.clearRect(0, 0, width, height);
            if (s.fx > 0.02) ensureFx();
            if (s.crowd > 0.02) ensureCrowd();
            const night = !s.daylight;

            // 1) 가장자리 숯불 glow — 축제가 무르익을수록 진하고 은은하게 숨쉰다
            if (s.fx > 0.02) {
                const pulse = 0.75 + Math.sin(t * 1.3) * 0.25;
                for (const [gx, gy] of [[0, height], [width, height], [width * 0.5, -40]] as const) {
                    const radius = Math.max(width, height) * 0.55;
                    const gradient = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
                    gradient.addColorStop(0, `rgba(255,120,40,${(0.22 * s.fx * pulse).toFixed(3)})`);
                    gradient.addColorStop(1, "rgba(255,120,40,0)");
                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, 0, width, height);
                }
            }

            // 1-1) 무대 조명: 아래 양쪽 모서리에서 빛기둥이 천천히 좌우로 훑는다(어두운 시간대, 축제가 무르익을수록)
            if (night && s.fx > 0.3) {
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                const strength = (s.fx - 0.3) / 0.7;
                const length = height * 1.1;
                const spread = 0.13;
                for (const [index, ox] of [0, width].entries()) {
                    const sway = reduced ? 0 : Math.sin(t * 0.35 + index * 2.1) * 0.35;
                    const angle = (index === 0 ? -Math.PI / 2 + 0.45 : -Math.PI / 2 - 0.45) + sway;
                    const beam = ctx.createLinearGradient(ox, height, ox + Math.cos(angle) * length, height + Math.sin(angle) * length);
                    beam.addColorStop(0, `rgba(255,190,110,${(0.09 * strength).toFixed(3)})`);
                    beam.addColorStop(1, "rgba(255,190,110,0)");
                    ctx.fillStyle = beam;
                    ctx.beginPath();
                    ctx.moveTo(ox, height);
                    ctx.lineTo(ox + Math.cos(angle - spread) * length, height + Math.sin(angle - spread) * length);
                    ctx.lineTo(ox + Math.cos(angle + spread) * length, height + Math.sin(angle + spread) * length);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
            }

            // 2) 떠다니는 빛 입자
            const dustTarget = Math.round(42 * s.fx + 8 * s.crowd * (s.daylight ? 0.4 : 1));
            while (dust.length < dustTarget) dust.push({ x: Math.random() * width, y: height + Math.random() * height * 0.3, vy: 0.2 + Math.random() * 0.5, phase: Math.random() * 6, size: 0.8 + Math.random() * 1.8 });
            if (dust.length > dustTarget) dust.length = dustTarget;
            for (const d of dust) {
                d.y -= d.vy * dt;
                d.x += Math.sin(t * 0.8 + d.phase) * 0.25 * dt;
                if (d.y < -10) {
                    d.y = height + 10;
                    d.x = Math.random() * width;
                }
                const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + d.phase));
                ctx.fillStyle = s.daylight ? `rgba(240,130,60,${(0.35 * twinkle).toFixed(3)})` : `rgba(255,214,150,${(0.7 * twinkle).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
                ctx.fill();
            }

            // 3) 별똥별(어두운 하늘에서 가끔 가로지른다)
            if (!reduced && s.p >= 0.9 && s.fx > 0.25 && Math.random() < 0.12 * s.fx * (dt / 60)) launchShooting();
            for (let i = shootings.length - 1; i >= 0; i--) {
                const star = shootings[i];
                star.life += dt;
                star.x += star.vx * dt;
                star.y += star.vy * dt;
                if (star.life >= star.max) {
                    shootings.splice(i, 1);
                    continue;
                }
                const k = Math.min(1, star.life / 12, (star.max - star.life) / 20);
                ctx.save();
                ctx.globalAlpha = Math.max(0, k);
                drawSprite(star.img, star.x, star.y, star.size, 0, star.flip);
                ctx.restore();
                // 꼬리에 흩날리는 작은 별가루
                if (Math.random() < 0.6) sparks.push({ x: star.x - star.vx * 4, y: star.y - star.vy * 4, vx: -star.vx * 0.05, vy: 0.3, life: 0, max: 30, color: "#fff3c9", size: 1, glitter: true, gravity: 0.01, drag: 0.98 });
            }

            // 4) 불꽃놀이: 빈도·크기는 fx에 비례, 터지는 위치·색·모양은 매번 랜덤
            // 초당 발사 수: 14:30쯤 15초에 한 번 → 15:30 2.5초에 한 번 → 17:00 초당 0.65발 → 밤에는 가끔
            if (!reduced && s.fx > 0.05 && Math.random() < 0.65 * Math.pow(s.fx, 1.2) * (dt / 60)) launch(s.fx);
            for (let i = rockets.length - 1; i >= 0; i--) {
                const r = rockets[i];
                r.x += r.vx * dt;
                r.y += r.vy * dt;
                r.vy += 0.12 * dt;
                // 올라가는 꼬리
                sparks.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 0.4, vy: 0.6, life: 0, max: 18, color: "#ffd27a", size: 1.1, glitter: false, gravity: 0.045, drag: 0.975 });
                if (r.y <= r.peakY || r.vy >= -1) {
                    burst(r);
                    rockets.splice(i, 1);
                }
            }
            for (let i = flashes.length - 1; i >= 0; i--) {
                const f = flashes[i];
                f.life += dt;
                const k = 1 - f.life / 18;
                if (k <= 0) {
                    flashes.splice(i, 1);
                    continue;
                }
                const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (1.4 - k * 0.4));
                g.addColorStop(0, `rgba(255,240,200,${(0.5 * k).toFixed(3)})`);
                g.addColorStop(1, "rgba(255,200,120,0)");
                ctx.fillStyle = g;
                ctx.fillRect(f.x - f.r * 2, f.y - f.r * 2, f.r * 4, f.r * 4);
            }

            ctx.save();
            ctx.globalCompositeOperation = night ? "lighter" : "source-over";
            // 그림 불꽃: 0.4초 만에 확 피고(ease-out) 천천히 커지며 흘러내리다 사라진다
            for (let i = blooms.length - 1; i >= 0; i--) {
                const b = blooms[i];
                b.life += dt;
                if (b.life >= b.max) {
                    blooms.splice(i, 1);
                    continue;
                }
                if (b.life < 0) continue;
                const u = b.life / b.max;
                const open = 1 - Math.pow(1 - Math.min(1, b.life / 24), 3);
                const scale = 0.2 + open * 0.8 + u * 0.12;
                const alpha = u < 0.45 ? 1 : 1 - (u - 0.45) / 0.55;
                b.rot += b.spin * dt;
                b.y += 0.12 * dt * u;
                ctx.globalAlpha = Math.max(0, alpha) * (night ? 1 : 0.85);
                drawSprite(b.img, b.x, b.y, b.size * scale, b.rot);
            }
            for (let i = sparks.length - 1; i >= 0; i--) {
                const p = sparks[i];
                p.life += dt;
                if (p.life >= p.max) {
                    sparks.splice(i, 1);
                    continue;
                }
                p.vx *= Math.pow(p.drag, dt);
                p.vy = p.vy * Math.pow(p.drag, dt) + p.gravity * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                const alpha = (1 - p.life / p.max) * (p.glitter ? 0.5 + 0.5 * Math.sin(p.life * 0.9) : 1);
                ctx.fillStyle = p.color;
                // 은은한 빛무리 + 또렷한 심지
                ctx.globalAlpha = Math.max(0, alpha) * 0.22;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * 3.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = Math.max(0, alpha);
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            // 반짝이(그림): 불꽃 둘레 + 가장자리·위쪽에 가끔 저절로 — 커졌다 작아지며 살짝 돈다
            if (!reduced && s.fx > 0.05 && Math.random() < 1.4 * s.fx * (dt / 60)) {
                const edge = Math.random() < 0.5;
                glints.push({
                    img: pickSparkle(),
                    x: edge ? (Math.random() < 0.5 ? Math.random() * width * 0.12 : width * (0.88 + Math.random() * 0.12)) : Math.random() * width,
                    y: edge ? Math.random() * height * 0.8 : Math.random() * height * 0.25,
                    life: 0,
                    max: 46,
                    size: 12 + Math.random() * 14,
                    rot: Math.random(),
                });
            }
            for (let i = glints.length - 1; i >= 0; i--) {
                const g = glints[i];
                g.life += dt;
                if (g.life >= g.max) {
                    glints.splice(i, 1);
                    continue;
                }
                if (g.life < 0 || !g.img) continue;
                const k = Math.sin((g.life / g.max) * Math.PI);
                ctx.globalAlpha = k;
                drawSprite(g.img, g.x, g.y, g.size * (0.4 + k * 0.6), g.rot + g.life * 0.03);
            }
            ctx.restore();

            // 5) 군중 실루엣(아래쪽) — 시간이 갈수록 사람이 늘고, 몇 명은 지나가고 몇 명은 폴짝 뛴다
            const visible = Math.round(MAX_PEOPLE * s.crowd);
            if (visible > 0 && crowdImgs.length) {
                refreshCrowdTints(s);
                const base = height + 6;
                ctx.save();
                // 본문 카드가 살짝 비치므로 아래 군중은 한 톤 옅게
                ctx.globalAlpha = s.daylight ? 0.8 : 0.72;
                for (const front of [false, true]) {
                    for (let i = 0; i < visible; i++) {
                        const person = crowd[i];
                        if (person.front !== front) continue;
                        const sprite = person.sprite >= 0 ? crowdTints[person.sprite] : walkerTints[-1 - person.sprite];
                        if (!sprite) continue;
                        if (!reduced && person.speed) {
                            person.x += person.speed * (dt / 60);
                            if (person.x > 1.08) person.x = -0.08;
                            if (person.x < -0.08) person.x = 1.08;
                        }
                        const time = reduced ? 0 : t;
                        const hop = person.jump ? Math.max(0, Math.sin(time * 4.2 + person.phase)) * 9 : 0;
                        const bob = Math.sin(time * (person.speed ? 9 : 2.2) + person.phase) * (person.speed ? 1.6 : 1.2);
                        const h = person.h;
                        const x = person.x * width;
                        const y = (front ? base : base - 22) - h / 2 - hop + bob;
                        // 칠한 사본에는 불빛 테두리 여백이 있어 그만큼 크게 그린다
                        const drawn = h * (sprite.width / (sprite.width - (s.daylight ? 0 : 20)));
                        drawSprite(sprite, x, y, drawn, 0, person.speed ? person.speed < 0 : person.flip);
                        if (night && person.phone && s.fx > 0.2) {
                            // 휴대폰 불빛(밤)
                            const glow = 0.5 + Math.sin(time * 3 + person.phase) * 0.3;
                            ctx.fillStyle = `rgba(255,236,190,${(glow * s.fx).toFixed(3)})`;
                            ctx.fillRect(x + h * 0.16, y - h * 0.42, 3, 4.5);
                        }
                    }
                }
                ctx.restore();
            }

            if (running && !reduced) frame = requestAnimationFrame(render);
        };
        frame = requestAnimationFrame(render);
        // 동작 줄이기: 한 장면만 그리므로 그림이 다 받아진 뒤 한 번 더 그린다
        const settle = reduced ? window.setTimeout(() => render(performance.now()), 1500) : 0;

        const onVisibility = () => {
            if (document.hidden) {
                running = false;
                cancelAnimationFrame(frame);
            } else if (!running) {
                running = true;
                last = performance.now();
                frame = requestAnimationFrame(render);
            }
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            running = false;
            cancelAnimationFrame(frame);
            window.clearTimeout(settle);
            window.removeEventListener("resize", resize);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, []);

    return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 size-full" />;
}
