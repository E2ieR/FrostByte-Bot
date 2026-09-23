// utils/rankCard.js
// Rank Card generator — ต้องติดตั้ง: npm install @napi-rs/canvas
// XP Formula (MEE6-style): xpNeeded(n) = 5*n^2 + 50*n + 100

const path = require('path');

// ── XP helpers ────────────────────────────────────────────────────────────
function xpNeeded(level) {
    return 5 * level * level + 50 * level + 100;
}

function totalXpToLevel(level) {
    let total = 0;
    for (let i = 0; i < level; i++) total += xpNeeded(i);
    return total;
}

// คำนวณ level จาก total XP สะสม
function calcLevel(totalXp) {
    let level = 0;
    let spent = 0;
    while (true) {
        const needed = xpNeeded(level);
        if (spent + needed > totalXp) break;
        spent += needed;
        level++;
    }
    const currentLevelXp = totalXp - spent;
    const neededForNext  = xpNeeded(level);
    return { level, currentLevelXp, neededForNext };
}

// ── Rank Card ─────────────────────────────────────────────────────────────
async function generateRankCard({
    username, avatarURL, xp, level, rank, currentLevelXp, neededForNext,
    accentColor = '#5865F2',
    bg1 = '#0f0f17', bg2 = '#1a1a2e',
    bgImage = '',
    footerText = ''
}) {
    let canvas, createCanvas, loadImage, GlobalFonts;
    try {
        ({ createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas'));
    } catch {
        return null;
    }

    const W = 934, H = footerText ? 310 : 282;
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');

    // ── Background ─────────────────────────────────────────
    ctx.save();
    roundRect(ctx, 0, 0, W, H, 20);
    ctx.clip();

    if (bgImage) {
        try {
            const imgBg = await loadImage(bgImage);
            ctx.drawImage(imgBg, 0, 0, W, H);
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(0, 0, W, H);
        } catch {
            const bgGrad = ctx.createLinearGradient(0, 0, W, H);
            bgGrad.addColorStop(0, bg1);
            bgGrad.addColorStop(1, bg2);
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);
        }
    } else {
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, bg1);
        bgGrad.addColorStop(1, bg2);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    // ── Subtle grid overlay ────────────────────────────────
    if (!bgImage) {
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }

    // ── Accent bar (left edge) ─────────────────────────────
    const accentGrad = ctx.createLinearGradient(0, 0, 0, H);
    accentGrad.addColorStop(0, accentColor);
    accentGrad.addColorStop(1, adjustColor(accentColor, -50));
    ctx.fillStyle = accentGrad;
    roundRect(ctx, 0, 0, 6, H, [20, 0, 0, 20]);
    ctx.fill();

    // ── Avatar ────────────────────────────────────────────
    const avatarX = 44, avatarY = H / 2, avatarR = 95;
    // Glow
    ctx.save();
    ctx.shadowColor = accentColor;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(avatarX + avatarR, avatarY, avatarR + 4, 0, Math.PI * 2);
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // Avatar image
    try {
        const img = await loadImage(avatarURL);
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarR, avatarY, avatarR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, avatarX, avatarY - avatarR, avatarR * 2, avatarR * 2);
        ctx.restore();
    } catch {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + avatarR, avatarY, avatarR, 0, Math.PI * 2);
        ctx.fillStyle = '#2b2d31';
        ctx.fill();
        ctx.restore();
    }

    // ── Text area (right of avatar) ───────────────────────
    const textX = avatarX + avatarR * 2 + 30;
    const textW = W - textX - 30;

    // RANK badge
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`RANK`, W - 210, 56);
    ctx.font = 'bold 46px sans-serif';
    ctx.fillStyle = accentColor;
    ctx.fillText(`#${rank}`, W - 168, 60);

    // Username
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = '#ffffff';
    const maxUNameW = textW - 140;
    let uname = username;
    while (ctx.measureText(uname).width > maxUNameW && uname.length > 1) uname = uname.slice(0, -1);
    if (uname !== username) uname += '…';
    ctx.fillText(uname, textX, 76);

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(textX, 90); ctx.lineTo(W - 30, 90); ctx.stroke();

    // XP text
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`XP: ${currentLevelXp.toLocaleString()} / ${neededForNext.toLocaleString()}`, textX, 126);

    // LEVEL label
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('LEVEL', W - 170, 126);
    ctx.font = 'bold 48px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${level}`, W - 120, 132);

    // ── XP Bar ────────────────────────────────────────────
    const barX = textX, barY = 148, barW = textW, barH = 28, barR = 14;
    const progress = neededForNext > 0 ? Math.min(currentLevelXp / neededForNext, 1) : 0;

    // Bar background
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, barX, barY, barW, barH, barR);
    ctx.fill();

    // Bar fill
    if (progress > 0) {
        const fillW = Math.max(barR * 2, barW * progress);
        const fillGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        fillGrad.addColorStop(0, adjustColor(accentColor, -30));
        fillGrad.addColorStop(1, accentColor);
        ctx.fillStyle = fillGrad;
        roundRect(ctx, barX, barY, fillW, barH, barR);
        ctx.fill();

        // Shine
        const shine = ctx.createLinearGradient(barX, barY, barX, barY + barH);
        shine.addColorStop(0, 'rgba(255,255,255,0.18)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        roundRect(ctx, barX, barY, fillW, barH / 2, [barR, barR, 0, 0]);
        ctx.fill();
    }

    // Percent inside bar
    const pct = Math.round(progress * 100);
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${pct}%`, barX + barW / 2, barY + barH - 7);
    ctx.textAlign = 'left';

    // Total XP label
    ctx.font = '15px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(`Total XP: ${xp.toLocaleString()}`, textX, barY + barH + 22);

    // ── Footer text ───────────────────────────────────────
    if (footerText) {
        const fy = 282 + 20;
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(0, 282, W, 28);
        ctx.font = '13px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.textAlign = 'center';
        ctx.fillText(footerText, W / 2, fy);
        ctx.textAlign = 'left';
    }

    return cv.toBuffer('image/png');
}

// ── Helpers ───────────────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    const [tl, tr, br, bl] = r;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y); ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h); ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl); ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
}

function adjustColor(hex, amount) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amount));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amount));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

module.exports = { xpNeeded, totalXpToLevel, calcLevel, generateRankCard };
