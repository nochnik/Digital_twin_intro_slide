/**
 * Накладывает настоящую границу области на готовый кадр карты.
 *
 * Картинка кадра нравится и переделке не подлежит — неверна была только
 * подсветка: генератор пять раз подряд обводил не ту область (то четыре разом,
 * то соседнюю Мангистаускую, то две со сдвигом к северу). Форма области это
 * данные, поэтому она берётся из OpenStreetMap и рисуется поверх кадра.
 *
 * Привязка: на кадре ищется силуэт страны (подсвеченная суша), его габарит
 * сопоставляется с габаритом настоящего контура Казахстана — этого достаточно,
 * чтобы область села на своё место относительно моря и соседей.
 *
 * Запуск:
 *   node подсветка_области.js проверка   — контрольный кадр с обводкой страны
 *   node подсветка_области.js            — рабочий кадр с подсвеченной областью
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const { execFileSync } = require('child_process');

const дом = (...ч) => path.join(__dirname, '..', ...ч);
const ИСХОДНЫЙ = дом('кадры', '03_карта_областей.png');
const режим = process.argv[2] === 'проверка' ? 'проверка' : 'рабочий';

const страна  = JSON.parse(fs.readFileSync(path.join(__dirname, 'данные', 'казахстан_контур.json'), 'utf8'));
const область = JSON.parse(fs.readFileSync(path.join(__dirname, 'данные', 'атырау_контур.json'), 'utf8'));

const ЯНТАРЬ = [240, 174, 74], КРАСНЫЙ = [255, 60, 60];

// ── читаем кадр в сырые пиксели ───────────────────────────────────────────
const врем = дом('проверка', '_кадр.rgb');
execFileSync('ffmpeg', ['-v','error','-i', ИСХОДНЫЙ, '-f','rawvideo','-pix_fmt','rgb24','-y', врем]);
const размер = execFileSync('ffprobe', ['-v','error','-select_streams','v',
  '-show_entries','stream=width,height','-of','csv=p=0:s=x', ИСХОДНЫЙ]).toString().trim().split('x');
const W = +размер[0], H = +размер[1];
const буфер = fs.readFileSync(врем);
fs.unlinkSync(врем);
const п = new Float32Array(W * H * 3);
for (let i = 0; i < W * H * 3; i++) п[i] = буфер[i];

// ── силуэт страны на кадре ────────────────────────────────────────────────
// Суша подсвечена бирюзовым и заметно светлее окружения: берём пиксели, где
// зелёный и синий уверенно выше красного и общая яркость выше фона.
// Суша залита бирюзовым: внутри страны зелёный превышает красный примерно на
// 35, снаружи на 7–12. Порога мало — тёплую дугу атмосферы сверху он тоже
// цепляет, поэтому берём крупнейшую связную область.
const маска = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) if (п[i*3+1] - п[i*3] > 28) маска[i] = 1;

const метка = new Int32Array(W * H), стек = new Int32Array(W * H);
let лучшее = 0, x0 = 0, y0 = 0, x1 = 0, y1 = 0, номер = 0;
for (let s = 0; s < W * H; s++){
  if (!маска[s] || метка[s]) continue;
  номер++; let в = 0; стек[в++] = s; метка[s] = номер;
  let n = 0, ax = W, ay = H, bx = 0, by = 0;
  while (в){
    const i = стек[--в]; n++;
    const x = i % W, y = (i - x) / W;
    if (x < ax) ax = x; if (x > bx) bx = x;
    if (y < ay) ay = y; if (y > by) by = y;
    for (const j of [x > 0 ? i-1 : -1, x < W-1 ? i+1 : -1, y > 0 ? i-W : -1, y < H-1 ? i+W : -1])
      if (j >= 0 && маска[j] && !метка[j]){ метка[j] = номер; стек[в++] = j; }
  }
  if (n > лучшее){ лучшее = n; x0 = ax; y0 = ay; x1 = bx; y1 = by; }
}
console.log(`страна на кадре: x ${x0}–${x1}, y ${y0}–${y1} (${(лучшее/(W*H)*100).toFixed(1)}% кадра)`);

// ── настоящий контур в тех же осях ────────────────────────────────────────
const lat = страна.map(p => p[1]);
const kx = Math.cos((Math.min(...lat) + Math.max(...lat)) / 2 * Math.PI / 180);
const пр = т => [т[0] * kx, т[1]];
const габарит = точки => {
  const a = точки.map(пр);
  const X = a.map(p => p[0]), Y = a.map(p => p[1]);
  return [Math.min(...X), Math.min(...Y), Math.max(...X), Math.max(...Y)];
};
const г = габарит(страна);
const sx = (x1 - x0) / (г[2] - г[0]);
const sy = (y1 - y0) / (г[3] - г[1]);
const вКадр = т => { const [X, Y] = пр(т);
  return [x0 + (X - г[0]) * sx, y1 - (Y - г[1]) * sy]; };
console.log(`масштаб: ${sx.toFixed(1)} px/град по долготе, ${sy.toFixed(1)} по широте`);

// ── рисование ─────────────────────────────────────────────────────────────
const реже = (т, ш) => т.filter((_, i) => i % ш === 0);
function точка(x, y, цвет, сила){
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  for (let c = 0; c < 3; c++) п[i+c] = п[i+c] * (1 - сила) + цвет[c] * сила;
}
function светом(x, y, цвет, сила){
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  for (let c = 0; c < 3; c++) п[i+c] = Math.min(255, п[i+c] + цвет[c] * сила);
}
function контур(точки, цвет, ширина, свечение, ярко){
  const маска = new Float32Array(W * H);
  for (let i = 0; i < точки.length; i++){
    const [ax, ay] = точки[i], [bx, by] = точки[(i + 1) % точки.length];
    const шагов = Math.ceil(Math.hypot(bx - ax, by - ay)) + 1;
    for (let s = 0; s <= шагов; s++){
      const x = ax + (bx - ax) * s / шагов, y = ay + (by - ay) * s / шагов;
      for (let dy = -ширина; dy <= ширина; dy++) for (let dx = -ширина; dx <= ширина; dx++){
        const X = (x + dx) | 0, Y = (y + dy) | 0;
        if (X >= 0 && Y >= 0 && X < W && Y < H) маска[Y * W + X] = 1;
      }
    }
  }
  if (свечение){
    let свет = new Float32Array(маска);
    for (let п2 = 0; п2 < 2; п2++){
      const t = new Float32Array(свет);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        let s = 0, n = 0;
        for (let d = -свечение; d <= свечение; d += 2){
          const X = x + d; if (X < 0 || X >= W) continue; s += t[y*W+X]; n++;
        }
        свет[y*W+x] = s / n;
      }
      const t2 = new Float32Array(свет);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
        let s = 0, n = 0;
        for (let d = -свечение; d <= свечение; d += 2){
          const Y = y + d; if (Y < 0 || Y >= H) continue; s += t2[Y*W+x]; n++;
        }
        свет[y*W+x] = s / n;
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
      const g = свет[y*W+x];
      if (g > 0.004) светом(x, y, цвет, Math.min(0.8, g * 2.2));
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (маска[y*W+x]) точка(x, y, цвет, ярко);
}
function залить(точки, цвет, сила){
  let в = H, н = 0;
  for (const [, y] of точки){ if (y < в) в = y; if (y > н) н = y; }
  for (let y = Math.max(0, в|0); y <= Math.min(H-1, Math.ceil(н)); y++){
    const cy = y + 0.5, пер = [];
    for (let i = 0, j = точки.length - 1; i < точки.length; j = i++){
      const [ax, ay] = точки[i], [bx, by] = точки[j];
      if ((ay > cy) !== (by > cy)) пер.push(ax + (cy - ay) / (by - ay) * (bx - ax));
    }
    пер.sort((a, b) => a - b);
    for (let k = 0; k + 1 < пер.length; k += 2)
      for (let x = Math.max(0, Math.ceil(пер[k])); x <= Math.min(W-1, Math.floor(пер[k+1])); x++)
        точка(x, y, цвет, сила);
  }
}

let выход;
if (режим === 'проверка'){
  // контрольный: обводим страну по настоящим данным — если легло на силуэт,
  // значит привязка верна и области можно верить
  контур(реже(страна, 8).map(вКадр), КРАСНЫЙ, 2, 0, 1);
  контур(реже(область, 3).map(вКадр), КРАСНЫЙ, 3, 0, 1);
  выход = дом('проверка', 'привязка.png');
} else {
  const о = реже(область, 1).map(вКадр);

  // Маска области — по ней решаем, что гасить, а что зажигать.
  const внутриОбл = new Uint8Array(W * H);
  {
    let в = H, н = 0;
    for (const [, y] of о){ if (y < в) в = y; if (y > н) н = y; }
    for (let y = Math.max(0, в|0); y <= Math.min(H-1, Math.ceil(н)); y++){
      const cy = y + 0.5, пер = [];
      for (let i = 0, j = о.length - 1; i < о.length; j = i++){
        const [ax, ay] = о[i], [bx, by] = о[j];
        if ((ay > cy) !== (by > cy)) пер.push(ax + (cy - ay) / (by - ay) * (bx - ax));
      }
      пер.sort((a, b) => a - b);
      for (let k = 0; k + 1 < пер.length; k += 2)
        for (let x = Math.max(0, Math.ceil(пер[k])); x <= Math.min(W-1, Math.floor(пер[k+1])); x++)
          внутриОбл[y * W + x] = 1;
    }
  }

  // Страна гаснет почти в чёрное, область остаётся при своей яркости и
  // забирает янтарный тон — так же, как было на кадре, который утверждали,
  // только теперь горит настоящая Атырауская.
  for (let i = 0; i < W * H; i++){
    const o = i * 3;
    if (внутриОбл[i]){
      const ярк = (п[o] + п[o+1] + п[o+2]) / 3;
      for (let c = 0; c < 3; c++)
        п[o+c] = Math.min(255, п[o+c] * 0.35 + ЯНТАРЬ[c] * (0.30 + ярк / 255 * 0.55));
    } else {
      for (let c = 0; c < 3; c++) п[o+c] *= 0.34;
    }
  }

  контур(о, ЯНТАРЬ, 3, 17, 1);
  выход = дом('кадры', '04_атырауская_область.png');
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
const сырое = Buffer.alloc((W * 3 + 1) * H);
let o = 0;
for (let y = 0; y < H; y++){
  сырое[o++] = 0;
  for (let x = 0; x < W; x++){
    const i = (y * W + x) * 3;
    сырое[o++] = Math.max(0, Math.min(255, п[i]   | 0));
    сырое[o++] = Math.max(0, Math.min(255, п[i+1] | 0));
    сырое[o++] = Math.max(0, Math.min(255, п[i+2] | 0));
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(выход, Buffer.concat([
  Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
  кусок('IHDR', ihdr),
  кусок('IDAT', zlib.deflateSync(сырое, { level: 9 })),
  кусок('IEND', Buffer.alloc(0)),
]));
console.log('готово: ' + выход);
