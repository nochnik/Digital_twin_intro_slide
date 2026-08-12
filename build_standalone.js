/**
 * Собирает автономный HTML: three.js и все .glb зашиваются внутрь файла.
 * Результат открывается двойным кликом, без сервера и без интернета.
 *
 *   node build_standalone.js
 */
const fs = require('fs');
const path = require('path');

const SRC = 'первый_слайд_v3.html';
const OUT = 'ПОКАЗ_автономный.html';

const b64 = f => fs.readFileSync(path.join(__dirname, f)).toString('base64');
const jsDataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');

// --- модули three.js -------------------------------------------------------
const three  = fs.readFileSync(path.join(__dirname, 'vendor/three.module.js'), 'utf8');
const orbit  = fs.readFileSync(path.join(__dirname, 'vendor/addons/controls/OrbitControls.js'), 'utf8');
const bgUtil = fs.readFileSync(path.join(__dirname, 'vendor/addons/utils/BufferGeometryUtils.js'), 'utf8');
// относительный импорт внутри GLTFLoader не разрешается от data:-URL — переводим в bare-спецификатор
const gltf = fs.readFileSync(path.join(__dirname, 'vendor/addons/loaders/GLTFLoader.js'), 'utf8')
  .replace("'../utils/BufferGeometryUtils.js'", "'three/addons/utils/BufferGeometryUtils.js'");

const importmap = JSON.stringify({ imports: {
  'three': jsDataUrl(three),
  'three/addons/controls/OrbitControls.js': jsDataUrl(orbit),
  'three/addons/loaders/GLTFLoader.js': jsDataUrl(gltf),
  'three/addons/utils/BufferGeometryUtils.js': jsDataUrl(bgUtil),
}}, null, 0);

// --- модели ---------------------------------------------------------------
const GLB = {
  plast1: 'пласт_1_ггдм.glb',
  plast2: 'пласт_2_стратегия.glb',
  plast3: 'пласт_3_проектирование.glb',
  skv:    'слой_03_скважина.glb',
  naz:    'слой_04_наземка.glb',
};
const glbGlobal = 'window.__GLB_INLINE={' +
  Object.entries(GLB).map(([k, f]) => `${k}:"${b64(f)}"`).join(',') + '};';

// --- сборка ---------------------------------------------------------------
let html = fs.readFileSync(path.join(__dirname, SRC), 'utf8');

// 1. importmap на vendor → importmap на data:-URL + глобал с моделями
html = html.replace(
  /<script type="importmap">[\s\S]*?<\/script>/,
  `<script>${glbGlobal}</script>\n<script type="importmap">\n${importmap}\n</script>`
);

// 2. загрузка слоёв: fetch файла → parse из base64
html = html.replace(
  /return new Promise\(\(res, rej\) => \{\s*gltfLoader\.load\([^;]*;\s*\}\);/,
  `return new Promise((res, rej) => {
    const bin = Uint8Array.from(atob(window.__GLB_INLINE[id]), c => c.charCodeAt(0)).buffer;
    gltfLoader.parse(bin, '', g => res(g.scene), rej);
  });`
);

// 3. пометка в титуле, чтобы не путать с серверной версией
html = html.replace('<title>', '<title>[автономный] ');

fs.writeFileSync(path.join(__dirname, OUT), html);

const mb = (fs.statSync(path.join(__dirname, OUT)).size / 1048576).toFixed(1);
const ok = !html.includes('vendor/three.module.js') && html.includes('__GLB_INLINE');
console.log(`${OUT} — ${mb} МБ, подстановки: ${ok ? 'OK' : 'ПРОВЕРИТЬ'}`);
