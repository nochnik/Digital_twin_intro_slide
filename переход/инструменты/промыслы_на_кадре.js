/**
 * Наносит промыслы на готовый кадр области.
 *
 * Кадр приходит снаружи — на нём уже обведена Атырауская область. Привязка
 * берётся от этой обводки: ищем янтарную линию, её габарит сопоставляем с
 * габаритом настоящего контура из OpenStreetMap. Дальше каждый промысел
 * ставится по своим координатам, а не на глаз.
 *
 * Запуск:  node промыслы_на_кадре.js вход.png выход.png
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const { execFileSync } = require('child_process');

const дом = (...ч) => path.join(__dirname, '..', ...ч);
const ВХОД  = process.argv[2] || дом('кадры', '05_месторождения_области_новый.png');
const ВЫХОД = process.argv[3] || дом('кадры', '05_месторождения_области.png');

const область = JSON.parse(fs.readFileSync(path.join(__dirname, 'данные', 'атырау_контур.json'), 'utf8'));
const ЯНТАРЬ = [240, 174, 74], ЦИАН = [79, 227, 255];

/* Промыслы Атырауской области. Молдабек Восточный — Кызылкогинский район,
   восток-северо-восточнее Атырау (51,88° д., 47,12° ш.): больше на восток,
   чем на север, порядка 200 км. */
const ПРОМЫСЛЫ = [
  { имя:'Тенгиз',             т:[53.50, 46.35] },
  { имя:'Королевское',        т:[53.92, 46.42] },
  { имя:'Прорва',             т:[53.02, 46.42] },
  { имя:'Каратон',            т:[53.55, 46.48] },
  { имя:'Кошкар',             т:[52.70, 46.72] },
  { имя:'Мартыши',            т:[51.92, 46.92] },
  { имя:'Косчагыл',           т:[53.90, 46.95] },
  { имя:'Кульсары',           т:[54.05, 46.98] },
  { имя:'Доссор',             т:[52.98, 47.53] },
  { имя:'Макат',              т:[53.35, 47.65] },
  { имя:'Сагиз',              т:[54.90, 48.05] },
  { имя:'Молдабек Восточный', т:[54.40, 47.72], выбран:true },
];

// ── кадр ──────────────────────────────────────────────────────────────────
const врем = дом('проверка', '_вход.rgb');
execFileSync('ffmpeg', ['-v','error','-i', ВХОД, '-f','rawvideo','-pix_fmt','rgb24','-y', врем]);
const [W, H] = execFileSync('ffprobe', ['-v','error','-select_streams','v',
  '-show_entries','stream=width,height','-of','csv=p=0:s=x', ВХОД]).toString().trim().split('x').map(Number);
const сыр = fs.readFileSync(врем); fs.unlinkSync(врем);
const п = new Float32Array(W * H * 3);
for (let i = 0; i < W * H * 3; i++) п[i] = сыр[i];

// ── привязка по нарисованной обводке ──────────────────────────────────────
let x0 = W, y0 = H, x1 = 0, y1 = 0, найдено = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
  const i = (y*W+x)*3, r = п[i], g = п[i+1], b = п[i+2];
  if (r > 180 && r - b > 90 && g > 90 && g < r){
    найдено++;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
}
if (найдено < 1000) { console.error('обводка области на кадре не найдена'); process.exit(1); }

const lon = область.map(т => т[0]), lat = область.map(т => т[1]);
const lon0 = Math.min(...lon), lon1 = Math.max(...lon);
const lat0 = Math.min(...lat), lat1 = Math.max(...lat);
const пр = т => [
  x0 + (т[0] - lon0) / (lon1 - lon0) * (x1 - x0),
  y1 - (т[1] - lat0) / (lat1 - lat0) * (y1 - y0),
];
console.log(`обводка: x ${x0}–${x1}, y ${y0}–${y1} (${найдено} пикселей)`);

// ── рисование ─────────────────────────────────────────────────────────────
const точка = (x, y, ц, с) => { x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y*W+x)*3; for (let c = 0; c < 3; c++) п[i+c] = п[i+c]*(1-с) + ц[c]*с; };
const светом = (x, y, ц, с) => { x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y*W+x)*3; for (let c = 0; c < 3; c++) п[i+c] = Math.min(255, п[i+c] + ц[c]*с); };

function маска(точки){
  const м = new Uint8Array(W * H);
  let в = H, н = 0;
  for (const [, y] of точки){ if (y < в) в = y; if (y > н) н = y; }
  for (let y = Math.max(0, в|0); y <= Math.min(H-1, Math.ceil(н)); y++){
    const cy = y + 0.5, пер = [];
    for (let i = 0, j = точки.length - 1; i < точки.length; j = i++){
      const [ax, ay] = точки[i], [bx, by] = точки[j];
      if ((ay > cy) !== (by > cy)) пер.push(ax + (cy - ay)/(by - ay)*(bx - ax));
    }
    пер.sort((a, b) => a - b);
    for (let k = 0; k + 1 < пер.length; k += 2)
      for (let x = Math.max(0, Math.ceil(пер[k])); x <= Math.min(W-1, Math.floor(пер[k+1])); x++)
        м[y*W+x] = 1;
  }
  return м;
}

