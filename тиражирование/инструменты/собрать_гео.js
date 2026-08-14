/**
 * Собирает гео-подложку для сцены тиражирования.
 *
 * Формы берутся из данных, а не рисуются на глаз: границы областей — из
 * OpenStreetMap (Nominatim, упрощённые полигоны), контуры стран мира — из
 * Natural Earth 110m (общественное достояние).
 *
 * Ночная сторона планеты набирается огнями городов, а не снимком: точек
 * хватает, чтобы кадр читался как ночная Земля, а весит это килобайты.
 *
 * Запуск:  node собрать_гео.js
 * Кладёт:  ../данные/области_кз.json, ../данные/мир.json, ../данные/огни.json
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ДАННЫЕ = path.join(__dirname, '..', 'данные');
fs.mkdirSync(ДАННЫЕ, { recursive: true });

const качать = (url, заголовки = {}) => new Promise((ок, нет) => {
  https.get(url, { headers: { 'User-Agent': 'kmg-digital-twin-slide/1.0 (geo prep)', ...заголовки } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location)
      return качать(r.headers.location, заголовки).then(ок, нет);
    if (r.statusCode !== 200) return нет(new Error(url + ' → ' + r.statusCode));
    const куски = [];
    r.on('data', c => куски.push(c));
    r.on('end', () => ок(Buffer.concat(куски).toString('utf8')));
  }).on('error', нет);
});

const пауза = мс => new Promise(р => setTimeout(р, мс));

/* Двадцать единиц первого уровня: 17 областей и 3 города республиканского
   значения. Названия — как в OSM, иначе поиск уводит в район или город. */
const ОБЛАСТИ = [
  ['abai',        'Абайская область'],
  ['akmola',      'Акмолинская область'],
  ['aktobe',      'Актюбинская область'],
  ['almaty_obl',  'Алматинская область'],
  ['atyrau',      'Атырауская область'],
  ['vko',         'Восточно-Казахстанская область'],
  ['zhambyl',     'Жамбылская область'],
  ['zhetysu',     'Жетысуская область'],
  ['zko',         'Западно-Казахстанская область'],
  ['karaganda',   'Карагандинская область'],
  ['kostanay',    'Костанайская область'],
  ['kyzylorda',   'Кызылординская область'],
  ['mangystau',   'Мангистауская область'],
  ['pavlodar',    'Павлодарская область'],
  ['sko',         'Северо-Казахстанская область'],
  ['turkestan',   'Туркестанская область'],
  ['ulytau',      'Улытауская область'],
  ['astana',      'Астана'],
  ['almaty',      'Алматы'],
  ['shymkent',    'Шымкент'],
];

/* Порог упрощения: 0,01° это около километра — на глобусе и на карте страны
   такая линия неотличима от полной, а точек в двести раз меньше. */
const ПОРОГ = 0.01;

async function области(){
  const итог = {};
  for (const [ид, имя] of ОБЛАСТИ){
    const url = 'https://nominatim.openstreetmap.org/search'
      + '?q=' + encodeURIComponent(имя)
      + '&countrycodes=kz&format=jsonv2&limit=1'
      + '&polygon_geojson=1&polygon_threshold=' + ПОРОГ;
    const ответ = JSON.parse(await качать(url));
    if (!ответ.length){ console.log(`  ✗ ${имя} — не найдено`); await пауза(1200); continue; }
    const о = ответ[0];
    const кольца = вКольца(о.geojson);
    итог[ид] = { имя, osm: о.osm_id, кольца };
    const точек = кольца.reduce((s, к) => s + к.length, 0);
    console.log(`  ✓ ${имя} — rel ${о.osm_id}, колец ${кольца.length}, точек ${точек}`);
    await пауза(1200);                    // вежливость к Nominatim: не чаще раза в секунду
  }
  return итог;
}

/* Кольца только внешние: дырки (анклавы) на такой крупности не читаются, а
   заливку усложняют. Мультиполигон разворачивается в список колец. */
function вКольца(g){
  if (!g) return [];
  if (g.type === 'Polygon')      return [g.coordinates[0]].map(округлить);
  if (g.type === 'MultiPolygon') return g.coordinates.map(п => п[0]).map(округлить);
  return [];
}
const округлить = к => к.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]);

async function мир(){
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'
            + 'master/geojson/ne_110m_admin_0_countries.geojson';
  const gj = JSON.parse(await качать(url));
  const страны = [];
  for (const ф of gj.features){
    const имя = ф.properties.NAME_RU || ф.properties.NAME || '';
    const код = ф.properties.ISO_A2 || '';
    страны.push({ имя, код, кольца: вКольца(ф.geometry) });
  }
  console.log(`  ✓ мир — стран ${страны.length}`);
  return страны;
}

/* Огни городов — Natural Earth 50m. Каждая точка это [долгота, широта, сила],
   сила от людности: столицы и миллионники горят ярче посёлков. */
async function огни(){
  const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/'
            + 'master/geojson/ne_50m_populated_places_simple.geojson';
  const gj = JSON.parse(await качать(url));
  const т = [];
  for (const ф of gj.features){
    const [x, y] = ф.geometry.coordinates;
    const н = ф.properties.pop_max || ф.properties.pop_min || 50000;
    // логарифм людности, сжатый в 0…1: линейная шкала отдала бы весь свет
    // десятку мегаполисов, а остальной мир оставила чёрным
    const сила = Math.max(0.12, Math.min(1, (Math.log10(н) - 4.1) / 3.1));
    т.push([+x.toFixed(3), +y.toFixed(3), +сила.toFixed(2)]);
  }
  console.log(`  ✓ огни — точек ${т.length}`);
  return т;
}

(async () => {
  console.log('области Казахстана (OSM):');
  const обл = await области();
  fs.writeFileSync(path.join(ДАННЫЕ, 'области_кз.json'), JSON.stringify(обл));

  console.log('контуры стран (Natural Earth 110m):');
  const м = await мир();
  fs.writeFileSync(path.join(ДАННЫЕ, 'мир.json'), JSON.stringify(м));

  console.log('огни городов (Natural Earth 50m):');
  const о = await огни();
  fs.writeFileSync(path.join(ДАННЫЕ, 'огни.json'), JSON.stringify(о));

  for (const ф of ['области_кз.json', 'мир.json', 'огни.json'])
    console.log(`${ф} — ${(fs.statSync(path.join(ДАННЫЕ, ф)).size / 1024).toFixed(0)} КБ`);
})().catch(e => { console.error('сорвалось:', e.message); process.exit(1); });
