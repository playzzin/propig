// Original, silent brand motion studies. No external stock media or paid generation.
// Run with an installed Chromium browser and the repository's ffmpeg-static package.
import { chromium } from 'playwright-core';
import ffmpeg from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('public/videos/corp');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const [channel, width, height] of [['youtube', 1280, 720], ['tiktok', 720, 1280]]) {
    const page = await browser.newPage();
    await page.setContent(`<canvas width="${width}" height="${height}"></canvas>`);
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const g = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height, tall = h > w;
      const C = { paper: '#f1f0e8', ink: '#102923', lime: '#d9f279', peach: '#e7a68d', mint: '#83d4c2' };
      const ease = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 4);
      const rect = (x, y, width, height, radius, fill) => {
        g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, width, height, radius); g.fill();
      };
      const text = (value, x, y, size, color = C.ink, weight = 600, family = 'Arial, "Malgun Gothic", sans-serif') => {
        g.fillStyle = color; g.font = `${weight} ${size}px ${family}`; g.fillText(value, x, y);
      };
      const line = (x1, y1, x2, y2, color, size = 1) => {
        g.strokeStyle = color; g.lineWidth = size; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      };
      const circle = (x, y, radius, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2); g.fill(); };
      function orbit(x, y, scale, t, ink) {
        g.save(); g.translate(x, y); g.rotate(-.48 + Math.sin(t * .6) * .16); g.scale(scale, scale);
        for (let i = 0; i < 17; i++) {
          const k = i / 16;
          g.strokeStyle = ink ? `rgba(16,41,35,${.12 + k * .62})` : `rgba(241,240,232,${.12 + k * .62})`;
          g.lineWidth = 4; g.beginPath(); g.ellipse(0, (i - 8) * 4.7, 220, 78, 0, 0, Math.PI * 2); g.stroke();
        }
        const angle = t * 1.5;
        circle(Math.cos(angle) * 220, Math.sin(angle) * 78, 12, C.peach);
        g.restore();
      }
      function bottle(x, y, scale, t) {
        g.save(); g.translate(x, y + Math.sin(t * 2.1) * 9); g.rotate(Math.sin(t) * .065); g.scale(scale, scale);
        g.shadowColor = '#10292350'; g.shadowBlur = 42; g.shadowOffsetY = 35;
        const glass = g.createLinearGradient(-96, 0, 96, 0);
        glass.addColorStop(0, '#677d6b'); glass.addColorStop(.08, '#f5f5d9'); glass.addColorStop(.22, '#bfcda0'); glass.addColorStop(.57, '#e9efbd'); glass.addColorStop(.88, '#839b70'); glass.addColorStop(1, '#344a37');
        rect(-90, -132, 180, 290, 35, glass);
        g.shadowColor = 'transparent';
        const cap = g.createLinearGradient(-58, 0, 58, 0);
        cap.addColorStop(0, '#08201a'); cap.addColorStop(.4, '#456653'); cap.addColorStop(1, '#081a16');
        rect(-58, -191, 116, 68, 8, cap);
        for (let i = -48; i < 56; i += 6) line(i, -184, i, -136, '#ffffff12');
        rect(-74, -46, 148, 131, 2, C.paper);
        text('PROPIG.', -58, -14, 22, C.ink, 800);
        line(-58, 0, 58, 0, '#10292350');
        text('STORIES', -58, 28, 22, C.ink, 500, 'Georgia, serif');
        text('MADE TO MOVE', -58, 55, 11, C.ink, 700);
        text('CREATIVE STUDY / 01', -58, 72, 8, C.ink, 500);
        line(-75, -100, -75, 119, '#ffffffa0', 4);
        g.restore();
      }
      function miniScreen(x, y, sw, sh, type, t) {
        g.save(); g.translate(x, y);
        g.shadowColor = '#00000030'; g.shadowBlur = 24; g.shadowOffsetY = 14;
        rect(0, 0, sw, sh, 12, C.paper); g.shadowColor = 'transparent';
        rect(8, 28, sw - 16, sh - 36, 7, type === 0 ? C.peach : type === 1 ? C.lime : C.mint);
        circle(14, 14, 3, '#10292350'); circle(24, 14, 3, '#10292330');
        text(['FILM / 16:9', 'SHORT / 9:16', 'STORY / 4:5'][type], 36, 17, 9, C.ink, 700);
        if (type === 0) bottle(sw / 2, sh * .6, Math.min(sw / 260, sh / 450), t);
        else if (type === 1) {
          g.save(); g.beginPath(); g.rect(8, 28, sw - 16, sh - 36); g.clip();
          text('MAKE', 20, sh * .4, sw * .19, C.ink, 900);
          text('IT', 20 + Math.sin(t) * 6, sh * .58, sw * .28, C.ink, 900);
          text('MOVE.', 20, sh * .76, sw * .19, C.ink, 900);
          g.restore();
        } else {
          orbit(sw / 2, sh * .52, sw / 570, t, true);
          text('Your next story.', 18, sh - 30, sw * .065, C.ink, 600);
        }
        rect(16, sh - 15, (sw - 32) * ((t % 3) / 3), 3, 1, C.ink);
        g.restore();
      }
      window.paintBrandFrame = (t) => {
        const shot = Math.min(3, Math.floor(t / 3)), q = t % 3, enter = ease(q / .7);
        const bg = [C.paper, C.peach, C.ink, C.lime][shot];
        g.globalAlpha = 1; g.fillStyle = bg; g.fillRect(0, 0, w, h);
        const light = shot === 2, ink = light ? C.paper : C.ink;
        // Quiet printing grid gives the motion study a physical, editorial finish.
        g.fillStyle = light ? '#ffffff0a' : '#1029230a';
        for (let x = 32; x < w; x += 32) for (let y = 32; y < h; y += 32) g.fillRect(x, y, 1, 1);
        text('PROPIG.', 44, 51, 24, ink, 800);
        text(tall ? 'MOTION STUDY' : 'IDEAS INTO IMPACT  /  MOTION STUDY', tall ? 441 : 902, 48, 12, ink, 600);
        line(44, 73, w - 44, 73, light ? '#f1f0e840' : '#10292340');
        g.save(); g.globalAlpha = enter; g.translate(0, (1 - enter) * 55);
        if (shot === 0) {
          if (tall) {
            text('Make it', 44, 270, 116, C.ink, 500, 'Georgia, serif');
            text('move.', 44, 399, 153, C.ink, 500, 'Georgia, serif');
            orbit(355, 775, 1.28, t, true);
            text('아이디어가 움직이기 시작하다.', 46, 1090, 29, C.ink, 700);
          } else {
            text('Make it', 56, 268, 124, C.ink, 500, 'Georgia, serif');
            text('move.', 56, 405, 168, C.ink, 500, 'Georgia, serif');
            orbit(916, 348, 1.13, t, true);
            text('아이디어가 움직이기 시작하다.', 60, 493, 27, C.ink, 700);
          }
        } else if (shot === 1) {
          const bx = tall ? 360 : 875, by = tall ? 734 : 386;
          circle(bx, by, tall ? 250 : 236, '#f1f0e84d');
          g.save(); g.translate(bx, by + (tall ? 222 : 175)); g.scale(1, .25); circle(0, 0, tall ? 260 : 235, '#102923'); g.restore();
          bottle(bx, by, tall ? 1.12 : .98, t);
          text('A new', 44, tall ? 251 : 243, tall ? 94 : 92, C.ink, 500, 'Georgia, serif');
          text('perspective.', 44, tall ? 355 : 345, tall ? 88 : 92, C.ink, 500, 'Georgia, serif');
          text('하나의 제품, 새로운 시선.', 48, tall ? 1103 : 460, 25, C.ink, 700);
          text('PRODUCT FILM  /  CREATIVE DIRECTION', 48, tall ? 1140 : 503, 12, C.ink, 600);
        } else if (shot === 2) {
          text('One story.', 44, tall ? 231 : 194, tall ? 87 : 73, C.paper, 500, 'Georgia, serif');
          text('Every channel.', 44, tall ? 331 : 280, tall ? 80 : 73, C.lime, 500, 'Georgia, serif');
          const sy = tall ? 457 : 355;
          const cards = tall ? [[41, sy + 76, 298, 241, 0], [362, sy, 315, 511, 1], [41, sy + 344, 298, 241, 2]] : [[60, sy + 36, 410, 230, 0], [539, sy - 39, 200, 306, 1], [808, sy + 2, 365, 264, 2]];
          line(80, sy + 152, w - 80, sy + 152, '#83d4c250', 2);
          cards.forEach(([x, y, sw, sh, type], i) => { g.save(); g.translate(0, Math.sin(t * 1.6 + i) * 9); miniScreen(x, y, sw, sh, type, t); g.restore(); });
          text('영상 · 숏폼 · 스토리, 채널에 맞게.', 46, tall ? 1124 : 650, 21, C.paper, 600);
        } else {
          if (tall) {
            text('Your next', 44, 260, 97, C.ink, 500, 'Georgia, serif');
            text('chapter.', 44, 379, 137, C.ink, 500, 'Georgia, serif');
            orbit(350, 739, 1.1, t, true);
            text('당신의 이야기, 다음 장면으로.', 44, 1071, 28, C.ink, 700);
            text('기획부터 제작, 채널별 콘텐츠까지.', 44, 1118, 21, C.ink, 500);
          } else {
            text('Your next', 56, 258, 112, C.ink, 500, 'Georgia, serif');
            text('chapter.', 56, 388, 155, C.ink, 500, 'Georgia, serif');
            orbit(963, 351, .98, t, true);
            text('당신의 이야기, 다음 장면으로.', 60, 482, 27, C.ink, 700);
            text('기획부터 제작, 채널별 콘텐츠까지.', 60, 523, 19, C.ink, 500);
          }
        }
        g.restore();
        line(44, h - 77, w - 44, h - 77, light ? '#f1f0e840' : '#10292340');
        text(['01  /  IMAGINE', '02  /  CREATE', '03  /  CONNECT', '04  /  NEXT CHAPTER'][shot], 44, h - 42, 12, ink, 700);
        text('BRAND DEMO · NO AUDIO', w - 231, h - 42, 11, ink, 600);
        rect(44, h - 78, (w - 88) * (q / 3), 3, 0, light ? C.lime : C.ink);
        if (q > 2.8) {
          const wipe = ease((q - 2.8) / .2);
          rect(w * (1 - wipe), 0, w * wipe + 1, h, 0, [C.peach, C.ink, C.lime, C.paper][shot]);
        }
        return canvas.toDataURL('image/jpeg', .93).split(',')[1];
      };
    });
    const target = path.join(output, `product-story-${channel}.mp4`);
    const encoder = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-r', '24', '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', target], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    let errorText = '';
    encoder.stderr.on('data', data => { errorText += data.toString(); });
    const done = once(encoder, 'exit');
    for (let frame = 0; frame < 12 * 24; frame++) {
      const jpeg = await page.evaluate(time => window.paintBrandFrame(time), frame / 24);
      if (!encoder.stdin.write(Buffer.from(jpeg, 'base64'))) await once(encoder.stdin, 'drain');
    }
    encoder.stdin.end();
    const [exitCode] = await done;
    if (exitCode !== 0) throw new Error(`FFmpeg failed (${exitCode}): ${errorText}`);
    const poster = await page.evaluate(time => window.paintBrandFrame(time), channel === 'youtube' ? 1.4 : 4.4);
    await writeFile(path.join(output, `product-story-${channel}.jpg`), Buffer.from(poster, 'base64'));
    await page.close();
    console.log(`${channel}: ${width}×${height}, 12s, 24fps → ${target}`);
  }
} finally { await browser.close(); }