function контур(точки, ц, ширина, свечение, ярко){
  const м = new Float32Array(W * H);
  for (let i = 0; i < точки.length; i++){
    const [ax, ay] = точки[i], [bx, by] = точки[(i+1) % точки.length];
    const шагов = Math.ceil(Math.hypot(bx-ax, by-ay)) + 1;
    for (let s = 0; s <= шагов; s++){
      const x = ax + (bx-ax)*s/шагов, y = ay + (by-ay)*s/шагов;
      for (let dy = -ширина; dy <= ширина; dy++) for (let dx = -ширина; dx <= ширина; dx++){
        const X = (x+dx)|0, Y = (y+dy)|0;
        if (X >= 0 && Y >= 0 && X < W && Y < H) м[Y*W+X] = 1;
      }
    }
  }
  let с = new Float32Array(м);
  for (let раз = 0; раз < 2; раз++){
    const t = new Float32Array(с);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      let s = 0, n = 0;
      for (let d = -свечение; d <= свечение; d += 2){ const X = x+d;
        if (X < 0 || X >= W) continue; s += t[y*W+X]; n++; }
      с[y*W+x] = s/n;
    }
    const t2 = new Float32Array(с);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      let s = 0, n = 0;
      for (let d = -свечение; d <= свечение; d += 2){ const Y = y+d;
        if (Y < 0 || Y >= H) continue; s += t2[Y*W+x]; n++; }
      с[y*W+x] = s/n;
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const g = с[y*W+x]; if (g > 0.004) светом(x, y, ц, Math.min(0.8, g*2.4));
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (м[y*W+x]) точка(x, y, ц, ярко);
}

const к = W / 1920;                                   // размеры под ширину кадра
for (const пм of ПРОМЫСЛЫ){
  const [x, y] = пр(пм.т);
  const r = (пм.выбран ? 30 : 20) * к;
  const семя = пм.имя.length * 7;
  const ф = [];
  for (let i = 0; i < 8; i++){
    const a = i/8 * Math.PI*2 + семя*0.11;
    const rr = r * (0.72 + ((i*53 + семя) % 42)/100);
    ф.push([x + Math.cos(a)*rr*1.28, y + Math.sin(a)*rr]);
  }
  const ц = пм.выбран ? ЦИАН : ЯНТАРЬ;
  const м = маска(ф);
  for (let i = 0; i < W*H; i++) if (м[i]){
    const j = i*3;
    for (let c = 0; c < 3; c++) п[j+c] = п[j+c]*0.68 + ц[c]*(пм.выбран ? 0.32 : 0.24);
  }
  контур(ф, ц, Math.max(2, Math.round((пм.выбран ? 3 : 2)*к)),
         Math.round((пм.выбран ? 15 : 9)*к), пм.выбран ? 1 : 0.85);
}

// ── запись PNG ────────────────────────────────────────────────────────────
const таблица = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++){ let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t; })();
const crc = b => { let c = 0xFFFFFFFF;
  for (const х of b) c = таблица[(c ^ х) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const кусок = (тип, д) => {
  const дл = Buffer.alloc(4); дл.writeUInt32BE(д.length);
  const тело = Buffer.concat([Buffer.from(тип, 'ascii'), д]);
  const кс = Buffer.alloc(4); кс.writeUInt32BE(crc(тело));
  return Buffer.concat([дл, тело, кс]);
};
const вывод = Buffer.alloc((W*3+1)*H);
let o = 0;
for (let y = 0; y < H; y++){
  вывод[o++] = 0;
  for (let x = 0; x < W; x++){
    const i = (y*W+x)*3;
    вывод[o++] = Math.max(0, Math.min(255, п[i]|0));
    вывод[o++] = Math.max(0, Math.min(255, п[i+1]|0));
    вывод[o++] = Math.max(0, Math.min(255, п[i+2]|0));
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(ВЫХОД, Buffer.concat([
  Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
  кусок('IHDR', ihdr),
  кусок('IDAT', zlib.deflateSync(вывод, { level: 9 })),
  кусок('IEND', Buffer.alloc(0)),
]));

const [mx, my] = пр(ПРОМЫСЛЫ.find(p => p.выбран).т);
const [ax, ay] = пр([51.88, 47.12]);
console.log(`${ВЫХОД.split(/[\\/]/).pop()}  ${W}×${H}`);
console.log(`Молдабек: x ${(mx/W*100).toFixed(1)}%  y ${(my/H*100).toFixed(1)}%`);
console.log(`Атырау:   x ${(ax/W*100).toFixed(1)}%  y ${(ay/H*100).toFixed(1)}%`);
