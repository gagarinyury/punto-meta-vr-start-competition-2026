// Figures — low-poly toy people (one silhouette, costumes on top, like LEGO) in Punto's look, for games made by code.
// Every figure is ONE skinned mesh (one draw call): the costume, the face and the colours are baked into it.
//
//   import { figure, animate, lookAt } from './figures.js';
//   const pirate = figure('pirate');                       // 1 unit tall (a tabletop board's game unit)
//   const zombie = figure('zombie', { height: 1.7 });      // life size in the room (metres)
//   pirate.userData.joints.HandRight.add(sword());          // a thing in the hand (Punto's knowledge/hand.md axes)
//   animate(pirate, 'walk', time);                          // every frame
//
// How it is built (the data below is Russian, the API at the end English): every part is a convex hull of points
// taken from the reference sheet — [x on the front view, y, x on the side view] in sheet pixels (fx/fy/sz turn them
// into model units) — hung on a joint; a costume hides base parts, adds its own and recolours the base; bake() merges
// what is visible into one geometry with the colour in the vertices, painted like Punto's islands (lit + evenFaces).
import { THREE, ConvexGeometry, mergeVertices } from './figures-three.js';
import { library } from './costumes/library.js';
import { MAT, facetColor } from './look.js';

// ── Как строится ──────────────────────────────────────────────────────
// Каждая деталь = пересечение двух призм: силуэт с вида спереди (вытянут вперёд-назад)
// ∩ силуэт с вида сбоку (вытянут влево-вправо). Силуэты сняты с чертежа в пикселях листа.
// Вид спереди: X = x − 605, Y = 1168 − y.   Вид сбоку (лицо смотрит влево): Z = 1365 − x, Y = 1168 − y.
const S = 500;                                   // пикселей чертежа на единицу модели (рост ≈ 1,9)
const AX = 605, SZ = 1365, GROUND = 1168;
const fx = (x) => (x - AX) / S, fy = (y) => (GROUND - y) / S, sz = (x) => (SZ - x) / S;
const mirrorX = (pts) => pts.map(([x, y]) => [2 * AX - x, y]);

const COL = {
  // палитра Punto (merci-start src/style/base.ts PALETTE, концепт research/concepts/things/03-people.png): сочнее, чем на чертеже
  skin: 0xf1c29a, skinDark: 0xc98f62, hair: 0x8b5a33, shirt: 0x5fb532, cuff: 0x7cc83c, jeans: 0x3f74c4,
  jeansCuff: 0x5b8fd8, belt: 0x7a4a2b, boot: 0x8a5530, sole: 0x5a3520, buckle: 0xe6dccb,
};

// [имя, силуэт спереди, силуэт сбоку, цвет, зеркалить на другую сторону]
// [имя, силуэт спереди, силуэт сбоку, цвет, зеркалить, сустав] — пока пересечением силуэтов (ноги переделаю по линиям)
const PARTS = [];   // все детали теперь по вершинам (BODY); пересечение силуэтов оставлено как инструмент

// ── Голова: «развёртка + фаски». Вершина = [x спереди, y, x сбоку]; грани и фаски строит выпуклая оболочка,
// невыпуклое (пряди с вырезом под ухо) — пластинами из силуэта вида сбоку.
const box = (x0, x1, y0, y1, s0, s1) => [[x0,y0,s0],[x1,y0,s0],[x0,y1,s0],[x1,y1,s0],[x0,y0,s1],[x1,y0,s1],[x0,y1,s1],[x1,y1,s1]];
const HEAD = [
  // блок головы: лицо (передняя грань), боковые грани, подбородок; фаски между ними — сами
  ['голова', 'hull', [
    // лицо — прямоугольник с фасками у подбородка; верх прямой и прячется за чёлкой
    [518,326,1262],[699,326,1262],[699,462,1266],[518,462,1266],[668,477,1268],[542,477,1268],
    [605,326,1251],[605,477,1257],[605,497,1282],                              // ребро посередине лица
    [505,330,1290],[707,330,1290],[505,460,1290],[707,460,1290],              // боковые фаски (скулы)
    [530,300,1440],[680,300,1440],[505,332,1466],[707,332,1466],[505,449,1466],[707,449,1466],  // затылок; верхние углы срезаны (под волосами/шляпой)
    [542,497,1290],[668,497,1290],[668,480,1466],[542,480,1466]], COL.skin],  // низ
  // шапка волос — явная развёртка: вершины [x спереди, y, x сбоку] и грани как на чертеже (линии = края граней)
  ['волосы', 'poly', {
    v: [[633,219,1251],[623,292,1225],[605,347,1247],[697,284,1268],[690,323,1260],[701,246,1268],[701,245,1313],
        [701,255,1448],[711,275,1310],[711,272,1451],[722,300,1328],[722,295,1466],[687,292,1481],[721,326,1290],
        [721,337,1318],[602,242,1268],[605,235,1290],[507,269,1313],[516,283,1268],[519,326,1260],[495,305,1310],
        [488,303,1328],[489,326,1290],[489,337,1318],[507,278,1448],[495,300,1451],[488,305,1466],[523,300,1481]],
    // 0 пик, 1 кончик чёлки, 2 линия роста по центру, 3–14 правая сторона, 15–27 левая и затылок
    f: [[0,5,3,1],[18,15,0,1,19],[17,16,15,18],[19,1,2],[1,3,4,2],          // чёлка спереди, полоса над лбом
        [0,16,15],[0,6,5],[0,16,17,24,7,6],                                  // макушка
        [5,6,8],[5,8,13,4,3],[6,7,9,8],[8,9,11,10],[8,10,14,13],             // правый бок: две фаски и висок
        [17,18,20],[18,19,22,21,20],[17,24,25,20],[20,25,26,21],[21,26,23,22],// левый бок
        [7,9,11,12],[24,7,12,27],[24,27,26,25],                              // затылок со срезанными углами
        [2,4,13,14,10,11,12,27,26,21,23,22,19]],                            // низ (под шапкой, не виден)
  }, COL.hair],
  // пряди по бокам ниже шапки: силуэт вида сбоку с вырезом под ухо, толщина от головы наружу
  ['пряди', 'slab', [[1328,300],[1466,295],[1464,444],[1423,442],[1418,425],[1414,400],[1410,385],
    [1403,375],[1391,369],[1378,374],[1372,388],[1371,404],[1341,405],[1336,367],[1318,337]], [509, 488], COL.hair, true],
  ['затылок', 'hull', [[488,300,1466],[722,295,1466],[488,447,1466],[722,447,1466],
    [523,300,1481],[687,292,1481],[523,447,1473],[687,447,1473]], COL.hair],
  ['ухо', 'slab', [[1374,404],[1376,383],[1384,372],[1395,370],[1405,377],[1411,390],[1414,410],[1412,425],[1400,431],[1385,431],[1376,425]], [505, 484], COL.skin, true],
];

// ── Тело как у LEGO: один базовый силуэт для всех персонажей, детали висят на суставах ──────────────
// Сустав = точка вращения [x спереди, y, x сбоку]. Правая рука персонажа — слева на виде спереди (R).
const BONES = {
  root:  { p: [605, 1168, 1365] },
  hips:  { parent: 'root',  p: [605, 790, 1365] },   // таз (ремень)
  torso: { parent: 'hips',  p: [605, 770, 1365] },
  head:  { parent: 'torso', p: [605, 505, 1376] },   // шея
  armR:  { parent: 'torso', p: [447, 565, 1376] },   // плечо
  armL:  { parent: 'torso', p: [763, 565, 1376] },
  forearmR: { parent: 'armR', p: [398, 712, 1378] },   // локоть — внутри отворота рукава
  forearmL: { parent: 'armL', p: [812, 712, 1378] },
  legR:  { parent: 'hips',  p: [537, 850, 1363] },   // бедро
  legL:  { parent: 'hips',  p: [673, 850, 1363] },
  shinR: { parent: 'legR', p: [524, 980, 1338] },      // колено — на линии излома штанины
  shinL: { parent: 'legL', p: [686, 980, 1338] },
  // полы и юбка: висят у бедра и повторяют шаг ноги с коэффициентом (нога не вылезает, ткань запаздывает)
  coatR:  { parent: 'hips', p: [537, 850, 1363], follow: ['legR', 0.85] },
  coatL:  { parent: 'hips', p: [673, 850, 1363], follow: ['legL', 0.85] },
  skirtR: { parent: 'hips', p: [537, 850, 1363], follow: ['legR', 0.55] },
  skirtL: { parent: 'hips', p: [673, 850, 1363], follow: ['legL', 0.55] },
};
const MIRROR_BONE = { armR: 'armL', legR: 'legL', coatR: 'coatL', skirtR: 'skirtL', forearmR: 'forearmL', shinR: 'shinL' };
const ELBOW_Y = 712, KNEE_Y = 980;
// деталь, повешенная на плечо/бедро, но лежащая ниже локтя/колена, сама переезжает на предплечье/голень
function jointFor(bone, cy) {
  if ((bone === 'armR' || bone === 'armL') && cy > ELBOW_Y + 25) return bone === 'armR' ? 'forearmR' : 'forearmL';
  if ((bone === 'legR' || bone === 'legL') && cy > KNEE_Y - 12) return bone === 'legR' ? 'shinR' : 'shinL';
  return bone;
}
const octo = (x, y, z, r) => Array.from({ length: 8 }, (_, k) => { const a = (k + 0.5) * Math.PI / 4; return [x, y + r * Math.sin(a), z + r * Math.cos(a)]; });

// Балка: два торца, каждый задан отрезком [наружная точка, внутренняя] на виде спереди; глубина s0..s1 по виду
// сбоку; фаска c по четырём длинным рёбрам. Возвращает вершины для выпуклой оболочки.
function beam(endA, endB, s0, s1, c) {
  const out = [];
  for (const [o, i] of [endA, endB]) {
    const L = Math.hypot(i[0] - o[0], i[1] - o[1]), ux = (i[0] - o[0]) / L, uy = (i[1] - o[1]) / L;
    const o2 = [o[0] + ux * c, o[1] + uy * c], i2 = [i[0] - ux * c, i[1] - uy * c];
    out.push([...o, s0 + c], [...o, s1 - c], [...i, s0 + c], [...i, s1 - c], [...o2, s0], [...o2, s1], [...i2, s0], [...i2, s1]);
  }
  return out;
}

// Призма по выпуклому силуэту вида спереди: глубина s0..s1, фаска c по передним и задним рёбрам
function prism(poly, s0, s1, c) {
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length, cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return poly.flatMap(([x, y]) => { const d = Math.hypot(x - cx, y - cy), k = (d - c) / d;
    return [[x, y, s0 + c], [x, y, s1 - c], [cx + (x - cx) * k, cy + (y - cy) * k, s0], [cx + (x - cx) * k, cy + (y - cy) * k, s1]]; });
}
// Сечение бруска на высоте y: наружный край xo, внутренний xi, перед zf, зад zb (x вида сбоку);
// фаски на вертикальных рёбрах: co — у наружного края, ci — у внутреннего (по x), cz — по глубине.
function section(y, xo, xi, zf, zb, co, ci, cz) {
  const so = Math.sign(xi - xo);
  return [[xo + so * co, y, zf], [xi - so * ci, y, zf], [xo, y, zf + cz], [xi, y, zf + cz],
          [xo, y, zb - cz], [xi, y, zb - cz], [xo + so * co, y, zb], [xi - so * ci, y, zb]];
}
const BODY = [
  // ── таз и ремень (сустав hips) ──
  ['таз', 'hull', [...section(810, 472, 738, 1272, 1455, 10, 10, 10), ...section(852, 472, 738, 1272, 1455, 10, 10, 10),
    [590,891,1280],[620,891,1280],[590,891,1440],[620,891,1440]], COL.jeans, 'hips'],
  ['ремень', 'hull', [...section(775, 467, 744, 1260, 1466, 8, 8, 8), ...section(812, 467, 744, 1260, 1466, 8, 8, 8)], COL.belt, 'hips'],
  ['шлёвка', 'hull', [...section(772, 517, 540, 1253, 1262, 3, 3, 2), ...section(816, 517, 540, 1253, 1262, 3, 3, 2)], COL.jeans, 'hips', true],
  ['шлёвка бок', 'hull', [...section(772, 462, 478, 1256, 1280, 3, 3, 3), ...section(816, 462, 478, 1256, 1280, 3, 3, 3)], COL.jeans, 'hips', true],
  ['шлёвка зад', 'hull', [...section(772, 462, 478, 1446, 1470, 3, 3, 3), ...section(816, 462, 478, 1446, 1470, 3, 3, 3)], COL.jeans, 'hips', true],
  ['пряжка', 'hull', [...section(775, 575, 635, 1251, 1261, 4, 4, 3), ...section(816, 575, 635, 1251, 1261, 4, 4, 3)], COL.buckle, 'hips'],
  ['швы таза', 'seam', [[[593,814,1271.5],[594,889,1279.5]], [[620,814,1271.5],[617,889,1279.5]],
    [[510,816,1271.5],[509,840,1271.5],[482,852,1271.5]], [[700,816,1271.5],[701,840,1271.5],[728,852,1271.5]]], 0, 'hips'],
  // ── нога (сустав legR, бедро): бедро и голень с изломом в колене, отворот, ботинок ──
  ['бедро', 'hull', [...section(846, 472, 602, 1272, 1454, 10, 13, 10), ...section(891, 472, 590, 1274, 1446, 10, 13, 10),
    ...section(980, 472, 577, 1278, 1398, 10, 13, 10)], COL.jeans, 'legR', true],
  ['голень', 'hull', [...section(980, 472, 577, 1278, 1398, 10, 13, 10), ...section(1034, 472, 570, 1298, 1405, 10, 13, 10)], COL.jeans, 'legR', true],
  ['отворот джинсов', 'hull', [...section(1032, 464, 587, 1290, 1418, 15, 19, 10), ...section(1077, 464, 587, 1290, 1418, 15, 19, 10)], COL.jeansCuff, 'legR', true],
  ['голенище', 'hull', [...section(1077, 475, 578, 1303, 1413, 13, 17, 10), ...section(1152, 475, 578, 1303, 1413, 13, 17, 10)], COL.boot, 'legR', true],
  ['носок', 'hull', [[488,1110,1307],[561,1110,1307],[492,1118,1258],[552,1118,1258],[486,1140,1247],[558,1140,1247],
    [479,1151,1246],[561,1151,1246],[473,1132,1300],[467,1151,1300],[578,1128,1300],[578,1151,1300],
    [475,1112,1330],[578,1112,1330],[467,1151,1330],[578,1151,1330]], COL.boot, 'legR', true],
  ['подошва', 'hull', [...section(1151, 467, 578, 1245, 1352, 12, 16, 6), [467,1168,1250],[578,1168,1250],[467,1168,1345],[578,1168,1345],
    [467,1160,1360],[578,1160,1360]], COL.sole, 'legR', true],
  ['каблук', 'hull', [...section(1151, 467, 578, 1364, 1416, 12, 16, 4), ...section(1168, 467, 578, 1366, 1416, 12, 16, 4)], COL.sole, 'legR', true],
  ['швы ноги', 'seam', [[[471.5,852,1352],[471.5,915,1355],[471.5,980,1345],[471.5,1033,1357]], [[463.5,1033,1358],[463.5,1077,1359]],
    [[474.5,1078,1360],[474.5,1151,1362]]], 0, 'legR', true],
  // торс: передняя панель ниже линии груди, скос верха груди к кокетке, фаски по бокам, плечи, горловина, спина
  ['торс', 'hull', [
    [487,768,1262],[723,768,1262],[487,620,1262],[723,620,1262],
    [476,548,1292],[734,548,1292],[550,530,1300],[660,530,1300],
    [473,768,1278],[737,768,1278],[473,620,1278],[737,620,1278],[472,540,1300],[738,540,1300],
    [472,527,1320],[738,527,1320],[472,527,1430],[738,527,1430],
    [542,507,1322],[668,507,1322],[542,507,1430],[668,507,1430],
    [487,768,1465],[723,768,1465],[487,545,1465],[723,545,1465],
    [473,768,1449],[737,768,1449],[472,535,1449],[738,535,1449]], COL.shirt, 'torso'],
  // шея — на торсе (голова вращается на ней, как на штырьке); спереди доходит до груди и переходит в вырез
  ['шея', 'hull', [...section(486, 542, 668, 1300, 1430, 6, 6, 6), ...section(529, 542, 668, 1300, 1430, 6, 6, 6)], COL.skin, 'torso'],
  ['вырез', 'poly', { v: [[548,526,1299.5],[605,577,1278],[662,526,1299.5]], f: [[0,1,2]] }, COL.skin, 'torso'],
  // рука одной деталью: рукав, закатанный отворот, предплечье — шарнир в плече
  ['рукав',   'hull', beam([[420,548],[472,527]], [[355,664],[462,708]], 1310, 1442, 14), COL.shirt, 'armR', true],
  // втулка плеча: восьмигранник на оси вращения руки (ось x), прячет щель при махе рукой
  ['втулка', 'hull', [436, 474].flatMap((x) => Array.from({ length: 8 }, (_, k) => {
    const a = (k + 0.5) * Math.PI / 4; return [x, 565 + 40 * Math.sin(a), 1376 + 40 * Math.cos(a)]; })), COL.shirt, 'armR', true],
  ['отворот', 'hull', beam([[350,661],[466,707]], [[337,712],[446,754]], 1304, 1448, 10), COL.cuff, 'armR', true],
  // предплечье и кулак одним блоком (запястье приклеено) — без шва
  ['предплечье', 'hull', prism([[343,712],[438,746],[405,858],[384,892],[378,898],[352,901],[313,860]], 1322, 1432, 8), COL.skin, 'armR', true],
  ['втулка локтя', 'hull', [354, 444].flatMap((x) => octo(x, 712, 1378, 36)), COL.skin, 'forearmR', true],
  ['втулка колена', 'hull', [476, 572].flatMap((x) => octo(x, 980, 1338, 48)), COL.jeans, 'shinR', true],
  // втулка бедра: восьмигранник на оси ноги, прячет щель при шаге
  ['втулка бедра', 'hull', [476, 600].flatMap((x) => Array.from({ length: 8 }, (_, k) => {
    const a = (k + 0.5) * Math.PI / 4; return [x, 850 + 38 * Math.sin(a), 1363 + 38 * Math.cos(a)]; })), COL.jeans, 'legR', true],
  // выемка у большого пальца — плоская тёмная вставка на передней грани
  ['выемка', 'poly', { v: [[373,844],[361,856],[358,867],[368,875],[383,881],[394,873],[381,861]].map(([x, y]) => [x, y, 1321.4]),
    f: [[0,1,2,3,4,5,6]] }, COL.skinDark, 'armR', true],
];

// ── Геометрия ─────────────────────────────────────────────────────────
const v3 = ([x, y, zs]) => new THREE.Vector3(fx(x), fy(y), sz(zs));
function hullGeo(pts) { return new ConvexGeometry(pts.map(v3)); }
function slabGeo(side, xa, xb) {                // силуэт вида сбоку (zs, y), толщина по x от xa до xb
  const sh = new THREE.Shape(side.map(([zs, y]) => new THREE.Vector2(sz(zs), fy(y))));
  const d = Math.abs(fx(xb) - fx(xa));
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);                      // (u, v, w) → (−w, v, u)
  g.translate(Math.max(fx(xa), fx(xb)), 0, 0);
  g.deleteAttribute('uv');
  return g;
}
function frontGeo(poly, s0, s1, bev) {          // силуэт вида спереди, глубина s0..s1, фаска bev (px)
  const sh = new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(fx(x), fy(y))));
  const b = bev / S, d = (s1 - s0) / S - 2 * b;
  const g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: b, bevelSize: b,
    bevelOffset: -b, bevelSegments: 1 });
  g.translate(0, 0, sz(s1) + b);
  g.deleteAttribute('uv');
  return g;
}
// Явный многогранник: грани веером, нормаль грани общая (по Ньюэллу, наружу от центра); линии — только края граней
function polyPart(name, { v, f }, color, bone = 'root') {
  const P = v.map(v3), c = P.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(P.length);
  const pos = [], nor = [], seg = [], seen = new Set();
  for (const face of f) {
    const n = new THREE.Vector3();
    face.forEach((i, k) => { const a = P[i], b = P[face[(k + 1) % face.length]];
      n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y); });
    n.normalize();
    const fc = face.reduce((a, i) => a.add(P[i]), new THREE.Vector3()).divideScalar(face.length);
    let idx = face;
    if (n.dot(fc.clone().sub(c)) < 0) { n.negate(); idx = [...face].reverse(); }
    for (let k = 1; k < idx.length - 1; k++) for (const i of [idx[0], idx[k], idx[k + 1]]) { pos.push(P[i].x, P[i].y, P[i].z); nor.push(n.x, n.y, n.z); }
    face.forEach((i, k) => { const j = face[(k + 1) % face.length], key = Math.min(i, j) + '-' + Math.max(i, j);
      if (!seen.has(key)) { seen.add(key); seg.push(P[i].x, P[i].y, P[i].z, P[j].x, P[j].y, P[j].z); } });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
  mesh.name = name; attach(mesh, bone);
  mesh.userData.base = color; mesh.userData.edges = seg;          // рёбра граней — для просмотра «чертёж»
}
// ── Сборка: детали — меши на суставах невидимой модели; запекание собирает из неё одну сетку ──
const model = new THREE.Group(); model.name = 'FigureParts';
// суставы: группа на каждый, вложены как в BONES; деталь строится в координатах листа и цепляется к суставу
const bones = {};
for (const [n, b] of Object.entries(BONES)) { bones[n] = new THREE.Group(); bones[n].name = n; }
for (const [n, b] of Object.entries(BONES)) {
  (b.parent ? bones[b.parent] : model).add(bones[n]);
  bones[n].position.copy(v3(b.p)).sub(v3(b.parent ? BONES[b.parent].p : BONES.root.p));
}
const OBJ = {};                                  // базовая деталь → её меши и линии
let CUR = '', SINK = null;                       // имя текущей детали; куда складывать объекты костюма
function attach(obj, bone) {
  obj.position.sub(v3(BONES[bone].p)); bones[bone].add(obj);
  if (SINK) SINK.push(obj); else (OBJ[CUR] ||= []).push(obj);
}
function addMesh(name, g, color, bone = 'root', thr = 12, thin = false) {
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, flatShading: true,
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
  if (color === COL.glass || color === COL.veil) Object.assign(mesh.material, { transparent: true, opacity: color === COL.veil ? 0.55 : 0.35, depthWrite: false });
  mesh.name = name; mesh.userData.base = color; mesh.userData.edge = thr; if (thin) mesh.userData.thin = true; attach(mesh, bone);
}
const mx = (pts) => pts.map((p) => [2 * AX - p[0], ...p.slice(1)]);
for (const [name, kind, data, a, b, c] of HEAD) {
  CUR = name;
  if (kind === 'hull') addMesh(name, hullGeo(data), a, 'head', 7);
  else if (kind === 'poly') polyPart(name, data, a, 'head');
  else {                                         // slab: data = силуэт сбоку, a = [x от, x до], b = цвет, c = зеркалить
    addMesh(name, slabGeo(data, a[0], a[1]), b, 'head');
    if (c) addMesh(name, slabGeo(data, 2 * AX - a[0], 2 * AX - a[1]), b, 'head');
  }
}
function buildParts(list) {
for (const [name, kind, data, ...rest] of list) {
  CUR = name;
  const [arg, color, bone, mirror] = kind === 'front' ? rest : [null, ...rest];
  const cyOf = (d) => kind === 'decal' ? d.at[1] : (kind === 'poly' ? d.v : d).reduce((a, p) => a + p[1], 0) / (kind === 'poly' ? d.v : d).length;
  const build = (d, bn0) => {
    const bn = kind === 'seam' ? bn0 : jointFor(bn0, cyOf(d));
    if (kind === 'hull') addMesh(name, hullGeo(d), color, bn, /^arm|^fore|^hand/.test(bn) ? 25 : 12);
    else if (kind === 'poly') polyPart(name, d, color, bn);
    else if (kind === 'decal') addMesh(name, decalGeo(d), color, bn, 1, true);
    else addMesh(name, frontGeo(d, ...arg), color, bn);
  };
  if (kind === 'seam') {                         // швы: тонкие линии по поверхности
    const add = (lines, bn) => { const byBone = {};
      for (const l of lines) for (let k = 0; k < l.length - 1; k++) { const b2 = jointFor(bn, (l[k][1] + l[k + 1][1]) / 2), a = v3(l[k]), b = v3(l[k + 1]);
        (byBone[b2] ||= []).push(a.x, a.y, a.z, b.x, b.y, b.z); }
      for (const [b2, pos] of Object.entries(byBone)) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); const l = new THREE.LineSegments(g); l.userData.seam = true; attach(l, b2); } };
    add(data, bone); if (mirror) add(data.map(mx), MIRROR_BONE[bone] ?? bone);
    continue;
  }
  build(data, bone);
  const mdata = kind === 'poly' ? { ...data, v: mx(data.v) } : kind === 'decal' ? { ...data, at: mx([data.at])[0], n: [-data.n[0], data.n[1], data.n[2]], rot: -(data.rot || 0), ...(data.a0 !== undefined ? { a0: 180 - data.a1, a1: 180 - data.a0 } : {}) } : mx(data);
  if (mirror) build(mdata, MIRROR_BONE[bone] ?? bone);
}
}
buildParts(BODY);
for (const [name, front, side, color, mirror, bone] of PARTS) {
  addMesh(name, hull(front, side), color, bone);
  if (mirror) addMesh(name, hull(mirrorX(front), side), color, MIRROR_BONE[bone]);
}

// ── Костюмы: данные поверх общего тела. Костюм = что спрятать + детали на суставах ──────────────────
const BASEV = {};                                // вершины базовых деталей — из них «раздуваем» одежду
for (const p of [...HEAD, ...BODY]) if (p[1] === 'hull') BASEV[p[0]] = p[2];
const mid = (v) => [0, 1, 2].map((i) => (Math.min(...v.map((p) => p[i])) + Math.max(...v.map((p) => p[i]))) / 2);
// раздуть базовую деталь на d px по ширине и глубине (dy — по высоте): одежда садится по телу сама
function grow(name, d, dy = 0) {
  const v = BASEV[name], c = mid(v), h = [0, 1, 2].map((i) => Math.max(...v.map((p) => Math.abs(p[i] - c[i]))));
  const k = [(h[0] + d) / h[0], (h[1] + dy) / h[1], (h[2] + d) / h[2]];
  return v.map((p) => p.map((q, i) => c[i] + (q - c[i]) * k[i]));
}
// правая половина распахнутой одежды: спереди край на gap px от оси, сзади сходится по оси
const split = (v, gap) => v.map(([x, y, z]) => [Math.min(x, z < SZ ? AX - gap : AX), y, z]);
// многогранное кольцо/конус: низ в (x, y, zs) радиусом r, вверх на h, верх радиусом r2 со сдвигом назад dz
function ring(x, y, z, r, h, n = 8, r2 = r, dz = 0) {
  return Array.from({ length: n }, (_, k) => { const a = (k + 0.5) * 2 * Math.PI / n, c = Math.cos(a), s = Math.sin(a);
    return [[x + r * c, y, z + r * s], [x + r2 * c, y - h, z + dz + r2 * s]]; }).flat();
}
// наклейка: плоская фигура на грани. at — точка на листе [x, y, x сбоку], n — куда смотрит (X вправо, Y вверх, Z вперёд)
const SHAPES = {
  star: (r) => Array.from({ length: 10 }, (_, k) => { const a = Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * 0.45 : r; return [q * Math.cos(a), q * Math.sin(a)]; }),
  moon: (r) => [...Array.from({ length: 13 }, (_, k) => { const a = Math.PI * (0.25 + 1.5 * k / 12); return [r * Math.cos(a), r * Math.sin(a)]; }),
                ...Array.from({ length: 11 }, (_, k) => { const a = Math.PI * (1.62 - 1.24 * k / 10); return [r * 0.38 + r * 0.72 * Math.cos(a), r * 0.72 * Math.sin(a)]; })],
  patch: (r) => [[-r, -r * 0.8], [r, -r * 0.95], [r * 0.9, r * 0.8], [-r * 0.95, r * 0.9]],
  rect: (r, h) => [[-r, -h], [r, -h], [r, h], [-r, h]],
  circle: (r) => Array.from({ length: 12 }, (_, k) => [r * Math.cos(k * Math.PI / 6), r * Math.sin(k * Math.PI / 6)]),
  ellipse: (r, h) => Array.from({ length: 14 }, (_, k) => [r * Math.cos(k * Math.PI / 7), h * Math.sin(k * Math.PI / 7)]),
  // дуга-полоса толщиной w от угла a0 до a1 (градусы, 0 — вправо, 90 — вверх); w = r — сектор
  arc: (r, w, d) => { const A = (t) => (d.a0 + (d.a1 - d.a0) * t) * Math.PI / 180, n = 8;
    return [...Array.from({ length: n + 1 }, (_, k) => [r * Math.cos(A(k / n)), r * Math.sin(A(k / n))]),
            ...Array.from({ length: n + 1 }, (_, k) => [(r - w) * Math.cos(A(1 - k / n)), (r - w) * Math.sin(A(1 - k / n))])]; },
};
function decalGeo(d) {
  const { shape, at, n, r, h, rot = 0, lift = 2.5 } = d;
  const c = Math.cos(rot), s = Math.sin(rot);
  const g = new THREE.ShapeGeometry(new THREE.Shape(SHAPES[shape](r / S, (h ?? r) / S, d).map(([u, v]) => new THREE.Vector2(u * c - v * s, u * s + v * c))));
  const N = new THREE.Vector3(...n).normalize(), up = Math.abs(N.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const U = new THREE.Vector3().crossVectors(up, N).normalize(), V = new THREE.Vector3().crossVectors(N, U);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(U, V, N).setPosition(v3(at).add(N.clone().multiplyScalar(lift / S))));
  return g;
}
// лента (ремень, лямка): от точки a до b на виде спереди, ширина w, глубина za → zb (x сбоку), толщина t
function band(a, b, w, za, zb, t = 4) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L * w / 2, ny = (b[0] - a[0]) / L * w / 2;
  return [[a, za], [b, zb]].flatMap(([p, z]) => [[p[0] + nx, p[1] + ny, z], [p[0] - nx, p[1] - ny, z], [p[0] + nx, p[1] + ny, z + t], [p[0] - nx, p[1] - ny, z + t]]);
}
const box8 = (y0, y1, x0, x1, z0, z1, c = 4) => [...section(y0, x0, x1, z0, z1, c, c, c), ...section(y1, x0, x1, z0, z1, c, c, c)];
Object.assign(COL, { robe: 0x3d4785, robeLight: 0x5b65a6, band: 0x272d5e, rope: 0xd8b779, pouch: 0x8b5a3a,
  book: 0x7b2f2f, flask: 0x6fcf7f, wood: 0x8a5a35, crystal: 0xbfe9ff, gold: 0xf2c94c, patch: 0x7c6aa8, veil: 0xfbfbf6 });

// ── Лицо: наклейки на две половины лица (ребро по центру). onFace даёт точку на лице и нормаль ──
function onFace(x, y) {
  const k = Math.min(1, Math.abs(x - AX) / 87);
  return { at: [x, y, 1251 + 11 * k + 5 * (y - 326) / 151], n: [Math.sign(x - AX) * 0.125, -0.03, 0.99] };
}
const INK = 0x2a2320, MOUTH = 0x6e2a2a;
const eyes = (shape = 'ellipse', r = 8, h = 12, y = 392) => [
  ['глаз', 'decal', { shape, ...onFace(565, y), r, h }, INK, 'head', true],
  ['блик', 'decal', { shape: 'circle', ...onFace(562, y - 5), r: 3, lift: 3.5 }, 0xffffff, 'head', true]];
const brows = (y = 367, rot = 0.12) => [['бровь', 'decal', { shape: 'rect', ...onFace(565, y), r: 11, h: 3, rot }, INK, 'head', true]];
const mouth = (y, r, w, a0, a1, color = INK) => [               // рот из двух половин, сходятся на ребре
  ['рот', 'decal', { shape: 'arc', ...onFace(604.9, y), r, h: w, a0, a1: (a0 + a1) / 2 }, color, 'head'],
  ['рот', 'decal', { shape: 'arc', ...onFace(605.1, y), r, h: w, a0: (a0 + a1) / 2, a1 }, color, 'head']];
const FACES = {
  'улыбка':    [...eyes(), ...brows(), ...mouth(416, 26, 5, 200, 340)],
  'радость':   [['глаз', 'decal', { shape: 'arc', ...onFace(565, 392), r: 11, h: 4, a0: 20, a1: 160 }, INK, 'head', true],
                ...brows(360, 0.05), ...mouth(422, 26, 26, 180, 360, MOUTH)],
  'удивление': [...eyes('circle', 10, 10, 390), ...brows(356, -0.12),
                ['рот', 'decal', { shape: 'ellipse', at: [605, 440, 1254.8], n: [0, -0.03, 1], r: 8, h: 10, lift: 2 }, MOUTH, 'head']],
  'сердитый':  [...eyes('ellipse', 8, 9, 394), ...brows(372, -0.42), ...mouth(452, 24, 5, 20, 160)],
  'череп':     [['глазница', 'decal', { shape: 'circle', ...onFace(562, 392), r: 15 }, 0x2a2320, 'head', true],
                ['нос', 'decal', { shape: 'arc', ...onFace(604.9, 420), r: 10, h: 10, a0: 180, a1: 270 }, 0x2a2320, 'head'],
                ['нос', 'decal', { shape: 'arc', ...onFace(605.1, 420), r: 10, h: 10, a0: 270, a1: 360 }, 0x2a2320, 'head'],
                ['зубы', 'decal', { shape: 'rect', ...onFace(585, 452), r: 20, h: 6 }, 0x2a2320, 'head', true],
                ...[575, 593].map((x) => ['зуб', 'decal', { shape: 'rect', ...onFace(x, 452), r: 1.4, h: 7, lift: 3.5 }, 0xf3f2ec, 'head', true])],
  'зомби':     [['глазница', 'decal', { shape: 'ellipse', ...onFace(563, 393), r: 12, h: 13 }, 0x3b2f2a, 'head', true],
                ['зрачок', 'decal', { shape: 'circle', ...onFace(558, 389), r: 4, lift: 3.5 }, 0xf4f0d8, 'head'],
                ['зрачок', 'decal', { shape: 'circle', ...onFace(652, 398), r: 4, lift: 3.5 }, 0xf4f0d8, 'head'],
                ['рот', 'decal', { shape: 'rect', ...onFace(586, 443), r: 19, h: 3 }, INK, 'head', true],
                ...[572, 586, 598].map((x) => ['шов', 'decal', { shape: 'rect', ...onFace(x, 443), r: 1.5, h: 8, lift: 3.5 }, INK, 'head', true])],
};
const FACE_OBJ = {};
for (const [nm, parts] of Object.entries(FACES)) { SINK = FACE_OBJ[nm] = []; buildParts(parts); SINK = null; }
let FACE = 'улыбка';
function setFace(nm) { FACE = nm; for (const [k, objs] of Object.entries(FACE_OBJ)) for (const o of objs) o.visible = k === nm; }
setFace('улыбка');
const LASHES = [['ресницы', 'decal', { shape: 'rect', ...onFace(551, 384), r: 6, h: 1.8, rot: 0.6, lift: 3 }, INK, 'head', true],
                ['ресницы', 'decal', { shape: 'rect', ...onFace(550, 391), r: 5, h: 1.6, rot: 0.15, lift: 3 }, INK, 'head', true]];

// ── Головной убор, который никогда не пропускает голову: тулья подбирается по точкам головы выше полей ──
function headPoints(only) {                       // вершины деталей головы [x, y, x сбоку]; only — список имён
  const out = [];
  for (const [name, kind, data, a, b, c] of HEAD) {
    if (!only.includes(name)) continue;
    if (kind === 'hull') out.push(...data);
    else if (kind === 'poly') out.push(...data.v);
    else for (const [zs, y] of data) for (const x of c ? [...a, 2 * AX - a[0], 2 * AX - a[1]] : a) out.push([x, y, zs]);
  }
  return out;
}
// поля на высоте y, тулья высотой h, верх = ratio от низа и сдвинут назад на dz; радиус низа — по самой дальней точке
// основание накрывает весь контур головы с прядями (убор не уже головы), выше полей тулья сужается и закрывает верх
function fitCrown(y, h, ratio, dz, only = ['голова', 'пряди', 'затылок'], n = 8, gap = 6) {
  const P = headPoints(only), Z = P.map((p) => p[2]), cz = (Math.min(...Z) + Math.max(...Z)) / 2, k = Math.cos(Math.PI / n);
  let rb = 0;
  for (const [x, py, z] of P) {
    const t = Math.max(0, Math.min(1, (y - py) / h));   // ниже полей — t = 0: ограничивает ширину основания
    rb = Math.max(rb, (Math.hypot(x - AX, z - cz - dz * t) + gap) / (k * (1 - (1 - ratio) * t)));
  }
  return { cx: AX, cz, y, h, rb, rt: rb * ratio, dz, n };
}
// точка на грани тульи для наклейки: угол грани (270 — спереди, 0 — справа), f — доля высоты
function onCrown(H, deg, f) {
  const a = deg * Math.PI / 180, r = (H.rb + (H.rt - H.rb) * f) * Math.cos(Math.PI / H.n);
  return { at: [H.cx + r * Math.cos(a), H.y - H.h * f, H.cz + H.dz * f + r * Math.sin(a)], n: [Math.cos(a), (H.rb - H.rt) / H.h, -Math.sin(a)] };
}
const onBrim = (H, deg, R) => ({ at: [H.cx + R * Math.cos(deg * Math.PI / 180), H.y - 12, H.cz + R * Math.sin(deg * Math.PI / 180)], n: [0, 1, 0] });
const WHAT = fitCrown(318, 125, 0.6, 22);   // шляпа волшебника
const COSTUMES = {
  'волшебник': { hide: ['волосы'], stride: 0.3, colors: { shirt: 0x9a4656 }, parts: [
    ['поля шляпы', 'hull', ring(WHAT.cx, WHAT.y, WHAT.cz, WHAT.rb + 55, 12, 10), COL.robe, 'head'],
    ['тулья', 'hull', ring(WHAT.cx, WHAT.y - 2, WHAT.cz, WHAT.rb, WHAT.h, 8, WHAT.rt, WHAT.dz), COL.robe, 'head'],
    ['кончик', 'hull', [...ring(WHAT.cx, WHAT.y - 2 - WHAT.h, WHAT.cz + WHAT.dz, WHAT.rt, 0, 8), [WHAT.cx - 8, WHAT.y - WHAT.h - 150, WHAT.cz + WHAT.dz + 95]], COL.robe, 'head'],
    ['лента', 'hull', ring(WHAT.cx, WHAT.y - 2, WHAT.cz, WHAT.rb + 3, 24, 8, WHAT.rb + 3 - 24 * (WHAT.rb - WHAT.rt) / WHAT.h), COL.band, 'head'],
    ['мантия', 'hull', split(grow('торс', 9), 22), COL.robe, 'torso', true],
    ['рукав мантии', 'hull', grow('рукав', 10, 8), COL.robe, 'armR', true],
    ['плечо мантии', 'hull', grow('втулка', 10, 10), COL.robe, 'armR', true],
    ['отворот мантии', 'hull', grow('отворот', 9), COL.robeLight, 'armR', true],
    ['пояс подола', 'hull', split([...section(770, 455, 755, 1248, 1482, 12, 12, 12), ...section(868, 450, 760, 1245, 1485, 12, 12, 12)], 26), COL.robe, 'hips', true],
    ['подол', 'hull', split([...section(852, 451, 759, 1246, 1484, 12, 12, 12), ...section(1030, 432, 778, 1228, 1502, 14, 14, 14)], 26), COL.robe, 'coatR', true],
    ['пояс', 'hull', box8(780, 794, 452, 758, 1243, 1487, 12), COL.rope, 'hips'],
    ['узел', 'hull', ring(598, 800, 1240, 12, 24, 6), COL.rope, 'hips'],
    ['концы пояса', 'hull', beam([[590,800],[598,800]], [[584,885],[592,885]], 1236, 1246, 2), COL.rope, 'hips'],
    ['сумка', 'hull', box8(800, 852, 660, 712, 1234, 1262, 5), COL.pouch, 'hips'],
    ['книга', 'hull', box8(798, 852, 492, 540, 1236, 1254, 3), COL.book, 'hips'],
    ['колба', 'hull', ring(738, 868, 1300, 15, 40, 6), COL.flask, 'hips'],
    ['горлышко', 'hull', ring(738, 830, 1300, 6, 16, 6), COL.crystal, 'hips'],
    // звёзды, луна, заплатки (наклейки) и лямка сумки через плечо
    ['звезда', 'decal', { shape: 'star', ...onCrown(WHAT, 270, 0.5), r: 17 }, COL.gold, 'head'],
    ['звезда', 'decal', { shape: 'star', ...onCrown(WHAT, 225, 0.35), r: 13, rot: 0.3 }, COL.gold, 'head'],
    ['звезда', 'decal', { shape: 'star', ...onCrown(WHAT, 315, 0.65), r: 11, rot: -0.2 }, COL.gold, 'head'],
    ['заплатка', 'decal', { shape: 'patch', ...onCrown(WHAT, 180, 0.4), r: 17, rot: 0.2 }, COL.patch, 'head'],
    ['заплатка', 'decal', { shape: 'patch', ...onCrown(WHAT, 0, 0.6), r: 12, rot: -0.3 }, COL.patch, 'head'],
    ['звезда', 'decal', { shape: 'star', ...onBrim(WHAT, 215, WHAT.rb + 32), r: 11 }, COL.gold, 'head'],
    ['звезда', 'decal', { shape: 'star', ...onBrim(WHAT, 330, WHAT.rb + 34), r: 9 }, COL.gold, 'head'],
    ['луна', 'decal', { shape: 'moon', at: [530, 672, 1253], n: [0, 0, 1], r: 18, rot: 0.4 }, COL.gold, 'torso'],
    ['звезда', 'decal', { shape: 'star', at: [682, 668, 1253], n: [0, 0, 1], r: 14 }, COL.gold, 'torso'],
    ['звезда', 'decal', { shape: 'star', at: [540, 650, 1475], n: [0, 0, -1], r: 14 }, COL.gold, 'torso'],
    ['звезда', 'decal', { shape: 'star', at: [672, 705, 1475], n: [0, 0, -1], r: 9 }, COL.gold, 'torso'],
    ['звезда', 'decal', { shape: 'star', at: [500, 965, 1234], n: [0, 0.08, 1], r: 12 }, COL.gold, 'hips'],
    ['звезда', 'decal', { shape: 'star', at: [556, 1004, 1231], n: [0, 0.08, 1], r: 11 }, COL.gold, 'hips'],
    ['звезда', 'decal', { shape: 'star', at: [728, 992, 1232], n: [0, 0.08, 1], r: 10 }, COL.gold, 'hips'],
    ['луна', 'decal', { shape: 'moon', at: [690, 905, 1238], n: [0, 0.08, 1], r: 12, rot: 2.6 }, COL.gold, 'hips'],
    ['лямка', 'hull', band([484, 527], [560, 640], 18, 1283, 1247), COL.pouch, 'torso'],
    ['лямка', 'hull', band([560, 640], [700, 800], 18, 1247, 1235), COL.pouch, 'torso'],
    ['лямка', 'hull', box8(516, 530, 474, 494, 1283, 1478, 2), COL.pouch, 'torso'],
    ['лямка', 'hull', band([484, 527], [700, 800], 18, 1474, 1478), COL.pouch, 'torso'],
    ['посох', 'hull', ring(356, 1160, 1378, 9, 610, 6), COL.wood, 'armR'],
    ['кристалл', 'hull', [[356,505,1378],[356,575,1378],[332,540,1378],[380,540,1378],[356,540,1354],[356,540,1402]], COL.crystal, 'armR'],
  ]},
};
const HH = fitCrown(322, 135, 0.5, 0, undefined, 12);   // каска рабочего
Object.assign(COL, { helmet: 0xf2a531, vest: 0xf27a26, stripe: 0xd9dee2, glove: 0xd4a64c, gloveCuff: 0xa77c37,
  pad: 0x6e7379, strap: 0x3d4148, leather: 0x7a4a2a, metal: 0xa9afb5, grip: 0xd8473a });
const FIST = [[317,851],[394,821],[405,858],[384,892],[378,898],[352,901],[313,860]];
const fatter = (poly, d) => { const c = mid(poly.map(([x, y]) => [x, y, 0])); return poly.map(([x, y]) => { const L = Math.hypot(x - c[0], y - c[1]); return [x + (x - c[0]) / L * d, y + (y - c[1]) / L * d]; }); };
COSTUMES['рабочий'] = { hide: ['волосы', 'пряжка'], colors: { shirt: 0x4f7fc6 }, parts: [
    // каска: стенка, скат купола, обод, козырёк, гребень
    ['каска', 'hull', ring(HH.cx, HH.y, HH.cz, HH.rb, 70, 12, HH.rb * 0.95), COL.helmet, 'head'],
    ['каска верх', 'hull', ring(HH.cx, HH.y - 70, HH.cz, HH.rb * 0.95, 65, 12, HH.rb * 0.5), COL.helmet, 'head'],
    ['обод', 'hull', ring(HH.cx, HH.y + 3, HH.cz, HH.rb + 10, 8, 12), COL.helmet, 'head'],
    ['козырёк', 'hull', [[HH.cx - 60, HH.y + 3, HH.cz - HH.rb * 0.85], [HH.cx + 60, HH.y + 3, HH.cz - HH.rb * 0.85],
      [HH.cx - 52, HH.y + 9, HH.cz - HH.rb - 42], [HH.cx + 52, HH.y + 9, HH.cz - HH.rb - 42],
      [HH.cx - 60, HH.y - 5, HH.cz - HH.rb * 0.85], [HH.cx + 60, HH.y - 5, HH.cz - HH.rb * 0.85],
      [HH.cx - 52, HH.y + 2, HH.cz - HH.rb - 42], [HH.cx + 52, HH.y + 2, HH.cz - HH.rb - 42]], COL.helmet, 'head'],
    ['гребень', 'hull', box8(HH.y - HH.h - 12, HH.y - HH.h + 6, HH.cx - 11, HH.cx + 11, HH.cz - HH.rb * 0.62, HH.cz + HH.rb * 0.62, 3), COL.helmet, 'head'],
    // жилет без рукавов, распахнут; светоотражающие полосы
    ['жилет', 'hull', split(grow('торс', 7, 4), 18), COL.vest, 'torso', true],
    ['полоса', 'decal', { shape: 'rect', at: [530, 695, 1255], n: [0, 0, 1], r: 8, h: 68 }, COL.stripe, 'torso', true],
    ['полоса', 'decal', { shape: 'rect', at: [528, 742, 1255], n: [0, 0, 1], r: 57, h: 8 }, COL.stripe, 'torso', true],
    ['полоса', 'decal', { shape: 'rect', at: [530, 690, 1472], n: [0, 0, -1], r: 8, h: 70 }, COL.stripe, 'torso', true],
    ['полоса', 'decal', { shape: 'rect', at: [605, 742, 1472], n: [0, 0, -1], r: 128, h: 8 }, COL.stripe, 'torso'],
    // перчатки поверх кулаков, манжета на запястье
    ['перчатка', 'hull', prism(fatter(FIST, 6), 1315, 1440, 8), COL.glove, 'armR', true],
    ['манжета', 'hull', beam([[309,835],[399,801]], [[312,858],[404,826]], 1311, 1444, 8), COL.gloveCuff, 'armR', true],
    // наколенники с ремешком
    ['ремешок', 'hull', box8(970, 990, 469, 580, 1270, 1404, 6), COL.strap, 'legR', true],
    ['наколенник', 'hull', box8(952, 1008, 484, 566, 1258, 1280, 8), COL.pad, 'legR', true],
    // рабочий пояс: ремень, пряжка, подсумки, молоток, отвёртка
    ['рабочий пояс', 'hull', box8(772, 818, 459, 751, 1250, 1477, 10), COL.leather, 'hips'],
    ['пряжка', 'hull', box8(778, 812, 586, 624, 1244, 1252, 3), COL.metal, 'hips'],
    ['подсумок', 'hull', box8(806, 872, 470, 528, 1240, 1282, 5), COL.leather, 'hips', true],
    ['клапан', 'hull', box8(800, 822, 466, 532, 1236, 1284, 4), COL.leather, 'hips', true],
    ['ручка молотка', 'hull', ring(752, 900, 1330, 6, 92, 6), COL.wood, 'hips'],
    ['боёк', 'hull', box8(800, 818, 735, 772, 1300, 1362, 3), COL.metal, 'hips'],
    ['отвёртка', 'hull', ring(510, 812, 1262, 4, 26, 6), COL.metal, 'hips'],
    ['рукоять', 'hull', ring(510, 786, 1262, 8, 24, 6), COL.grip, 'hips'],
]};

// ── Ещё кубики: диск лицом вперёд, халат, причёски ──
function discZ(x, y, zs, r, t, n = 10) {          // диск в плоскости вида спереди, толщина t вглубь
  return Array.from({ length: n }, (_, k) => { const a = (k + 0.5) * 2 * Math.PI / n; return [[x + r * Math.cos(a), y + r * Math.sin(a), zs], [x + r * Math.cos(a), y + r * Math.sin(a), zs + t]]; }).flat();
}
const tri = (pts, z0, z1) => pts.flatMap(([x, y]) => [[x, y, z0], [x, y, z1]]);   // плоская деталь по силуэту спереди
// халат/пальто: распахнутый корпус, рукава, отвороты, втулки, подол до hem
const coat = (color, cuff, hem = 1010, gap = 26) => [
  ['пальто', 'hull', split(grow('торс', 8), gap), color, 'torso', true],
  ['рукав пальто', 'hull', grow('рукав', 10, 8), color, 'armR', true],
  ['отворот пальто', 'hull', grow('отворот', 9), cuff, 'armR', true],
  ['плечо пальто', 'hull', grow('втулка', 10, 10), color, 'armR', true],
  ['пояс полы', 'hull', split([...section(770, 456, 754, 1250, 1480, 12, 12, 12), ...section(868, 454, 756, 1249, 1481, 12, 12, 12)], gap + 4), color, 'hips', true],
  ['пола', 'hull', split([...section(852, 454, 756, 1249, 1481, 12, 12, 12), ...section(hem, 448, 762, 1242, 1488, 12, 12, 12)], gap + 4), color, 'coatR', true],
];
const glasses = (lens, frame) => [
  ['линза', 'hull', box8(366, 400, 528, 592, 1244, 1250, 4), lens, 'head', true],
  ['перемычка', 'hull', box8(378, 386, 592, 618, 1243, 1248, 1), frame, 'head'],
  ['дужка', 'hull', box8(376, 383, 500, 507, 1256, 1385, 1), frame, 'head', true],
];
const SKIRT = (hem, color) => [
  ['пояс юбки', 'hull', [...section(772, 466, 744, 1254, 1476, 10, 10, 10), ...section(866, 462, 748, 1250, 1480, 10, 10, 10)], color, 'hips'],
  ['юбка', 'hull', split([...section(852, 463, 747, 1251, 1479, 10, 10, 10), ...section(hem, 446, 764, 1236, 1494, 14, 14, 14)], 0), color, 'skirtR', true],
];
Object.assign(COL, { white: 0xf3f2ec, coatGray: 0xd9dbd6, vestGray: 0x6c7380, navy: 0x27324f, glass: 0xcfe3ee, dark: 0x2c2a2a,
  steel: 0x9aa1a8, steelDark: 0x737a82, red: 0xb73a3a, teal: 0x6fb7b2, gloveBlue: 0x3f6fd9 });

Object.assign(COSTUMES, {
  'клерк': { colors: { shirt: 0xf1efe8, boot: 0x3b3431, sole: 0x2b2624 }, parts: [
    ['жилет', 'hull', split(grow('торс', 6, 3), 10), COL.vestGray, 'torso', true],
    ['пуговица', 'decal', { shape: 'circle', at: [589, 660, 1256], n: [0, 0, 1], r: 4 }, COL.dark, 'torso'],
    ['пуговица', 'decal', { shape: 'circle', at: [589, 715, 1256], n: [0, 0, 1], r: 4 }, COL.dark, 'torso'],
    ['галстук', 'hull', band([605, 540], [605, 700], 18, 1290, 1254, 3), COL.navy, 'torso'],
    ['узел галстука', 'hull', box8(526, 546, 594, 616, 1293, 1303, 3), COL.navy, 'torso'],
    ['кончик галстука', 'hull', tri([[596,698],[614,698],[605,716]], 1254, 1257), COL.navy, 'torso'],
    ...glasses(COL.glass, COL.dark),
    ['бейдж', 'hull', box8(784, 828, 482, 514, 1250, 1256, 2), COL.white, 'hips'],
    ['фото', 'decal', { shape: 'rect', at: [492, 800, 1249], n: [0, 0, 1], r: 5, h: 7 }, COL.navy, 'hips'],
    ['телефон', 'hull', box8(782, 842, 700, 728, 1248, 1262, 3), COL.dark, 'hips'],
    ['планшет', 'hull', box8(800, 945, 297, 309, 1318, 1432, 2), COL.wood, 'armR'],
    ['лист', 'hull', box8(812, 938, 294, 298, 1324, 1426, 1), COL.white, 'armR'],
  ]},
  'врач': { hide: ['волосы'], stride: 0.45, colors: { shirt: COL.teal }, parts: [
    ...coat(COL.white, COL.coatGray),
    ['шапочка', 'hull', ring(HH.cx, 318, HH.cz, HH.rb * 0.93, 70, 12, HH.rb * 0.62), COL.white, 'head'],
    ['рефлектор', 'hull', discZ(605, 292, HH.cz - HH.rb * 0.93 - 8, 26, 6), COL.steel, 'head'],
    ['маска', 'hull', box8(404, 468, 524, 686, 1244, 1258, 7), 0xa9d6ec, 'head'],
    ['завязка', 'hull', box8(414, 420, 503, 524, 1258, 1392, 1), 0xa9d6ec, 'head', true],
    ['фонендоскоп', 'hull', band([560, 528], [568, 640], 8, 1295, 1254, 4), COL.dark, 'torso'],
    ['фонендоскоп', 'hull', band([650, 528], [642, 640], 8, 1295, 1254, 4), COL.dark, 'torso'],
    ['мембрана', 'hull', discZ(568, 652, 1247, 12, 5), COL.steel, 'torso'],
    ['планшет', 'hull', box8(800, 945, 297, 309, 1318, 1432, 2), COL.wood, 'armR'],
  ]},
  'учёный': { stride: 0.45, colors: { shirt: 0x6b5bc9 }, parts: [
    ...coat(COL.white, COL.coatGray, 980),
    ['очки защитные', 'hull', box8(360, 404, 520, 600, 1238, 1252, 6), 0x34404c, 'head', true],
    ['стекло', 'decal', { shape: 'rect', at: [560, 382, 1238], n: [0, 0, 1], r: 30, h: 14 }, COL.glass, 'head', true],
    ['ремешок очков', 'hull', box8(372, 392, 500, 507, 1252, 1472, 2), 0x34404c, 'head', true],
    ['ремешок сзади', 'hull', box8(372, 392, 500, 710, 1466, 1474, 2), 0x34404c, 'head'],
    ['шнурок', 'hull', band([566, 528], [585, 640], 6, 1292, 1252, 3), COL.red, 'torso'],
    ['шнурок', 'hull', band([644, 528], [625, 640], 6, 1292, 1252, 3), COL.red, 'torso'],
    ['пропуск', 'hull', box8(636, 690, 585, 625, 1246, 1252, 2), COL.white, 'torso'],
    ['ручка', 'hull', ring(690, 640, 1252, 4, 32, 6), COL.gloveBlue, 'torso'],
    ['ручка', 'hull', ring(702, 640, 1252, 4, 30, 6), COL.red, 'torso'],
    ['перчатка', 'hull', prism(fatter(FIST, 6), 1315, 1440, 8), COL.gloveBlue, 'armR', true],
    ['прибор', 'hull', box8(800, 862, 742, 772, 1298, 1362, 3), COL.dark, 'hips'],
    ['экран', 'decal', { shape: 'rect', at: [773, 828, 1330], n: [1, 0, 0], r: 18, h: 14 }, 0x7be08a, 'hips'],
  ]},
});
// шлем рыцаря — закрывает всю голову; колпак повара; треуголка пирата — тоже по голове
const KH = fitCrown(505, 222, 0.84, 0, undefined, 8, 8);
Object.assign(COSTUMES, {
  'рыцарь': { hide: ['волосы'], under: ['голова', 'ухо', 'глаз', 'блик', 'бровь', 'рот', 'пряди', 'затылок', 'торс', 'вырез', 'голень'], colors: { shirt: 0x8e2f2f, boot: COL.steel, sole: COL.steelDark }, parts: [
    ['шлем', 'hull', ring(KH.cx, KH.y, KH.cz, KH.rb, KH.h, 8, KH.rt), COL.steel, 'head'],
    ['макушка шлема', 'hull', ring(KH.cx, KH.y - KH.h, KH.cz, KH.rt, 30, 8, KH.rt * 0.55), COL.steel, 'head'],
    ['прорезь', 'decal', { shape: 'rect', ...onCrown(KH, 270, 0.52), r: 60, h: 6 }, COL.dark, 'head'],
    ['гребень', 'hull', box8(KH.y - KH.h - 85, KH.y - KH.h - 20, 597, 613, KH.cz - 50, KH.cz + 70, 4), COL.red, 'head'],
    ['кираса', 'hull', grow('торс', 8, 4), COL.steel, 'torso'],
    ['наплечник', 'hull', grow('втулка', 24, 20), COL.steel, 'armR', true],
    ['наплечник низ', 'hull', grow('рукав', 14, -40), COL.steelDark, 'armR', true],
    ['перчатка', 'hull', prism(fatter(FIST, 7), 1313, 1442, 8), COL.steel, 'armR', true],
    ['раструб', 'hull', beam([[306,826],[402,790]], [[310,858],[406,826]], 1306, 1450, 8), COL.steelDark, 'armR', true],
    ['пояс', 'hull', box8(770, 816, 458, 752, 1250, 1478, 10), COL.leather, 'hips'],
    ['набедренник', 'hull', box8(812, 890, 472, 598, 1250, 1266, 6), COL.steelDark, 'hips', true],
    ['поножи', 'hull', grow('голень', 7), COL.steel, 'legR', true],
    ['наколенник', 'hull', box8(955, 1005, 482, 568, 1258, 1282, 8), COL.steel, 'legR', true],
    ['ножны', 'hull', box8(820, 1040, 760, 774, 1318, 1346, 3), COL.leather, 'hips'],
    ['гарда', 'hull', box8(806, 818, 744, 790, 1314, 1350, 2), COL.gold, 'hips'],
    ['рукоять', 'hull', ring(767, 806, 1332, 6, 34, 6), COL.leather, 'hips'],
  ]},
  'повар': { hide: ['волосы'], stride: 0.35, colors: { shirt: COL.white, jeans: 0x40444c, jeansCuff: 0x4d525b }, parts: [
    ['колпак', 'hull', ring(HH.cx, 318, HH.cz, HH.rb * 0.92, 40, 12), COL.white, 'head'],
    ['колпак верх', 'hull', ring(HH.cx, 280, HH.cz, HH.rb * 0.95, 150, 12, HH.rb * 1.22), COL.white, 'head'],
    ['колпак шапка', 'hull', ring(HH.cx, 130, HH.cz, HH.rb * 1.22, 40, 12, HH.rb * 0.8), COL.white, 'head'],
    ['китель', 'hull', grow('торс', 6, 3), COL.white, 'torso'],
    ...[650, 700, 750].flatMap((y) => [['пуговица', 'decal', { shape: 'circle', at: [575, y, 1256], n: [0, 0, 1], r: 5 }, COL.dark, 'torso', true]]),
    ['платок', 'hull', tri([[556,522],[654,522],[605,566]], 1290, 1300), COL.red, 'torso'],
    ['фартук', 'hull', box8(782, 930, 492, 718, 1238, 1248, 4), COL.coatGray, 'hips'],
    ['завязки', 'hull', box8(782, 794, 458, 752, 1244, 1480, 6), COL.coatGray, 'hips'],
    ['половник', 'hull', ring(356, 1000, 1378, 6, 180, 6), COL.steel, 'armR'],
    ['черпак', 'hull', ring(356, 1028, 1378, 22, 26, 8, 16), COL.steel, 'armR'],
  ]},
  'пират': { hide: ['волосы'], stride: 0.45, colors: { shirt: 0xf0ebe0, jeans: 0x5a4636, jeansCuff: 0x6b5543, boot: 0x2f2a27, sole: 0x221e1c }, parts: [
    ['треуголка', 'hull', ring(HH.cx, 318, HH.cz, HH.rb * 0.95, 95, 8, HH.rb * 0.78), COL.dark, 'head'],
    ['поля треуголки', 'hull', [...ring(HH.cx, 320, HH.cz, HH.rb + 6, 8, 8),
      [HH.cx, 262, HH.cz - HH.rb - 95], [HH.cx - (HH.rb + 95) * 0.87, 255, HH.cz + (HH.rb + 95) * 0.5], [HH.cx + (HH.rb + 95) * 0.87, 255, HH.cz + (HH.rb + 95) * 0.5]], COL.dark, 'head'],
    ['череп', 'decal', { shape: 'circle', ...onCrown({ ...HH, rb: HH.rb * 0.95, rt: HH.rb * 0.78, h: 95, y: 318, n: 8 }, 270, 0.62), r: 12 }, COL.white, 'head'],
    ['повязка', 'hull', box8(370, 404, 540, 584, 1244, 1254, 5), COL.dark, 'head'],
    ['шнур повязки', 'hull', band([520, 352], [690, 330], 5, 1254, 1256, 2), COL.dark, 'head'],
    ...coat(0x7d2230, 0xc9a24a, 1000, 32),
    ...[640, 690, 740].flatMap((y) => [['пуговица', 'decal', { shape: 'circle', at: [566, y, 1252], n: [0, 0, 1], r: 6 }, COL.gold, 'torso', true]]),
    ['кушак', 'hull', box8(772, 816, 456, 754, 1246, 1480, 10), COL.red, 'hips'],
    ['клинок', 'hull', box8(830, 1030, 762, 770, 1305, 1340, 2), COL.steel, 'hips'],
    ['гарда', 'hull', box8(814, 830, 746, 786, 1300, 1345, 3), COL.gold, 'hips'],
    ['рукоять', 'hull', ring(766, 814, 1322, 6, 34, 6), COL.leather, 'hips'],
  ]},
  'девушка': { hide: ['волосы', 'пряди', 'затылок'], stride: 0.45, colors: { shirt: 0xe0607e, jeans: 0x3d5a8c }, parts: [
    ['каре', 'hull', [[520,352,1247],[690,352,1247],[520,262,1260],[690,262,1260],[532,238,1300],[678,238,1300],[532,242,1445],[678,242,1445],
      [490,280,1290],[720,280,1290],[488,286,1462],[722,286,1462],[490,345,1268],[720,345,1268],[520,280,1490],[690,280,1490],
      [492,352,1300],[718,352,1300],[492,352,1470],[718,352,1470]], 0x5b3a29, 'head'],
    ...LASHES,
    ['каре бок', 'hull', box8(330, 474, 482, 508, 1286, 1480, 7), 0x5b3a29, 'head', true],
    ['каре сзади', 'hull', box8(330, 474, 500, 710, 1462, 1492, 7), 0x5b3a29, 'head'],
    ...SKIRT(950, 0x37415e),
  ]},
  'спортсменка': { hide: ['волосы', 'пряди', 'затылок'], colors: { shirt: 0xf2c94c, jeans: 0x2e3440, jeansCuff: 0x3b4250, boot: 0xf2f2f2, sole: 0xc9c9c9 }, parts: [
    ['причёска', 'hull', [[520,337,1255],[690,337,1255],[530,250,1298],[680,250,1298],[530,252,1442],[680,252,1442],[490,298,1298],[720,298,1298],
      [490,300,1460],[720,300,1460],[492,346,1300],[718,346,1300],[520,290,1486],[690,290,1486],[502,440,1476],[708,440,1476],[492,440,1440],[718,440,1440]], 0xd9b26a, 'head'],
    ['хвост', 'hull', [[585,292,1480],[625,292,1480],[585,322,1502],[625,322,1502],[592,470,1522],[618,470,1522],[600,525,1506],[610,525,1506]], 0xd9b26a, 'head'],
    ['резинка', 'hull', box8(296, 314, 581, 629, 1478, 1508, 4), COL.red, 'head'],
    ...LASHES,
    ['повязка', 'hull', [...section(318, 503, 707, 1248, 1470, 22, 22, 22), ...section(336, 503, 707, 1248, 1470, 22, 22, 22)], COL.red, 'head'],
    ['полоса', 'decal', { shape: 'rect', at: [605, 700, 1261], n: [0, 0, 1], r: 118, h: 6 }, COL.white, 'torso'],
  ]},
});
// космонавт: шлем-сфера закрывает всю голову, скафандр — раздутые детали тела
const AH = fitCrown(525, 300, 0.75, 0, undefined, 12, 16);
const visor = [222, 246, 270, 294, 318].flatMap((d) => [335, 465].map((y) => { const a = d * Math.PI / 180;
  return [AH.cx + (AH.rb + 5) * Math.cos(a), y, AH.cz + (AH.rb + 5) * Math.sin(a)]; }));
COSTUMES['космонавт'] = { hide: ['волосы', 'пряди', 'затылок', 'пряжка', 'шлёвка', 'шлёвка бок', 'шлёвка зад'], stride: 0.45,
  under: ['голова', 'ухо', 'шея', 'вырез', 'глаз', 'блик', 'бровь', 'рот', 'торс', 'рукав', 'отворот', 'втулка', 'предплечье', 'выемка', 'бедро', 'голень', 'втулка бедра'],
  colors: { shirt: 0xeceef0, jeans: 0xeceef0, jeansCuff: 0xd2d6db, boot: 0x9aa0a6, sole: 0x7d838a, belt: 0xb9bec4 }, parts: [
    ['ворот шлема', 'hull', ring(AH.cx, 545, AH.cz, AH.rb * 0.9, 30, 12, AH.rb * 0.97), 0xc9cdd2, 'head'],
    ['шлем', 'hull', ring(AH.cx, 515, AH.cz, AH.rb, 120, 12), 0xeceef0, 'head'],
    ['купол', 'hull', ring(AH.cx, 395, AH.cz, AH.rb, 65, 12, AH.rb * 0.9), 0xeceef0, 'head'],
    ['макушка', 'hull', ring(AH.cx, 330, AH.cz, AH.rb * 0.9, 75, 12, AH.rb * 0.5), 0xeceef0, 'head'],
    ['визор', 'hull', visor, 0xd4a72c, 'head'],
    ['скафандр', 'hull', grow('торс', 8, 4), 0xeceef0, 'torso'],
    ['рукав скафандра', 'hull', grow('рукав', 10, 8), 0xeceef0, 'armR', true],
    ['плечо скафандра', 'hull', grow('втулка', 10, 10), 0xeceef0, 'armR', true],
    ['манжета', 'hull', grow('отворот', 9), 0xd2d6db, 'armR', true],
    ['рука скафандра', 'hull', grow('предплечье', 6), 0xeceef0, 'armR', true],
    ['перчатка', 'hull', prism(fatter(FIST, 9), 1312, 1444, 9), 0x9aa0a6, 'armR', true],
    ['нашивка', 'decal', { shape: 'rect', at: [393, 610, 1376], n: [-0.93, 0.36, 0], r: 16, h: 11, rot: 0.35 }, 0xe8743b, 'armR', true],
    ['пульт', 'hull', box8(640, 724, 545, 665, 1243, 1254, 4), 0xd2d6db, 'torso'],
    ['кнопка', 'decal', { shape: 'circle', at: [640, 664, 1243], n: [0, 0, 1], r: 8 }, 0xe8743b, 'torso'],
    ['кнопка', 'decal', { shape: 'circle', at: [640, 700, 1243], n: [0, 0, 1], r: 8 }, 0x4caf6a, 'torso'],
    ['индикатор', 'decal', { shape: 'rect', at: [574, 664, 1243], n: [0, 0, 1], r: 16, h: 5 }, 0xf2c94c, 'torso'],
    ['индикатор', 'decal', { shape: 'rect', at: [574, 700, 1243], n: [0, 0, 1], r: 16, h: 5 }, 0x5aa9e6, 'torso'],
    ['пояс скафандра', 'hull', box8(770, 818, 458, 752, 1250, 1480, 10), 0xb9bec4, 'hips'],
    ['ранец', 'hull', box8(540, 790, 498, 712, 1478, 1565, 14), 0xeceef0, 'torso'],
    ['клапан ранца', 'hull', box8(560, 610, 520, 690, 1560, 1570, 4), 0xc9cdd2, 'torso'],
    ['значок', 'decal', { shape: 'rect', at: [712, 640, 1520], n: [1, 0, 0], r: 12, h: 16 }, 0xf2c94c, 'torso'],
    ['штанина скафандра', 'hull', grow('бедро', 7), 0xeceef0, 'legR', true],
    ['голень скафандра', 'hull', grow('голень', 7), 0xeceef0, 'legR', true],
]};

let STRIDE = 0.55;
const WORN = {};
let CUR_OUTFIT = null;
function wear(name, extra) {                     // надеть костюм (null — снять всё); extra — перекраска поверх
  name = ALIASES[name] ?? name;
  CUR_OUTFIT = name;
  for (const objs of Object.values(WORN)) for (const o of objs) o.visible = false;
  for (const objs of Object.values(OBJ)) for (const o of objs) o.visible = true;
  STRIDE = 0.55;
  for (const objs of Object.values(OBJ)) for (const o of objs) if (o.userData.base !== undefined) o.material.color.setHex(o.userData.base);
  const c = COSTUMES[name]; if (!c) return;
  const recolor = { ...(c.colors || {}) };
  for (const [k, v] of Object.entries(extra || {})) recolor[k] = COLOR(v);
  if (recolor.shirt !== undefined && recolor.cuff === undefined) recolor.cuff = new THREE.Color(recolor.shirt).lerp(new THREE.Color(0xffffff), 0.22).getHex();
  for (const [key, hex] of Object.entries(recolor))
    for (const objs of Object.values(OBJ)) for (const o of objs) if (o.userData.base === COL[key]) o.material.color.setHex(hex);
  if (!WORN[name]) { SINK = WORN[name] = []; buildParts(c.parts); SINK = null; }
  for (const o of WORN[name]) o.visible = true;
  for (const n of c.hide || []) for (const o of OBJ[n] || []) o.visible = false;
  STRIDE = c.stride ?? 0.55;
  if (c.face) setFace(c.face);
}

// ── Оптимизация для игры: фигура = одна сетка со скелетом (жёсткая привязка вершин к суставам) ──────────────
// Один общий материал на всех (цвет в вершинах, плоское затенение), одна геометрия на «костюм + лицо» для всех фигур,
// стёкла — отдельной полупрозрачной сеткой, невидимое под костюмом (under) не запекается. Линии — опция.
const BONE_NAMES = Object.keys(BONES);
// стиль Punto (merci-start, src/splash/models/kit.ts facets + src/style/base.ts lit/evenFaces): матовый Standard,
// цвет на грани — верх как есть, бока на 20 % в фиолетовую тень островов, низ на 35 %; разнобой оттенка по плоским граням
export let LOOK = 'punto';                          // 'punto' — стиль островов; 'flat' — старая заливка
export function setLook(l) { LOOK = l; for (const k in BAKED) delete BAKED[k]; }
const GLASS = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x161b33, side: THREE.BackSide });
OUTLINE.onBeforeCompile = (sh) => { sh.vertexShader = 'attribute vec3 onormal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += onormal * 0.011;'); };
const BAKED = {};
function bake(costume, face, colors) {            // → { body, glass, stats } — кешируется
  const key = (costume || '') + '|' + face + '|' + JSON.stringify(colors || {});
  if (BAKED[key]) return BAKED[key];
  const t0 = performance.now();
  const prevOutfit = CUR_OUTFIT, prevFace = FACE;
  wear(costume, colors); setFace(face); resetPose(); model.updateMatrixWorld(true);
  const under = new Set((COSTUMES[costume] || {}).under || []);
  const acc = { body: { p: [], c: [], i: [], part: [] }, glass: { p: [], c: [], i: [], part: [] } };
  let partId = 0;
  model.traverse((o) => {
    if (!o.isMesh || o.isLineSegments2 || !o.visible || under.has(o.name)) return;
    let up = o.parent; while (up && up !== model) { if (!up.visible) return; up = up.parent; }
    const A = o.material.transparent ? acc.glass : acc.body, bi = BONE_NAMES.indexOf(o.parent.name);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, P = g.attributes.position, col = o.material.color;
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), fc = new THREE.Color();
    for (let k = 0; k < P.count; k += 3) {
      fc.copy(col);
      if (LOOK === 'punto' && !o.material.transparent) {   // стиль островов (look.js)
        va.fromBufferAttribute(P, k); vb.fromBufferAttribute(P, k + 1); vc.fromBufferAttribute(P, k + 2);
        facetColor(col.getHex(), vb.sub(va).cross(vc.sub(va)).normalize(), partId, fc);
      }
      for (let j = 0; j < 3; j++) { A.p.push(P.getX(k + j), P.getY(k + j), P.getZ(k + j)); A.c.push(fc.r, fc.g, fc.b); A.i.push(bi); A.part.push(partId); }
    }
    partId++;
  });
  const make = ({ p, c, i, part }) => {
    if (!p.length) return null;
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(i.flatMap((b) => [b, 0, 0, 0]), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(i.flatMap(() => [1, 0, 0, 0]), 4));
    g.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
    g = mergeVertices(g);                           // общие вершины внутри детали (плоское затенение нормали не требует)
    // нормали «для обводки»: усреднённые по детали, чтобы оболочка не рвалась на рёбрах
    const P = g.attributes.position, pr = g.attributes.part, idx = g.index.array, on = new Float32Array(P.count * 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c3 = new THREE.Vector3(), n = new THREE.Vector3();
    for (let k = 0; k < idx.length; k += 3) {
      a.fromBufferAttribute(P, idx[k]); b.fromBufferAttribute(P, idx[k + 1]); c3.fromBufferAttribute(P, idx[k + 2]);
      n.subVectors(c3, b).cross(a.clone().sub(b)).normalize();
      for (const v of [idx[k], idx[k + 1], idx[k + 2]]) { on[v * 3] += n.x; on[v * 3 + 1] += n.y; on[v * 3 + 2] += n.z; }
    }
    // одинаковые точки разных треугольников одной детали — одна нормаль
    const hash = new Map();
    for (let v = 0; v < P.count; v++) { const h = pr.getX(v) + ':' + P.getX(v).toFixed(4) + ',' + P.getY(v).toFixed(4) + ',' + P.getZ(v).toFixed(4);
      if (!hash.has(h)) hash.set(h, [0, 0, 0, []]); const e = hash.get(h); e[0] += on[v * 3]; e[1] += on[v * 3 + 1]; e[2] += on[v * 3 + 2]; e[3].push(v); }
    for (const [x, y, z, vs] of hash.values()) { const L = Math.hypot(x, y, z) || 1; for (const v of vs) { on[v * 3] = x / L; on[v * 3 + 1] = y / L; on[v * 3 + 2] = z / L; } }
    g.setAttribute('onormal', new THREE.BufferAttribute(on, 3));
    g.deleteAttribute('part');
    g.computeBoundingSphere(); g.boundingSphere.radius *= 1.6;   // запас под позы
    return g;
  };
  const out = { body: make(acc.body), glass: make(acc.glass) };
  out.stats = { tris: out.body.index.count / 3 + (out.glass ? out.glass.index.count / 3 : 0), verts: out.body.attributes.position.count, ms: Math.round(performance.now() - t0) };
  wear(prevOutfit); setFace(prevFace);
  return (BAKED[key] = out);
}
// Костюм из кода (например, его написал ИИ-кодер): регистрирует и сбрасывает кеш — makeFigure сразу запечёт заново
function defineCostume(name, def) {
  const d = { ...def, parts: [...(def.parts || [])], colors: { ...(def.colors || {}) }, hide: [...(def.hide || [])], under: [...(def.under || [])] };
  const walkIn = (w) => {                         // глаголы возвращают детали ['имя', …] и указания { hide, colors, … }
    if (Array.isArray(w)) { if (typeof w[0] === 'string') d.parts.push(w); else w.forEach(walkIn); }
    else if (w && typeof w === 'object') {
      if (w.colors) Object.assign(d.colors, w.colors);
      if (w.hide) d.hide.push(...w.hide);
      if (w.under) d.under.push(...w.under);
      for (const k of ['face', 'walk', 'stride', 'scale']) if (w[k] !== undefined) d[k] = w[k];
    }
  };
  walkIn(def.wear || []);
  for (const k in d.colors) d.colors[k] = COLOR(d.colors[k]);
  COSTUMES[name] = d;
  for (const k in BAKED) if (k.startsWith(name + '|')) delete BAKED[k];
  if (WORN[name]) { for (const o of WORN[name]) o.parent.remove(o); delete WORN[name]; }
  return d;
}
// Игровая фигура: свои кости, общая геометрия. opts.outline — обводка силуэта (+1 вызов)
function makeFigure({ outfit = null, face, outline = false, colors, scale = 1 } = {}) {
  outfit = ALIASES[outfit] ?? outfit;
  face = face ?? COSTUMES[outfit]?.face ?? 'улыбка';
  scale = scale !== 1 ? scale : COSTUMES[outfit]?.scale ?? 1;
  const B = {}, root = new THREE.Group();
  for (const n of BONE_NAMES) { B[n] = new THREE.Bone(); B[n].name = n; }
  for (const n of BONE_NAMES) {
    const b = BONES[n]; (b.parent ? B[b.parent] : root).add(B[n]);
    B[n].position.copy(v3(b.p)).sub(v3(b.parent ? BONES[b.parent].p : BONES.root.p));
  }
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(BONE_NAMES.map((n) => B[n]));
  const G = bake(outfit, face, colors);
  const add = (geo, mat) => { if (!geo) return; const m = new THREE.SkinnedMesh(geo, mat); m.bind(skel); root.add(m); };
  add(G.body, MAT); add(G.glass, GLASS); if (outline) add(G.body, OUTLINE);
  root.scale.setScalar(scale);
  root.userData = { bones: B, stride: (COSTUMES[outfit] || {}).stride ?? 0.55, walk: COSTUMES[outfit]?.walk || 'идёт' };
  return root;
}

// ══ Якоря и глаголы: костюм словами, без координат (для ИИ-кодера; памятка — FIGURES.md) ══════════════
const NAMED = { 'красный': 0xe94b3c, 'тёмно-красный': 0x7d2230, 'оранжевый': 0xff7a2f, 'жёлтый': 0xffc93a, 'зелёный': 0x5fb532,
  'тёмно-зелёный': 0x2f7d3a, 'голубой': 0x3fa9ff, 'синий': 0x3a7fe8, 'тёмно-синий': 0x2b3a6b, 'фиолетовый': 0x8a5ce0,
  'розовый': 0xff6fa8, 'белый': 0xf6f3ec, 'серый': 0x9c9ca6, 'тёмно-серый': 0x4b4f57, 'чёрный': 0x1d1e24, 'коричневый': 0x7a4a2b,
  'светло-коричневый': 0xc98a4b, 'бежевый': 0xe0c9a0, 'золотой': 0xf2b53a, 'серебряный': 0xc9cdd2, 'бирюзовый': 0x2fc4b2 };   // PALETTE Punto
function COLOR(c, dflt = 0x9aa1a8) { if (typeof c === 'number') return c; if (c == null) return dflt; return NAMED[String(c).toLowerCase().replace('ё', 'ё')] ?? NAMED[String(c).toLowerCase().replace('е', 'ё')] ?? dflt; }
const shade = (c, k) => new THREE.Color(c).lerp(new THREE.Color(k > 0 ? 0xffffff : 0x000000), Math.abs(k)).getHex();
const SIZE = (s) => typeof s === 'number' ? s : ({ 'маленький': 0.7, 'средний': 1, 'большой': 1.4 })[s] ?? 1;
const HEMS = { 'бедро': 905, 'колено': 1010, 'голень': 1060, 'пол': 1125 };
const hemY = (h, dflt) => typeof h === 'number' ? h : HEMS[h] ?? dflt;

// якорь: точка [x, y, x сбоку] листа, направление наружу (X вправо, Y вверх, Z вперёд), сустав
const ANCHORS = {
  'грудь': { p: [605, 655, 1262], n: [0, 0, 1], bone: 'torso' },
  'грудь справа': { p: [540, 655, 1262], n: [0, 0, 1], bone: 'torso' }, 'грудь слева': { p: [670, 655, 1262], n: [0, 0, 1], bone: 'torso' },
  'живот': { p: [605, 735, 1262], n: [0, 0, 1], bone: 'torso' },
  'спина': { p: [605, 650, 1466], n: [0, 0, -1], bone: 'torso' },
  'шея': { p: [605, 524, 1299], n: [0, 0, 1], bone: 'torso' },
  'пояс': { p: [605, 794, 1259], n: [0, 0, 1], bone: 'hips' }, 'пояс сзади': { p: [605, 794, 1467], n: [0, 0, -1], bone: 'hips' },
  'пояс справа': { p: [466, 800, 1363], n: [-1, 0, 0], bone: 'hips' }, 'пояс слева': { p: [744, 800, 1363], n: [1, 0, 0], bone: 'hips' },
  'бедро справа': { p: [537, 925, 1273], n: [0, 0, 1], bone: 'legR' }, 'бедро слева': { p: [673, 925, 1273], n: [0, 0, 1], bone: 'legL' },
  'колено справа': { p: [526, 985, 1279], n: [0, 0, 1], bone: 'legR' }, 'колено слева': { p: [684, 985, 1279], n: [0, 0, 1], bone: 'legL' },
  'плечо справа': { p: [440, 545, 1376], n: [-0.5, 0.86, 0], bone: 'armR' }, 'плечо слева': { p: [770, 545, 1376], n: [0.5, 0.86, 0], bone: 'armL' },
  'рука справа': { p: [356, 875, 1378], n: [0, -1, 0], bone: 'armR' }, 'рука слева': { p: [854, 875, 1378], n: [0, -1, 0], bone: 'armL' },
  'макушка': { p: [605, 295, 1365], n: [0, 1, 0], bone: 'head' }, 'лоб': { p: [605, 345, 1252], n: [0, 0, 1], bone: 'head' },
  'лицо': { p: [605, 400, 1251], n: [0, 0, 1], bone: 'head' }, 'рот': { p: [605, 440, 1254], n: [0, -0.03, 1], bone: 'head' },
};
function anchor(name) {
  const a = ANCHORS[name];
  if (!a) throw new Error(`Нет якоря «${name}». Есть: ${Object.keys(ANCHORS).join(', ')}`);
  return a;
}
const isLeft = (name) => /слева/.test(name);
const sideX = (x, name) => (isLeft(name) ? 2 * AX - x : x);       // предмет описан для правой стороны → зеркало
const sideBone = (b, name) => (isLeft(name) ? MIRROR_BONE[b] ?? b : b);
const mirrorPart = ([nm, kind, data, ...rest], name) => {
  if (!isLeft(name)) return [nm, kind, data, ...rest];
  const d2 = kind === 'decal' ? { ...data, at: mx([data.at])[0], n: [-data.n[0], data.n[1], data.n[2]] } : kind === 'poly' ? { ...data, v: mx(data.v) } : mx(data);
  const bone = rest[1]; return [nm, kind, d2, rest[0], MIRROR_BONE[bone] ?? bone, ...rest.slice(2)];
};

// ── одежда ──
const shirt = ({ color }) => ({ colors: { shirt: COLOR(color) } });
const pants = ({ color }) => ({ colors: { jeans: COLOR(color), jeansCuff: shade(COLOR(color), 0.15) } });
const boots = ({ color }) => ({ colors: { boot: COLOR(color), sole: shade(COLOR(color), -0.25) } });
const skin = ({ color }) => ({ colors: { skin: COLOR(color), skinDark: shade(COLOR(color), -0.3) } });
const beltColor = ({ color }) => ({ colors: { belt: COLOR(color) } });
function coatV({ color = 'белый', cuff, hem = 'колено', closed = false }) {
  const c = COLOR(color); return [...coat(c, cuff ? COLOR(cuff) : shade(c, -0.1), hemY(hem, 1010), closed ? 0 : 26), { stride: hemY(hem, 1010) > 1050 ? 0.3 : 0.45 }];
}
const vest = ({ color = 'серый', closed = false }) => [['жилет', 'hull', split(grow('торс', 6, 3), closed ? 0 : 16), COLOR(color), 'torso', true]];
const skirt = ({ color = 'тёмно-синий', hem = 'колено' }) => [...SKIRT(hemY(hem, 960) === 1010 ? 960 : hemY(hem, 960), COLOR(color)), { stride: hemY(hem, 960) > 1050 ? 0.3 : 0.45 }];
const sleeves = ({ color }) => [['длинный рукав', 'hull', beam([[340,708],[442,748]], [[318,838],[394,808]], 1316, 1438, 10), COLOR(color), 'armR', true]];
const dress = ({ color = 'розовый', hem = 'пол' }) => [{ colors: { shirt: COLOR(color), jeans: COLOR(color), jeansCuff: COLOR(color) } }, ['лиф', 'hull', grow('торс', 4, 2), COLOR(color), 'torso'], ...skirt({ color, hem })];
const ears = ({ type = 'эльф' } = {}) => [['ухо эльфа', 'hull', [[486,372,1380],[486,430,1412],[500,372,1376],[500,430,1412],[478,340,1432],[468,300,1462],[492,330,1440]], COL.skin, 'head', true]];
const gloves = ({ color = 'серый', size }) => [['перчатка', 'hull', prism(fatter(FIST, size === 'большой' ? 16 : 6), 1315 - (size === 'большой' ? 10 : 0), 1440 + (size === 'большой' ? 10 : 0), 8), COLOR(color), 'armR', true],
  ['манжета', 'hull', beam([[309,835],[399,801]], [[312,858],[404,826]], 1311, 1444, 8), shade(COLOR(color), -0.15), 'armR', true]];
const apron = ({ color = 'белый' }) => [['фартук', 'hull', box8(782, 930, 492, 718, 1238, 1248, 4), COLOR(color), 'hips'],
  ['завязки', 'hull', box8(782, 794, 458, 752, 1244, 1480, 6), COLOR(color), 'hips'], { stride: 0.35 }];
const scarf = ({ color = 'красный' }) => [['платок', 'hull', tri([[548,522],[662,522],[605,580]], 1288, 1300), COLOR(color), 'torso']];
const pads = ({ color = 'серый' }) => [['наплечник', 'hull', grow('втулка', 22, 18), COLOR(color), 'armR', true]];
const kneepads = ({ color = 'тёмно-серый' }) => [['наколенник', 'hull', box8(952, 1008, 484, 566, 1258, 1280, 8), COLOR(color), 'legR', true]];
function stripes({ color = 'серебряный', on = 'торс' }) {
  const z = { 'торс': 1261, 'жилет': 1255, 'пальто': 1253 }[on] ?? 1261, zb = { 'торс': 1466, 'жилет': 1472, 'пальто': 1474 }[on] ?? 1466, c = COLOR(color);
  const out = [['полоса', 'decal', { shape: 'rect', at: [528, 742, z], n: [0, 0, 1], r: 57, h: 8 }, c, 'torso', true],
    ['полоса', 'decal', { shape: 'rect', at: [605, 742, zb], n: [0, 0, -1], r: 128, h: 8 }, c, 'torso']];
  if (on === 'пальто') out.push(['полоса', 'decal', { shape: 'rect', at: [520, 985, 1241], n: [0, 0.03, 1], r: 58, h: 8 }, c, 'coatR', true],
    ['полоса', 'decal', { shape: 'rect', at: [395, 700, 1376], n: [-0.93, 0.36, 0], r: 22, h: 6, rot: 0.35 }, c, 'armR', true]);
  return out;
}
// ── голова ──
function hat({ shape = 'шляпа', color = 'коричневый', band: trim, veil }) {
  if (veil === 'фата') return [...hat({ shape, color, band: trim }),
    ['фата верх', 'hull', [[565,250,1500],[645,250,1500],[565,250,1528],[645,250,1528],[540,340,1508],[670,340,1508],[540,340,1520],[670,340,1520]], COL.veil, 'head'],
    ['фата', 'hull', [[545,335,1506],[665,335,1506],[545,335,1514],[665,335,1514],[462,790,1500],[748,790,1500],[462,790,1510],[748,790,1510]], COL.veil, 'torso']];
  if (veil) { const H = fitCrown(318, 95, 0.8, 0); return [...hat({ shape, color, band: trim }), ['сетка', 'hull', ring(H.cx, 560, H.cz, H.rb + 40, 245, 12), COL.glass, 'head']]; }
  const c = COLOR(color), b = trim ? COLOR(trim) : shade(c, -0.35), hide = { hide: ['волосы'] };
  if (shape === 'конус') { const H = fitCrown(318, 125, 0.6, 22); return [hide,
    ['поля', 'hull', ring(H.cx, H.y, H.cz, H.rb + 55, 12, 10), c, 'head'], ['тулья', 'hull', ring(H.cx, H.y - 2, H.cz, H.rb, H.h, 8, H.rt, H.dz), c, 'head'],
    ['кончик', 'hull', [...ring(H.cx, H.y - 2 - H.h, H.cz + H.dz, H.rt, 0, 8), [H.cx - 8, H.y - H.h - 150, H.cz + H.dz + 95]], c, 'head'],
    ['лента', 'hull', ring(H.cx, H.y - 2, H.cz, H.rb + 3, 24, 8, H.rb + 3 - 24 * (H.rb - H.rt) / H.h), b, 'head']]; }
  if (shape === 'цилиндр') { const H = fitCrown(318, 150, 0.98, 0, undefined, 12); return [hide,
    ['поля', 'hull', ring(H.cx, H.y, H.cz, H.rb + 32, 10, 12), c, 'head'], ['тулья', 'hull', ring(H.cx, H.y - 2, H.cz, H.rb, H.h, 12, H.rt), c, 'head'],
    ['лента', 'hull', ring(H.cx, H.y - 2, H.cz, H.rb + 3, 26, 12, H.rb + 3), b, 'head']]; }
  if (shape === 'кепка') { const H = fitCrown(322, 90, 0.55, 0, ['голова'], 12, 5); return [hide,
    ['кепка', 'hull', ring(H.cx, H.y, H.cz, H.rb, 45, 12, H.rb * 0.92), c, 'head'], ['верх кепки', 'hull', ring(H.cx, H.y - 45, H.cz, H.rb * 0.92, 45, 12, H.rb * 0.45), c, 'head'],
    ['козырёк', 'hull', [[H.cx - 70, H.y, H.cz - H.rb * 0.8], [H.cx + 70, H.y, H.cz - H.rb * 0.8], [H.cx - 62, H.y + 10, H.cz - H.rb - 70], [H.cx + 62, H.y + 10, H.cz - H.rb - 70],
      [H.cx - 70, H.y - 7, H.cz - H.rb * 0.8], [H.cx + 70, H.y - 7, H.cz - H.rb * 0.8], [H.cx - 62, H.y + 3, H.cz - H.rb - 70], [H.cx + 62, H.y + 3, H.cz - H.rb - 70]], b, 'head']]; }
  if (shape === 'берет') { const H = fitCrown(318, 55, 0.9, 0, ['голова'], 12, 5); return [hide,
    ['берет', 'hull', ring(H.cx, H.y, H.cz, H.rb, 25, 12, H.rb * 1.12), c, 'head'], ['верх берета', 'hull', ring(H.cx, H.y - 25, H.cz + 10, H.rb * 1.12, 28, 12, H.rb * 0.55), c, 'head']]; }
  if (shape === 'поварской колпак') { const H = fitCrown(322, 135, 0.5, 0, undefined, 12); return [hide,
    ['колпак', 'hull', ring(H.cx, 318, H.cz, H.rb * 0.92, 40, 12), c, 'head'], ['колпак верх', 'hull', ring(H.cx, 280, H.cz, H.rb * 0.95, 150, 12, H.rb * 1.22), c, 'head'],
    ['колпак шапка', 'hull', ring(H.cx, 130, H.cz, H.rb * 1.22, 40, 12, H.rb * 0.8), c, 'head']]; }
  if (shape === 'колпак') { const H = fitCrown(320, 190, 0.12, 30, undefined, 8); return [hide,
    ['колпак', 'hull', [...ring(H.cx, H.y, H.cz, H.rb, 0, 8), [H.cx, H.y - H.h - 40, H.cz + H.dz + 25]], c, 'head'],
    ['опушка', 'hull', ring(H.cx, H.y + 6, H.cz, H.rb + 8, 24, 8, H.rb + 4), b, 'head']]; }
  if (shape === 'шапочка') { const H = fitCrown(322, 70, 0.8, 0, ['голова'], 12, 5); return [hide,
    ['шапочка', 'hull', ring(H.cx, H.y, H.cz, H.rb, H.h, 12, H.rt), c, 'head']]; }
  if (shape === 'фуражка') { const H = fitCrown(322, 70, 0.8, 0, ['голова'], 12, 5); return [hide,
    ['околыш', 'hull', ring(H.cx, H.y, H.cz, H.rb, 30, 12, H.rb), b, 'head'], ['тулья', 'hull', ring(H.cx, H.y - 30, H.cz + 8, H.rb, 40, 12, H.rb * 1.18), c, 'head'],
    ['козырёк', 'hull', [[H.cx - 62, H.y, H.cz - H.rb * 0.85], [H.cx + 62, H.y, H.cz - H.rb * 0.85], [H.cx - 54, H.y + 12, H.cz - H.rb - 45], [H.cx + 54, H.y + 12, H.cz - H.rb - 45],
      [H.cx - 62, H.y - 6, H.cz - H.rb * 0.85], [H.cx + 62, H.y - 6, H.cz - H.rb * 0.85], [H.cx - 54, H.y + 6, H.cz - H.rb - 45], [H.cx + 54, H.y + 6, H.cz - H.rb - 45]], COL.dark, 'head'],
    ['кокарда', 'decal', { shape: 'circle', ...onCrown({ ...H, rb: H.rb, rt: H.rb, h: 30, n: 12 }, 270, 0.5), r: 9, lift: 3 }, COL.gold, 'head']]; }
  if (shape === 'бескозырка') { const H = fitCrown(322, 50, 0.95, 0, ['голова'], 12, 5); return [hide,
    ['околыш', 'hull', ring(H.cx, H.y, H.cz, H.rb, 26, 12, H.rb), b, 'head'], ['верх', 'hull', ring(H.cx, H.y - 26, H.cz, H.rb, 22, 12, H.rb * 1.1), c, 'head'],
    ['ленточка', 'hull', band([H.cx - 10, H.y], [H.cx - 22, H.y + 110], 10, H.cz + H.rb, H.cz + H.rb + 6, 3), b, 'head'],
    ['ленточка', 'hull', band([H.cx + 10, H.y], [H.cx + 22, H.y + 110], 10, H.cz + H.rb, H.cz + H.rb + 6, 3), b, 'head']]; }
  if (shape === 'тюрбан') { const H = fitCrown(322, 85, 0.6, 0, undefined, 12); return [hide,
    ['тюрбан', 'hull', ring(H.cx, H.y, H.cz, H.rb, 45, 12, H.rb * 1.08), c, 'head'], ['верх тюрбана', 'hull', ring(H.cx, H.y - 45, H.cz, H.rb * 1.08, 45, 12, H.rb * 0.5), c, 'head'],
    ['камень', 'decal', { shape: 'circle', at: [H.cx, H.y - 40, H.cz - H.rb * 1.04], n: [0, 0, 1], r: 11, lift: 4 }, 0xc8312f, 'head']]; }
  if (shape === 'шапка') { const H = fitCrown(322, 105, 0.45, 6, ['голова'], 12, 4); return [hide,
    ['шапка', 'hull', ring(H.cx, H.y, H.cz, H.rb, 55, 12, H.rb * 0.93, 3), c, 'head'], ['верх шапки', 'hull', ring(H.cx, H.y - 55, H.cz + 3, H.rb * 0.93, 50, 12, H.rb * 0.45, 3), c, 'head'],
    ['отворот шапки', 'hull', ring(H.cx, H.y + 4, H.cz, H.rb + 3, 28, 12, H.rb + 2), b, 'head'],
    ['помпон', 'hull', [...ring(H.cx, H.y - 100, H.cz + 6, 18, 0, 8), ...ring(H.cx, H.y - 122, H.cz + 6, 26, 0, 8), ...ring(H.cx, H.y - 146, H.cz + 6, 15, 0, 8)], b, 'head']]; }
  if (shape === 'ушанка') { const H = fitCrown(322, 80, 0.75, 0, undefined, 12); return [hide,
    ['ушанка', 'hull', ring(H.cx, H.y, H.cz, H.rb, H.h, 12, H.rt), c, 'head'], ['мех', 'hull', ring(H.cx, H.y + 4, H.cz, H.rb + 10, 34, 12, H.rb + 8), b, 'head'],
    ['ухо шапки', 'hull', box8(H.y, H.y + 120, 470, 498, 1300, 1430, 8), b, 'head', true]]; }
  if (shape === 'капюшон') { const H = fitCrown(320, 95, 0.55, 18, undefined, 10); return [{ hide: ['волосы', 'пряди', 'затылок'] },
    ['капюшон', 'hull', ring(H.cx, H.y, H.cz + 12, H.rb, H.h, 10, H.rt, H.dz), c, 'head'],
    ['капюшон бок', 'hull', box8(H.y - 10, 505, 472, 500, 1300, 1495, 10), c, 'head', true],
    ['капюшон сзади', 'hull', box8(H.y - 10, 560, 495, 715, 1470, 1505, 12), c, 'head']]; }
  if (shape === 'треуголка') { const H = fitCrown(318, 95, 0.8, 0, undefined, 8); return [hide,
    ['треуголка', 'hull', ring(H.cx, H.y, H.cz, H.rb * 0.95, 95, 8, H.rb * 0.78), c, 'head'],
    ['поля', 'hull', [...ring(H.cx, H.y + 2, H.cz, H.rb + 6, 8, 8), [H.cx, H.y - 56, H.cz - H.rb - 95], [H.cx - (H.rb + 95) * 0.87, H.y - 63, H.cz + (H.rb + 95) * 0.5], [H.cx + (H.rb + 95) * 0.87, H.y - 63, H.cz + (H.rb + 95) * 0.5]], c, 'head']]; }
  if (shape === 'нимб') return [...Array.from({ length: 10 }, (_, k) => { const a = k * Math.PI / 5, a2 = a + Math.PI / 5;
    return ['нимб', 'hull', [[605 + 95 * Math.cos(a), 170, 1370 + 95 * Math.sin(a)], [605 + 95 * Math.cos(a2), 170, 1370 + 95 * Math.sin(a2)], [605 + 80 * Math.cos(a), 170, 1370 + 80 * Math.sin(a)], [605 + 80 * Math.cos(a2), 170, 1370 + 80 * Math.sin(a2)],
      [605 + 95 * Math.cos(a), 180, 1370 + 95 * Math.sin(a)], [605 + 95 * Math.cos(a2), 180, 1370 + 95 * Math.sin(a2)], [605 + 80 * Math.cos(a), 180, 1370 + 80 * Math.sin(a)], [605 + 80 * Math.cos(a2), 180, 1370 + 80 * Math.sin(a2)]], COLOR(color, 0xf2c94c), 'head']; })];
  if (shape === 'рожки') return [['рог', 'hull', [...ring(545, 262, 1330, 16, 0, 6), [528, 192, 1325]], c, 'head', true]];
  if (shape === 'антенки') return [['антенка', 'hull', band([560, 250], [530, 150], 6, 1350, 1356, 6), COL.dark, 'head', true], ['шарик', 'hull', ring(530, 160, 1353, 14, 26, 8, 14), c, 'head', true]];
  if (shape === 'наушники') return [['дуга', 'hull', [...section(232, 495, 715, 1352, 1382, 30, 30, 6), ...section(244, 495, 715, 1352, 1382, 30, 30, 6)], COL.dark, 'head'],
    ['наушник', 'hull', box8(360, 440, 474, 500, 1340, 1420, 10), c, 'head', true], ['дужка', 'hull', box8(244, 360, 486, 498, 1360, 1376, 3), COL.dark, 'head', true]];
  if (shape === 'диадема') return [['диадема', 'hull', [...section(300, 503, 707, 1252, 1440, 30, 30, 30), ...section(312, 503, 707, 1252, 1440, 30, 30, 30)], c, 'head'],
    ['камень', 'hull', tri([[590,300],[620,300],[605,262]], 1246, 1254), 0x6fb7e6, 'head']];
  if (shape === 'тыква') { const H = fitCrown(520, 270, 0.6, 0, undefined, 10, 10); return [{ hide: ['волосы', 'пряди', 'затылок'], under: ['голова', 'ухо', 'глаз', 'блик', 'бровь', 'рот'] },
    ['тыква', 'hull', ring(H.cx, 520, H.cz, H.rb * 0.75, 60, 10, H.rb * 1.05), c, 'head'], ['тыква верх', 'hull', ring(H.cx, 460, H.cz, H.rb * 1.05, 200, 10, H.rb * 0.55), c, 'head'],
    ['хвостик', 'hull', ring(H.cx, 262, H.cz, 12, 40, 6, 9), 0x5a7a3a, 'head'],
    ['глаз тыквы', 'hull', tri([[555,370],[585,370],[570,345]], H.cz - H.rb * 1.02 - 4, H.cz - H.rb * 1.02 + 6), COL.dark, 'head', true],
    ['рот тыквы', 'hull', tri([[545,420],[665,420],[650,445],[620,435],[605,450],[590,435],[560,445]], H.cz - H.rb * 1.02 - 4, H.cz - H.rb * 1.02 + 6), COL.dark, 'head']]; }
  if (shape === 'корона') { const out = [['обруч', 'hull', ring(605, 268, 1370, 108, 30, 8, 112), c, 'head']];
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) * Math.PI / 4, a1 = a - 0.18, a2 = a + 0.18;
      out.push(['зубец', 'hull', [[605 + 110 * Math.cos(a1), 238, 1370 + 110 * Math.sin(a1)], [605 + 110 * Math.cos(a2), 238, 1370 + 110 * Math.sin(a2)],
        [605 + 100 * Math.cos(a), 238, 1370 + 100 * Math.sin(a)], [605 + 113 * Math.cos(a), 198, 1370 + 113 * Math.sin(a)]], c, 'head']); }
    out.push(['камень', 'decal', { shape: 'circle', at: [605, 254, 1258], n: [0, 0, 1], r: 8 }, 0xc8312f, 'head']); return out; }
  if (shape === 'бандана') return [['повязка', 'hull', [...section(318, 503, 707, 1248, 1470, 22, 22, 22), ...section(336, 503, 707, 1248, 1470, 22, 22, 22)], c, 'head'],
    ['узел', 'hull', ring(605, 340, 1480, 12, 22, 6), c, 'head']];
  // по умолчанию — шляпа с полями
  const H = fitCrown(318, 95, 0.8, 0); return [hide,
    ['тулья', 'hull', ring(H.cx, H.y, H.cz, H.rb * 0.95, H.h, 8, H.rb * 0.78), c, 'head'],
    ['поля', 'hull', [...ring(H.cx, H.y + 2, H.cz, H.rb + 62, 8, 12), [H.cx - H.rb - 70, H.y - 26, H.cz], [H.cx + H.rb + 70, H.y - 26, H.cz]], c, 'head'],
    ['лента', 'hull', ring(H.cx, H.y - 4, H.cz, H.rb * 0.95 + 3, 16, 8, H.rb * 0.93 + 3), b, 'head']];
}
function helmet({ shape = 'купол', color = 'жёлтый', visor = 'золотой', brim }) {
  const c = COLOR(color);
  if (shape === 'ведро') return [{ hide: ['волосы'], under: ['голова', 'ухо', 'глаз', 'блик', 'бровь', 'рот', 'пряди', 'затылок'] },
    ['шлем', 'hull', ring(KH.cx, KH.y, KH.cz, KH.rb, KH.h, 8, KH.rt), c, 'head'], ['макушка шлема', 'hull', ring(KH.cx, KH.y - KH.h, KH.cz, KH.rt, 30, 8, KH.rt * 0.55), c, 'head'],
    ['прорезь', 'decal', { shape: 'rect', ...onCrown(KH, 270, 0.52), r: 60, h: 6 }, COL.dark, 'head']];
  if (shape === 'сфера') return [{ hide: ['волосы', 'пряди', 'затылок'], under: ['голова', 'ухо', 'глаз', 'блик', 'бровь', 'рот'] },
    ['ворот шлема', 'hull', ring(AH.cx, 545, AH.cz, AH.rb * 0.9, 30, 12, AH.rb * 0.97), shade(c, -0.12), 'head'],
    ['шлем', 'hull', ring(AH.cx, 515, AH.cz, AH.rb, 120, 12), c, 'head'], ['купол', 'hull', ring(AH.cx, 395, AH.cz, AH.rb, 65, 12, AH.rb * 0.9), c, 'head'],
    ['макушка', 'hull', ring(AH.cx, 330, AH.cz, AH.rb * 0.9, 75, 12, AH.rb * 0.5), c, 'head'], ['визор', 'hull', visor_pts, COLOR(visor), 'head']];
  const out = [{ hide: ['волосы'] }, ['каска', 'hull', ring(HH.cx, HH.y, HH.cz, HH.rb, 70, 12, HH.rb * 0.95), c, 'head'],
    ['каска верх', 'hull', ring(HH.cx, HH.y - 70, HH.cz, HH.rb * 0.95, 65, 12, HH.rb * 0.5), c, 'head'],
    ['обод', 'hull', ring(HH.cx, HH.y + 3, HH.cz, HH.rb + 10, 8, 12), c, 'head'],
    ['гребень', 'hull', box8(HH.y - HH.h - 12, HH.y - HH.h + 6, HH.cx - 11, HH.cx + 11, HH.cz - HH.rb * 0.62, HH.cz + HH.rb * 0.62, 3), c, 'head']];
  if (shape === 'рогатый') out.push(['рог', 'hull', [...ring(HH.cx - HH.rb * 0.85, 270, HH.cz, 22, 0, 6), [HH.cx - HH.rb * 1.45, 150, HH.cz - 15]], 0xefe6cf, 'head', true]);
  if (brim === 'сзади') out.push(['назатыльник', 'hull', [...ring(HH.cx, HH.y + 3, HH.cz + 30, HH.rb * 0.95, 8, 12), [HH.cx - 90, HH.y + 30, HH.cz + HH.rb + 70], [HH.cx + 90, HH.y + 30, HH.cz + HH.rb + 70]], c, 'head']);
  else out.push(['козырёк', 'hull', [[HH.cx - 60, HH.y + 3, HH.cz - HH.rb * 0.85], [HH.cx + 60, HH.y + 3, HH.cz - HH.rb * 0.85], [HH.cx - 52, HH.y + 9, HH.cz - HH.rb - 42], [HH.cx + 52, HH.y + 9, HH.cz - HH.rb - 42],
    [HH.cx - 60, HH.y - 5, HH.cz - HH.rb * 0.85], [HH.cx + 60, HH.y - 5, HH.cz - HH.rb * 0.85], [HH.cx - 52, HH.y + 2, HH.cz - HH.rb - 42], [HH.cx + 52, HH.y + 2, HH.cz - HH.rb - 42]], c, 'head']);
  return out;
}
const visor_pts = [222, 246, 270, 294, 318].flatMap((d) => [335, 465].map((y) => { const a = d * Math.PI / 180; return [AH.cx + (AH.rb + 5) * Math.cos(a), y, AH.cz + (AH.rb + 5) * Math.sin(a)]; }));
function hair({ style = 'короткие', color = 'коричневый' }) {
  const c = COLOR(color), all = { hide: ['волосы', 'пряди', 'затылок'] };
  if (style === 'короткие') return { colors: { hair: c } };
  if (style === 'лысый') return all;
  const sleek = ['причёска', 'hull', [[520,337,1255],[690,337,1255],[530,250,1298],[680,250,1298],[530,252,1442],[680,252,1442],[490,298,1298],[720,298,1298],
    [490,300,1460],[720,300,1460],[492,346,1300],[718,346,1300],[520,290,1486],[690,290,1486],[502,440,1476],[708,440,1476],[492,440,1440],[718,440,1440]], c, 'head'];
  if (style === 'хвост') return [all, sleek, ['хвост', 'hull', [[585,292,1480],[625,292,1480],[585,322,1502],[625,322,1502],[592,470,1522],[618,470,1522],[600,525,1506],[610,525,1506]], c, 'head']];
  if (style === 'пучок') return [all, sleek, ['пучок', 'hull', ring(605, 300, 1480, 38, 60, 8, 22, 18), c, 'head']];
  const bob = ['каре', 'hull', [[520,352,1247],[690,352,1247],[520,262,1260],[690,262,1260],[532,238,1300],[678,238,1300],[532,242,1445],[678,242,1445],
    [490,280,1290],[720,280,1290],[488,286,1462],[722,286,1462],[490,345,1268],[720,345,1268],[520,280,1490],[690,280,1490],[492,352,1300],[718,352,1300],[492,352,1470],[718,352,1470]], c, 'head'];
  const len = style === 'длинные' ? 580 : 474;
  return [all, bob, ['волосы сбоку', 'hull', box8(330, Math.min(len, 500), 482, 508, 1286, 1480, 7), c, 'head', true],
    ['волосы сзади', 'hull', box8(330, len, 500, 710, 1462, 1494, 7), c, 'head']];
}
const lashes = () => LASHES;
const beard = ({ color = 'коричневый' }) => [['борода', 'hull', [[515,420,1250],[695,420,1250],[505,460,1290],[705,460,1290],[540,540,1262],[670,540,1262],[580,575,1270],[630,575,1270],[540,500,1320],[670,500,1320]], COLOR(color), 'head']];
const mustache = ({ color = 'коричневый' }) => [['усы', 'hull', [[560,424,1250],[650,424,1250],[548,440,1253],[662,440,1253],[605,430,1246],[560,424,1256],[650,424,1256]], COLOR(color), 'head']];
function mask({ type = 'медицинская', color }) {
  if (type === 'повязка на глаз') return [['повязка', 'hull', box8(370, 404, 540, 584, 1244, 1254, 5), COL.dark, 'head'], ['шнур повязки', 'hull', band([520, 352], [690, 330], 5, 1254, 1256, 2), COL.dark, 'head']];
  if (type === 'героя') return [['маска', 'decal', { shape: 'rect', ...onFace(583, 391), r: 44, h: 15, lift: 1.2 }, COLOR(color, 0x1d2f6e), 'head', true]];
  return [['маска', 'hull', box8(404, 468, 524, 686, 1244, 1258, 7), COLOR(color, 0xa9d6ec), 'head'], ['завязка', 'hull', box8(414, 420, 503, 524, 1258, 1392, 1), COLOR(color, 0xa9d6ec), 'head', true]];
}
function glassesV({ type = 'обычные' }) {
  if (type === 'защитные') return [['очки защитные', 'hull', box8(360, 404, 520, 600, 1238, 1252, 6), 0x34404c, 'head', true],
    ['стекло', 'decal', { shape: 'rect', at: [560, 382, 1238], n: [0, 0, 1], r: 30, h: 14 }, COL.glass, 'head', true],
    ['ремешок очков', 'hull', box8(372, 392, 500, 507, 1252, 1472, 2), 0x34404c, 'head', true], ['ремешок сзади', 'hull', box8(372, 392, 500, 710, 1466, 1474, 2), 0x34404c, 'head']];
  return glasses(type === 'тёмные' ? 0x222428 : COL.glass, COL.dark);
}
// ── значок/наклейка на якорь ──
function badge(where, { shape = 'star', color = 'золотой', size = 'средний' } = {}) {
  const a = anchor(where); return [['значок', 'decal', { shape: { 'звезда': 'star', 'круг': 'circle', 'полоса': 'rect', 'луна': 'moon', 'заплатка': 'patch' }[shape] ?? shape, at: a.p, n: a.n, r: 13 * SIZE(size), h: shape === 'полоса' || shape === 'rect' ? 5 * SIZE(size) : undefined, lift: 4 }, COLOR(color), a.bone]];
}
// ── предметы: в руку, за спину, на пояс ──
const ITEMS = {
  // в руке (описаны для правой руки)
  'посох': (c) => [['посох', 'hull', ring(356, 1160, 1378, 9, 610, 6), c ?? COL.wood, 'armR'], ['кристалл', 'hull', [[356,505,1378],[356,575,1378],[332,540,1378],[380,540,1378],[356,540,1354],[356,540,1402]], COL.crystal, 'armR']],
  'меч': (c) => [['рукоять', 'hull', ring(356, 905, 1378, 7, 50, 6), COL.leather, 'armR'], ['гарда', 'hull', box8(842, 856, 318, 394, 1366, 1390, 3), COL.gold, 'armR'],
    ['клинок', 'hull', box8(640, 842, 346, 366, 1372, 1384, 2), c ?? COL.steel, 'armR'], ['остриё', 'hull', tri([[346,640],[366,640],[356,612]], 1372, 1384), c ?? COL.steel, 'armR']],
  'топор': (c) => [['топорище', 'hull', ring(356, 1040, 1378, 7, 280, 6), COL.wood, 'armR'], ['лезвие', 'hull', tri([[300,760],[352,770],[352,805],[300,825],[285,792]], 1370, 1386), c ?? COL.steel, 'armR']],
  'молоток': (c) => [['ручка', 'hull', ring(356, 960, 1378, 7, 175, 6), COL.wood, 'armR'], ['боёк', 'hull', box8(770, 802, 326, 404, 1360, 1396, 3), c ?? COL.steel, 'armR']],
  'гаечный ключ': (c) => [['ключ', 'hull', box8(760, 960, 349, 363, 1370, 1386, 2), c ?? COL.steel, 'armR'], ['зев', 'hull', ring(356, 770, 1378, 18, 14, 6), c ?? COL.steel, 'armR']],
  'половник': (c) => [['половник', 'hull', ring(356, 1000, 1378, 6, 180, 6), c ?? COL.steel, 'armR'], ['черпак', 'hull', ring(356, 1028, 1378, 22, 26, 8, 16), c ?? COL.steel, 'armR']],
  'факел': (c) => [['факел', 'hull', ring(356, 960, 1378, 8, 190, 6), COL.wood, 'armR'], ['пламя', 'hull', [...ring(356, 772, 1378, 20, 0, 6), [356, 700, 1378]], c ?? 0xf27a26, 'armR'],
    ['пламя внутри', 'hull', [...ring(356, 774, 1374, 11, 0, 6), [356, 730, 1374]], 0xf2c94c, 'armR']],
  'фонарик': (c) => [['фонарик', 'hull', ring(356, 900, 1378, 10, 80, 8), c ?? COL.dark, 'armR'], ['свет', 'hull', ring(356, 822, 1378, 15, 12, 8, 15), 0xfff3b0, 'armR']],
  'палочка': (c) => [['палочка', 'hull', ring(356, 890, 1378, 4, 120, 6), c ?? COL.dark, 'armR'], ['искра', 'hull', [[356,758,1378],[356,782,1378],[344,770,1378],[368,770,1378],[356,770,1366],[356,770,1390]], 0xf2c94c, 'armR']],
  'скипетр': (c) => [['скипетр', 'hull', ring(356, 960, 1378, 6, 230, 6), c ?? COL.gold, 'armR'], ['навершие', 'hull', ring(356, 738, 1378, 16, 30, 8, 10), 0xc8312f, 'armR']],
  'вилы': (c) => [['черенок', 'hull', ring(356, 1160, 1378, 7, 520, 6), COL.wood, 'armR'], ['перекладина', 'hull', box8(632, 644, 326, 386, 1372, 1384, 2), c ?? COL.steel, 'armR'],
    ...[330, 356, 382].map((x) => ['зуб', 'hull', ring(x, 640, 1378, 3, 70, 6), c ?? COL.steel, 'armR'])],
  'щит': (c) => [['щит', 'hull', discZ(330, 860, 1300, 70, 12, 10), c ?? COL.wood, 'armR'], ['умбон', 'hull', discZ(330, 860, 1292, 18, 8, 8), COL.steel, 'armR']],
  'планшет': (c) => [['планшет', 'hull', box8(800, 945, 297, 309, 1318, 1432, 2), c ?? COL.wood, 'armR'], ['лист', 'hull', box8(812, 938, 294, 298, 1324, 1426, 1), COL.white, 'armR']],
  'лук': (c) => [['лук', 'hull', band([356, 690], [326, 780], 8, 1374, 1378, 6), c ?? COL.wood, 'armR'], ['лук', 'hull', band([326, 780], [326, 970], 8, 1374, 1378, 6), c ?? COL.wood, 'armR'],
    ['лук', 'hull', band([326, 970], [356, 1060], 8, 1374, 1378, 6), c ?? COL.wood, 'armR'], ['тетива', 'hull', band([356, 690], [356, 1060], 2, 1375, 1377, 2), 0xf3f2ec, 'armR']],
  'копьё': (c) => [['древко', 'hull', ring(356, 1160, 1378, 6, 700, 6), COL.wood, 'armR'], ['наконечник', 'hull', [...ring(356, 462, 1378, 11, 0, 6), [356, 395, 1378]], c ?? COL.steel, 'armR']],
  'кирка': (c) => [['рукоять', 'hull', ring(356, 990, 1378, 7, 260, 6), COL.wood, 'armR'], ['кирка', 'hull', tri([[276,770],[356,730],[436,770],[356,752]], 1370, 1386), c ?? COL.steel, 'armR']],
  'лопата': (c) => [['черенок', 'hull', ring(356, 1090, 1378, 7, 420, 6), COL.wood, 'armR'], ['полотно', 'hull', tri([[328,1088],[384,1088],[380,1150],[356,1165],[332,1150]], 1372, 1384), c ?? COL.steel, 'armR']],
  'метла': (c) => [['черенок', 'hull', ring(356, 1070, 1378, 7, 450, 6), COL.wood, 'armR'], ['прутья', 'hull', ring(356, 1165, 1378, 34, 100, 8, 12), c ?? 0xd8b779, 'armR']],
  'удочка': (c) => [['удилище', 'hull', band([356, 900], [250, 560], 6, 1378, 1230, 6), c ?? COL.wood, 'armR'], ['леска', 'hull', band([250, 560], [250, 820], 2, 1230, 1232, 2), 0xf3f2ec, 'armR']],
  'кисть': (c) => [['кисть', 'hull', ring(356, 925, 1378, 4, 115, 6), COL.wood, 'armR'], ['ворс', 'hull', ring(356, 812, 1378, 7, 26, 6, 3), c ?? 0xc8312f, 'armR']],
  'ракетка': (c) => [['ручка', 'hull', ring(356, 935, 1378, 6, 85, 6), COL.dark, 'armR'],
    ['обод', 'hull', Array.from({ length: 12 }, (_, k) => { const a = k * Math.PI / 6; return [[350, 790 + 52 * Math.sin(a), 1378 + 40 * Math.cos(a)], [362, 790 + 52 * Math.sin(a), 1378 + 40 * Math.cos(a)]]; }).flat(), c ?? 0xc8312f, 'armR']],
  'мяч': (c) => [['мяч', 'hull', [...ring(356, 975, 1318, 20, 0, 8), ...ring(356, 940, 1318, 38, 0, 8), ...ring(356, 905, 1318, 20, 0, 8)], c ?? 0xf3f2ec, 'armR']],
  'бластер': (c) => [['бластер', 'hull', box8(848, 882, 340, 372, 1240, 1392, 5), c ?? 0x4b4f57, 'armR'], ['рукоять', 'hull', box8(870, 925, 345, 367, 1368, 1392, 3), COL.dark, 'armR'],
    ['дуло', 'hull', discZ(356, 865, 1234, 12, 8, 8), 0x5ff0ff, 'armR']],
  'микрофон': (c) => [['микрофон', 'hull', ring(356, 905, 1378, 7, 75, 6), COL.dark, 'armR'], ['сетка', 'hull', ring(356, 830, 1378, 14, 26, 8, 14), c ?? 0x9aa1a8, 'armR']],
  'свиток': (c) => [['свиток', 'hull', box8(852, 898, 296, 416, 1360, 1396, 9), c ?? 0xe9dcb8, 'armR']],
  'фонарь': (c) => [['дужка', 'hull', ring(356, 905, 1378, 4, 30, 6), COL.dark, 'armR'], ['фонарь', 'hull', box8(905, 968, 330, 382, 1352, 1404, 6), c ?? 0xf2c94c, 'armR'],
    ['крышка', 'hull', box8(898, 910, 326, 386, 1348, 1408, 3), COL.dark, 'armR']],
  'поднос': (c) => [['поднос', 'hull', ring(356, 846, 1300, 62, 6, 12), c ?? COL.steel, 'armR']],
  'чемодан': (c) => [['чемодан', 'hull', box8(905, 1010, 328, 384, 1300, 1460, 8), c ?? 0x7a4a2a, 'armR'], ['ручка', 'hull', box8(888, 905, 350, 362, 1350, 1410, 2), COL.dark, 'armR']],
  'трость': (c) => [['трость', 'hull', ring(356, 1165, 1378, 6, 290, 6), c ?? 0x4a3020, 'armR']],
  'зонт': (c) => [['ручка', 'hull', ring(356, 960, 1378, 5, 380, 6), COL.dark, 'armR'], ['купол', 'hull', ring(356, 590, 1378, 150, 55, 8, 10), c ?? 0x2f5bd3, 'armR']],
  'телефон': (c) => [['телефон', 'hull', box8(858, 905, 340, 372, 1318, 1332, 3), c ?? COL.dark, 'armR'], ['экран', 'decal', { shape: 'rect', at: [356, 880, 1318], n: [0, 0, 1], r: 13, h: 19 }, 0x6fb7e6, 'armR']],
  'лупа': (c) => [['ручка', 'hull', ring(356, 920, 1378, 6, 70, 6), COL.wood, 'armR'], ['линза', 'hull', discZ(356, 820, 1360, 32, 6, 12), COL.glass, 'armR'], ['оправа', 'hull', discZ(356, 820, 1366, 36, 4, 12), c ?? COL.dark, 'armR']],
  'клюшка': (c) => [['клюшка', 'hull', band([356, 820], [330, 1130], 12, 1378, 1360, 10), c ?? COL.dark, 'armR'], ['крюк', 'hull', box8(1128, 1160, 300, 336, 1300, 1370, 3), c ?? COL.dark, 'armR']],
  'указка': (c) => [['указка', 'hull', band([356, 870], [250, 620], 5, 1370, 1300, 5), c ?? COL.wood, 'armR']],
  // за спиной
  'гитара': (c) => [['корпус', 'hull', discZ(600, 730, 1480, 78, 26, 10), c ?? 0xb0703a, 'torso'], ['гриф', 'hull', band([600, 660], [610, 470], 18, 1494, 1494, 8), COL.dark, 'torso'],
    ['голова грифа', 'hull', box8(440, 472, 600, 624, 1490, 1502, 3), COL.dark, 'torso']],
  'сумка через плечо': (c) => [['лямка', 'hull', band([484, 527], [560, 640], 16, 1283, 1247), c ?? 0x7a4a2a, 'torso'], ['лямка', 'hull', band([560, 640], [700, 790], 16, 1247, 1238), c ?? 0x7a4a2a, 'torso'],
    ['лямка', 'hull', box8(516, 530, 474, 494, 1283, 1478, 2), c ?? 0x7a4a2a, 'torso'], ['лямка', 'hull', band([484, 527], [700, 790], 16, 1474, 1478), c ?? 0x7a4a2a, 'torso'],
    ['сумка', 'hull', box8(780, 880, 690, 770, 1236, 1340, 6), c ?? 0x7a4a2a, 'torso']],
  'меч за спиной': (c) => [['ножны', 'hull', band([505, 545], [700, 790], 16, 1474, 1490, 10), c ?? 0x3a2f2a, 'torso'], ['рукоять', 'hull', band([470, 490], [505, 545], 11, 1476, 1486, 9), COL.leather, 'torso']],
  'воротник': (c) => [['воротник', 'hull', [[470,540,1470],[740,540,1470],[460,380,1500],[750,380,1500],[480,540,1480],[730,540,1480],[470,390,1510],[740,390,1510]], c ?? 0x7d2230, 'torso']],
  'хвост': (c) => [['хвост', 'hull', band([605, 810], [640, 950], 14, 1468, 1520, 12), c ?? 0x7a4a2a, 'hips'], ['хвост', 'hull', band([640, 950], [690, 1010], 12, 1520, 1540, 10), c ?? 0x7a4a2a, 'hips'],
    ['кисточка', 'hull', ring(695, 1028, 1542, 14, 24, 6, 6), c ?? 0x7a4a2a, 'hips']],
  // на груди / шее
  'фотоаппарат': (c) => [['фотоаппарат', 'hull', box8(640, 690, 560, 650, 1236, 1262, 5), c ?? COL.dark, 'torso'], ['объектив', 'hull', discZ(605, 665, 1222, 14, 14, 10), 0x4b4f57, 'torso'],
    ['ремешок', 'hull', band([560, 528], [565, 640], 6, 1295, 1256, 3), COL.dark, 'torso'], ['ремешок', 'hull', band([650, 528], [645, 640], 6, 1295, 1256, 3), COL.dark, 'torso']],
  'бинокль': (c) => [['бинокль', 'hull', discZ(585, 665, 1240, 16, 22, 8), c ?? COL.dark, 'torso'], ['бинокль', 'hull', discZ(625, 665, 1240, 16, 22, 8), c ?? COL.dark, 'torso'],
    ['ремешок', 'hull', band([560, 528], [578, 650], 5, 1295, 1254, 3), COL.dark, 'torso'], ['ремешок', 'hull', band([650, 528], [632, 650], 5, 1295, 1254, 3), COL.dark, 'torso']],
  'свисток': (c) => [['шнурок', 'hull', band([566, 528], [600, 640], 4, 1292, 1252, 3), COL.red, 'torso'], ['шнурок', 'hull', band([644, 528], [610, 640], 4, 1292, 1252, 3), COL.red, 'torso'],
    ['свисток', 'hull', box8(638, 656, 592, 618, 1240, 1252, 3), c ?? COL.steel, 'torso']],
  'бабочка': (c) => [['бабочка', 'hull', tri([[575,515],[605,528],[575,545]], 1290, 1300), c ?? COL.dark, 'torso'], ['бабочка', 'hull', tri([[635,515],[605,528],[635,545]], 1290, 1300), c ?? COL.dark, 'torso']],
  'галстук': (c) => [['галстук', 'hull', band([605, 540], [605, 700], 18, 1290, 1254, 3), c ?? COL.navy, 'torso'], ['узел', 'hull', box8(526, 546, 594, 616, 1293, 1303, 3), c ?? COL.navy, 'torso'],
    ['кончик', 'hull', tri([[596,698],[614,698],[605,716]], 1254, 1257), c ?? COL.navy, 'torso']],
  'медальон': (c) => [['цепочка', 'hull', band([566, 528], [600, 610], 3, 1292, 1258, 3), COL.gold, 'torso'], ['цепочка', 'hull', band([644, 528], [610, 610], 3, 1292, 1258, 3), COL.gold, 'torso'],
    ['медальон', 'hull', discZ(605, 625, 1250, 15, 6, 10), c ?? COL.gold, 'torso']],
  // за спиной
  'рюкзак': (c) => [['рюкзак', 'hull', box8(540, 790, 498, 712, 1478, 1560, 14), c ?? 0x6b4f35, 'torso'], ['клапан', 'hull', box8(540, 610, 505, 705, 1556, 1566, 4), shade(c ?? 0x6b4f35, -0.2), 'torso']],
  'баллон': (c) => [...[560, 650].map((x) => ['баллон', 'hull', ring(x, 790, 1510, 34, 230, 10), c ?? 0xd4a72c, 'torso']), ['вентиль', 'hull', ring(605, 560, 1510, 10, 30, 6), COL.steel, 'torso']],
  'плащ': (c) => [['плащ', 'hull', [...section(520, 470, 740, 1468, 1488, 8, 8, 6), ...section(1010, 420, 790, 1528, 1548, 8, 8, 6)], c ?? 0xc8312f, 'torso'], ['застёжка', 'hull', discZ(480, 532, 1300, 12, 6, 8), COL.gold, 'torso', true]],
  'щит за спиной': (c) => [['щит', 'hull', discZ(605, 650, 1490, 120, 14, 12), c ?? 0x8a5a35, 'torso'], ['умбон', 'hull', discZ(605, 650, 1503, 30, 10, 8), COL.steel, 'torso']],
  'крылья': (c) => [['крыло', 'hull', tri([[590,560],[420,420],[380,560],[460,700]], 1488, 1496), c ?? 0xf3f2ec, 'torso', true]],
  'колчан': (c) => [['колчан', 'hull', band([680, 500], [560, 770], 40, 1482, 1500, 30), c ?? 0x7a4a2a, 'torso'], ...[690, 700, 710].map((x) => ['стрела', 'hull', band([x, 450], [x - 15, 520], 5, 1490, 1492, 4), 0xf3f2ec, 'torso'])],
  // на поясе (описаны для правого бока, слева — зеркально)
  'ножны': (c) => [['ножны', 'hull', box8(820, 1040, 436, 450, 1318, 1346, 3), c ?? COL.leather, 'hips'], ['гарда', 'hull', box8(806, 818, 420, 466, 1314, 1350, 2), COL.gold, 'hips'], ['рукоять', 'hull', ring(443, 806, 1332, 6, 34, 6), COL.leather, 'hips']],
  'кобура': (c) => [['кобура', 'hull', box8(812, 900, 434, 466, 1300, 1356, 5), c ?? 0x5a3520, 'hips'], ['револьвер', 'hull', box8(800, 830, 432, 468, 1306, 1350, 4), COL.dark, 'hips']],
  'рация': (c) => [['рация', 'hull', box8(788, 846, 440, 466, 1300, 1334, 3), c ?? COL.dark, 'hips'], ['антенна', 'hull', ring(452, 788, 1308, 3, 40, 6), COL.dark, 'hips']],
  'фляга': (c) => [['фляга', 'hull', ring(456, 868, 1330, 18, 52, 8), c ?? 0x6fcf7f, 'hips'], ['горлышко', 'hull', ring(456, 816, 1330, 7, 16, 6), COL.steel, 'hips']],
  'книга': (c) => [['книга', 'hull', box8(798, 856, 446, 466, 1318, 1372, 3), c ?? COL.book, 'hips']],
  'сумка': (c) => [['сумка', 'hull', box8(806, 872, 438, 466, 1300, 1370, 5), c ?? COL.leather, 'hips'], ['клапан', 'hull', box8(800, 824, 434, 468, 1296, 1374, 4), shade(c ?? COL.leather, -0.2), 'hips']],
  'ключи': (c) => [['ключи', 'hull', ring(458, 840, 1330, 10, 6, 8), c ?? COL.steel, 'hips']],
  'кинжал': (c) => [['ножны', 'hull', box8(818, 920, 438, 452, 1318, 1342, 3), c ?? COL.leather, 'hips'], ['гарда', 'hull', box8(808, 818, 428, 462, 1314, 1346, 2), COL.gold, 'hips']],
  'дубинка': (c) => [['дубинка', 'hull', ring(452, 960, 1330, 8, 150, 6), c ?? COL.dark, 'hips']],
};
const HAND = new Set(['посох', 'меч', 'топор', 'молоток', 'гаечный ключ', 'половник', 'факел', 'фонарик', 'палочка', 'скипетр', 'вилы', 'щит', 'планшет',
  'лук', 'копьё', 'кирка', 'лопата', 'метла', 'удочка', 'кисть', 'ракетка', 'мяч', 'бластер', 'микрофон', 'свиток', 'фонарь', 'поднос', 'чемодан', 'трость', 'зонт', 'телефон', 'лупа', 'клюшка', 'указка']);
const CHEST = new Set(['фотоаппарат', 'бинокль', 'свисток', 'бабочка', 'галстук', 'медальон']);
const BACK = new Set(['рюкзак', 'баллон', 'плащ', 'щит за спиной', 'крылья', 'колчан', 'гитара', 'сумка через плечо', 'меч за спиной', 'воротник']);
function item(where, what, { color } = {}) {
  const f = ITEMS[what]; if (!f) throw new Error(`Нет предмета «${what}». Есть: ${Object.keys(ITEMS).join(', ')}`);
  const c = color != null ? COLOR(color) : undefined;
  if (HAND.has(what) && !/^рука/.test(where)) throw new Error(`«${what}» берут в руку: «рука справа» или «рука слева»`);
  if (BACK.has(what) && where !== 'спина') throw new Error(`«${what}» носят на «спина»`);
  if (CHEST.has(what) && !/^(грудь|шея)$/.test(where)) throw new Error(`«${what}» носят на «грудь» или «шея»`);
  if (what === 'хвост' && where !== 'пояс сзади') throw new Error('«хвост» крепят на «пояс сзади»');
  if (!HAND.has(what) && !BACK.has(what) && !CHEST.has(what) && what !== 'хвост' && !/^пояс (справа|слева)$/.test(where)) throw new Error(`«${what}» вешают на «пояс справа» или «пояс слева»`);
  return f(c).map((p) => mirrorPart(p, where));
}
const pouch = (where, { color } = {}) => item(where, 'сумка', { color });
const face = (name) => ({ face: name }), walk = (name) => ({ walk: name });
const ALIASES = {};
const alias = (from, to) => { for (const f of [].concat(from)) ALIASES[f] = to; };
const FIG = { makeFigure, defineCostume, setFace, wear, COSTUMES, FACES, dress, ears, alias, ALIASES, lookAtPoint, clampJoints, shirt, pants, boots, skin, beltColor, coat: coatV, vest, skirt, sleeves, gloves,
  apron, scarf, pads, kneepads, stripes, hat, helmet, hair, lashes, beard, mustache, mask, glasses: glassesV, badge, item, pouch, face, walk, ANCHORS, ITEMS, NAMED };
// ── Игровые персонажи: так костюм пишет ИИ-кодер — defineCostume(имя, данные), makeFigure запекает сразу ──
const HOOD = fitCrown(505, 222, 0.86, 0, undefined, 8, 7);
defineCostume('зомби', { face: 'зомби', walk: 'ковыляет', stride: 0.32,
  colors: { skin: 0x93b07c, skinDark: 0x5f7a4e, shirt: 0x7f8a6c, jeans: 0x4f5a6a, jeansCuff: 0x5d6878, hair: 0x4a4038 }, parts: [
  ['дыра', 'decal', { shape: 'patch', at: [540, 700, 1261.5], n: [0, 0, 1], r: 14, rot: 0.5 }, 0x4e5a40, 'torso'],
  ['дыра', 'decal', { shape: 'patch', at: [665, 650, 1261.5], n: [0, 0, 1], r: 10, rot: -0.3 }, 0x4e5a40, 'torso'],
  ['грязь', 'decal', { shape: 'patch', at: [520, 940, 1274], n: [0, 0, 1], r: 16, rot: 0.2 }, 0x6b5a44, 'legR'],
  ['лохмотья', 'hull', tri([[355,664],[372,690],[392,672],[410,697],[430,684],[462,708]], 1306, 1446), 0x7f8a6c, 'armR', true],
]});
defineCostume('ниндзя', { hide: ['волосы', 'пряди', 'затылок'], face: 'сердитый', under: ['голова', 'ухо', 'глаз', 'блик', 'бровь', 'рот'],
  colors: { shirt: 0x26262c, jeans: 0x26262c, jeansCuff: 0x34343b, boot: 0x1d1d21, sole: 0x141417, belt: 0xb73a3a }, parts: [
  ['капюшон', 'hull', ring(HOOD.cx, HOOD.y, HOOD.cz, HOOD.rb, HOOD.h, 8, HOOD.rt), 0x26262c, 'head'],
  ['прорезь', 'decal', { shape: 'rect', ...onCrown(HOOD, 270, 0.5), r: 52, h: 15 }, COL.skin, 'head'],
  ['глаз ниндзя', 'decal', { shape: 'ellipse', ...onCrown(HOOD, 270, 0.5), r: 7, h: 8, lift: 3.5 }, INK, 'head'],
  ['повязка', 'hull', ring(HOOD.cx, HOOD.y - HOOD.h * 0.62, HOOD.cz, HOOD.rb * 0.9 + 4, 16, 8, HOOD.rb * 0.88 + 4), COL.red, 'head'],
  ['ножны', 'hull', band([505, 545], [700, 790], 16, 1474, 1490, 10), 0x3a2f2a, 'torso'],
  ['рукоять', 'hull', band([470, 490], [505, 545], 11, 1476, 1486, 9), COL.red, 'torso'],
]});
// глаза ниндзя — парой: вторая точка зеркалом
COSTUMES['ниндзя'].parts.find((p) => p[0] === 'глаз ниндзя')[2].at[0] -= 30;
COSTUMES['ниндзя'].parts.push(['глаз ниндзя', 'decal', { ...COSTUMES['ниндзя'].parts.find((p) => p[0] === 'глаз ниндзя')[2], at: [...COSTUMES['ниндзя'].parts.find((p) => p[0] === 'глаз ниндзя')[2].at] }, INK, 'head']);
COSTUMES['ниндзя'].parts.at(-1)[2].at[0] += 60;
defineCostume('викинг', { hide: ['волосы'], colors: { shirt: 0x6b4a8e, jeans: 0x5b4a3a, jeansCuff: 0x6d5a48, boot: 0x7a5a3e, hair: 0xc0652e }, parts: [
  ['шлем', 'hull', ring(HH.cx, 322, HH.cz, HH.rb * 0.97, 70, 12, HH.rb * 0.9), COL.steel, 'head'],
  ['купол шлема', 'hull', ring(HH.cx, 252, HH.cz, HH.rb * 0.9, 60, 12, HH.rb * 0.35), COL.steel, 'head'],
  ['рог', 'hull', [...ring(HH.cx - HH.rb * 0.85, 270, HH.cz, 22, 0, 6), [HH.cx - HH.rb * 1.45, 150, HH.cz - 15]], 0xefe6cf, 'head', true],
  ['борода', 'hull', [[515,420,1250],[695,420,1250],[505,460,1290],[705,460,1290],[540,540,1262],[670,540,1262],[580,575,1270],[630,575,1270],[540,500,1320],[670,500,1320]], 0xc0652e, 'head'],
  ['мех', 'hull', [...section(500, 450, 760, 1250, 1490, 30, 30, 30), ...section(545, 440, 770, 1240, 1500, 30, 30, 30)], 0xb08a62, 'torso'],
  ['безрукавка', 'hull', split(grow('торс', 7, 3), 20), 0x6b4f35, 'torso', true],
  ['щит', 'hull', discZ(605, 650, 1490, 120, 14, 12), 0x8a5a35, 'torso'],
  ['умбон', 'hull', discZ(605, 650, 1503, 30, 10, 8), COL.steel, 'torso'],
  ['топорище', 'hull', ring(356, 1040, 1378, 7, 280, 6), COL.wood, 'armR'],
  ['лезвие', 'hull', tri([[300,760],[352,770],[352,805],[300,825],[285,792]], 1370, 1386), COL.steel, 'armR'],
]});
defineCostume('ковбой', { hide: ['волосы'], colors: { shirt: 0xc94f3a, boot: 0x7a4a2a, sole: 0x5a3520 }, parts: [
  ['тулья', 'hull', ring(HH.cx, 318, HH.cz, HH.rb * 0.9, 95, 8, HH.rb * 0.78), 0x8a6240, 'head'],
  ['поля', 'hull', [...ring(HH.cx, 320, HH.cz, HH.rb + 70, 8, 12), [HH.cx - HH.rb - 78, 290, HH.cz], [HH.cx + HH.rb + 78, 290, HH.cz]], 0x8a6240, 'head'],
  ['лента', 'hull', ring(HH.cx, 314, HH.cz, HH.rb * 0.9 + 3, 16, 8, HH.rb * 0.88 + 3), 0x3a2a1e, 'head'],
  ['платок', 'hull', tri([[548,522],[662,522],[605,580]], 1288, 1300), 0xd93a3a, 'torso'],
  ['жилет', 'hull', split(grow('торс', 6, 3), 24), 0x7a4a2a, 'torso', true],
  ['звезда шерифа', 'decal', { shape: 'star', at: [672, 650, 1254], n: [0, 0, 1], r: 15 }, COL.gold, 'torso'],
  ['кобура', 'hull', box8(812, 900, 744, 776, 1300, 1356, 5), 0x5a3520, 'hips'],
  ['револьвер', 'hull', box8(800, 830, 742, 778, 1306, 1350, 4), COL.dark, 'hips'],
  ['шпора', 'hull', discZ(522, 1150, 1418, 12, 6, 8), COL.steel, 'legR', true],
]});
defineCostume('супергерой', { colors: { shirt: 0x2f5bd3, jeans: 0x2f5bd3, jeansCuff: 0x2a50bb, boot: 0xc8312f, sole: 0xa02826, belt: 0xf2c94c }, parts: [
  ['маска', 'decal', { shape: 'rect', ...onFace(583, 391), r: 44, h: 15, lift: 1.2 }, 0x1d2f6e, 'head', true],
  ['эмблема', 'hull', tri([[565,640],[645,640],[605,700]], 1255, 1261), COL.gold, 'torso'],
  ['буква', 'decal', { shape: 'star', at: [605, 657, 1254], n: [0, 0, 1], r: 13 }, 0xc8312f, 'torso'],
  ['плащ', 'hull', [...section(520, 470, 740, 1468, 1488, 8, 8, 6), ...section(1010, 420, 790, 1528, 1548, 8, 8, 6)], 0xc8312f, 'torso'],
  ['застёжка', 'hull', discZ(480, 532, 1300, 12, 6, 8), COL.gold, 'torso', true],
]});
const RB = box8(286, 508, 476, 734, 1236, 1484, 16);
defineCostume('робот', { hide: ['волосы', 'пряди', 'затылок'], face: 'удивление', stride: 0.45,
  under: ['голова', 'ухо', 'шея', 'вырез', 'глаз', 'блик', 'бровь', 'рот', 'торс', 'рукав', 'отворот', 'втулка', 'предплечье', 'выемка', 'бедро', 'голень', 'втулка бедра'],
  colors: { shirt: 0xb9c2cc, jeans: 0xb9c2cc, jeansCuff: 0x8d97a3, boot: 0x6b7480, sole: 0x535b66, belt: 0x6b7480 }, parts: [
  ['голова робота', 'hull', RB, 0xb9c2cc, 'head'],
  ['экран', 'decal', { shape: 'rect', at: [605, 400, 1236], n: [0, 0, 1], r: 98, h: 52 }, 0x1d2a33, 'head'],
  ['глаз робота', 'decal', { shape: 'circle', at: [565, 392, 1236], n: [0, 0, 1], r: 13, lift: 3.5 }, 0x5ff0ff, 'head', true],
  ['рот робота', 'decal', { shape: 'rect', at: [605, 430, 1236], n: [0, 0, 1], r: 28, h: 4, lift: 3.5 }, 0x5ff0ff, 'head'],
  ['антенна', 'hull', ring(605, 286, 1360, 5, 60, 6), 0x6b7480, 'head'],
  ['шар антенны', 'hull', ring(605, 226, 1360, 12, 22, 8, 12), 0xe8743b, 'head'],
  ['корпус', 'hull', grow('торс', 8, 4), 0xb9c2cc, 'torso'],
  ['панель', 'hull', box8(640, 730, 548, 662, 1243, 1253, 4), 0x8d97a3, 'torso'],
  ['лампа', 'decal', { shape: 'circle', at: [580, 670, 1243], n: [0, 0, 1], r: 9 }, 0xe8743b, 'torso'],
  ['лампа', 'decal', { shape: 'circle', at: [630, 670, 1243], n: [0, 0, 1], r: 9 }, 0x4caf6a, 'torso'],
  ['решётка', 'decal', { shape: 'rect', at: [605, 708, 1243], n: [0, 0, 1], r: 40, h: 8 }, 0x535b66, 'torso'],
  ['плечо робота', 'hull', grow('втулка', 14, 12), 0x8d97a3, 'armR', true],
  ['рука робота', 'hull', grow('рукав', 8, 6), 0xb9c2cc, 'armR', true],
  ['локоть', 'hull', grow('отворот', 8), 0x8d97a3, 'armR', true],
  ['кисть робота', 'hull', grow('предплечье', 6), 0xb9c2cc, 'armR', true],
  ['нога робота', 'hull', grow('бедро', 7), 0xb9c2cc, 'legR', true],
  ['голень робота', 'hull', grow('голень', 7), 0xb9c2cc, 'legR', true],
]});

// библиотека типажей — данные в costumes/library.js (только глаголы из FIGURES.md)
library(FIG);

// ── Анимации на общих суставах (одни и те же для любого костюма) ─────────────
// ?anim=идёт|стоит|машет|прыгает, &t=секунды — кадр в заданный момент (для снимков)
const HIPS_Y = bones.hips.position.y;
function resetPose(B = bones) {
  for (const n in B) B[n].rotation.set(0, 0, 0);
  B.hips.position.y = HIPS_Y;
}
function follow(B = bones) { for (const n in BONES) { const f = BONES[n].follow; if (f && B[n]) B[n].rotation.x = f[1] * B[f[0]].rotation.x; } }
// пределы: голова (поворот ±70°, кивок ±25°, наклон ±15°), локоть гнётся только вперёд, колено — только назад
const LIMITS = { head: { x: [-0.45, 0.45], y: [-1.2, 1.2], z: [-0.26, 0.26] }, forearmR: { x: [-2.5, 0] }, forearmL: { x: [-2.5, 0] }, shinR: { x: [0, 2.5] }, shinL: { x: [0, 2.5] } };
function clampJoints(B = bones) { for (const n in LIMITS) for (const ax in LIMITS[n]) { const [lo, hi] = LIMITS[n][ax]; B[n].rotation[ax] = Math.min(hi, Math.max(lo, B[n].rotation[ax])); } }
// посмотреть на точку (в координатах сцены): голова в пределах, остаток поворота — корпусом
const _t = new THREE.Vector3(), _h = new THREE.Vector3();
function lookAtPoint(root, B, target) {
  root.updateMatrixWorld(); _t.copy(target); root.worldToLocal(_t); B.head.getWorldPosition(_h); root.worldToLocal(_h);
  const d = _t.sub(_h), yaw = Math.atan2(d.x, d.z), pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
  const hy = Math.max(-1.2, Math.min(1.2, yaw)); B.torso.rotation.y += Math.max(-0.6, Math.min(0.6, yaw - hy));
  B.head.rotation.y = hy; B.head.rotation.x = Math.max(-0.45, Math.min(0.45, pitch));
}
const ANIMS = {
  'стоит': (t, B = bones, stride = STRIDE) => {
    B.head.rotation.y = 0.35 * Math.sin(t * 0.6); B.torso.rotation.x = 0.02 * Math.sin(t * 1.7);
    B.armR.rotation.x = 0.06 * Math.sin(t * 1.7); B.armL.rotation.x = 0.06 * Math.sin(t * 1.7 + 0.8);
    B.forearmR.rotation.x = B.forearmL.rotation.x = -0.12;
  },
  'идёт': (t, B = bones, stride = STRIDE) => {
    const p = t * 2 * Math.PI * 0.9, s = Math.sin(p), c = Math.cos(p), k = 0.75 * stride / 0.55;
    B.legR.rotation.x = stride * s; B.legL.rotation.x = -stride * s;
    B.shinR.rotation.x = 0.06 + k * Math.max(0, -c); B.shinL.rotation.x = 0.06 + k * Math.max(0, c);
    B.armR.rotation.x = -0.5 * s; B.armL.rotation.x = 0.5 * s; B.forearmR.rotation.x = -0.3 - 0.15 * Math.max(0, -s); B.forearmL.rotation.x = -0.3 - 0.15 * Math.max(0, s);
    B.hips.position.y = HIPS_Y + 0.025 * Math.abs(c); B.torso.rotation.y = 0.08 * s; B.head.rotation.y = -0.07 * s;
  },
  'бежит': (t, B = bones, stride = STRIDE) => {
    const p = t * 2 * Math.PI * 1.5, s = Math.sin(p), c = Math.cos(p);
    B.legR.rotation.x = 0.8 * s - 0.15; B.legL.rotation.x = -0.8 * s - 0.15;
    B.shinR.rotation.x = 0.3 + 1.3 * Math.max(0, -c); B.shinL.rotation.x = 0.3 + 1.3 * Math.max(0, c);
    B.armR.rotation.x = -0.9 * s; B.armL.rotation.x = 0.9 * s; B.forearmR.rotation.x = B.forearmL.rotation.x = -1.4;
    B.hips.position.y = HIPS_Y + 0.05 * Math.abs(c) - 0.03; B.torso.rotation.x = 0.16; B.head.rotation.x = -0.12; B.torso.rotation.y = 0.1 * s;
  },
  'сидит': (t, B = bones, stride = STRIDE) => {
    B.legR.rotation.x = B.legL.rotation.x = -1.55; B.shinR.rotation.x = B.shinL.rotation.x = 1.55;
    B.hips.position.y = HIPS_Y - 0.26; B.armR.rotation.x = B.armL.rotation.x = -0.45; B.forearmR.rotation.x = B.forearmL.rotation.x = -0.75;
    B.head.rotation.y = 0.3 * Math.sin(t * 0.5);
  },
  'держит': (t, B = bones, stride = STRIDE) => {
    B.armR.rotation.x = B.armL.rotation.x = -0.35; B.forearmR.rotation.x = B.forearmL.rotation.x = -1.15;
    B.head.rotation.x = 0.2; B.torso.rotation.x = 0.02 * Math.sin(t * 1.7);
  },
  'машет': (t, B = bones, stride = STRIDE) => {
    B.armL.rotation.x = -2.7; B.armL.rotation.z = 0.08 * Math.sin(t * 8);
    B.forearmL.rotation.x = -0.25 - 0.55 * (0.5 + 0.5 * Math.sin(t * 8));
    B.head.rotation.y = 0.25; B.head.rotation.z = -0.06; B.armR.rotation.x = 0.06 * Math.sin(t * 1.7); B.forearmR.rotation.x = -0.12;
  },
  'ковыляет': (t, B = bones, stride = STRIDE) => {
    const p = t * 2 * Math.PI * 0.55, s = Math.sin(p);
    B.legR.rotation.x = 0.32 * s; B.legL.rotation.x = -0.22 * s; B.shinR.rotation.x = 0.1 + 0.25 * Math.max(0, -Math.cos(p));
    B.armR.rotation.x = -1.45 + 0.1 * Math.sin(p * 2); B.armL.rotation.x = -1.3 + 0.1 * Math.cos(p * 2); B.forearmR.rotation.x = -0.15; B.forearmL.rotation.x = -0.3;
    B.head.rotation.z = 0.26; B.head.rotation.x = 0.12 + 0.05 * s; B.torso.rotation.x = 0.1; B.torso.rotation.z = 0.06 * s;
    B.hips.position.y = HIPS_Y + 0.02 * Math.abs(Math.cos(p));
  },
  'целится': (t, B = bones, stride = STRIDE) => {    // правая рука вперёд, ствол по предплечью; левая поддерживает
    B.armR.rotation.x = -1.5; B.forearmR.rotation.x = -0.05; B.armL.rotation.x = -1.15; B.armL.rotation.z = -0.25; B.forearmL.rotation.x = -0.6;
    B.head.rotation.x = 0.05; B.torso.rotation.y = 0.12 + 0.02 * Math.sin(t * 1.3);
  },
  'рубит': (t, B = bones, stride = STRIDE) => {      // замах над головой и удар сверху вниз, ~1 раз в секунду
    const p = (t * 1.1) % 1, up = p < 0.6 ? p / 0.6 : 1 - (p - 0.6) / 0.4, e = up * up * (3 - 2 * up);
    B.armR.rotation.x = -0.4 - 2.2 * e; B.forearmR.rotation.x = -0.9 * e - 0.2; B.torso.rotation.y = 0.25 * e - 0.1; B.torso.rotation.x = 0.12 * (1 - e);
    B.armL.rotation.x = 0.2 * e - 0.3; B.forearmL.rotation.x = -0.5;
  },
  'прыгает': (t, B = bones, stride = STRIDE) => {
    const p = (t * 1.1) % 1, up = Math.sin(Math.PI * p), cr = (1 - up) ** 2;
    B.hips.position.y = HIPS_Y + 0.35 * up - 0.12 * cr;
    B.legR.rotation.x = B.legL.rotation.x = -0.7 * cr; B.shinR.rotation.x = B.shinL.rotation.x = 1.2 * cr;
    B.armR.rotation.x = B.armL.rotation.x = -2.6 * up + 0.3 * cr; B.forearmR.rotation.x = B.forearmL.rotation.x = -0.3;
  },
};


// ══ English API for the game coder (Punto) ═════════════════════════════════════════════════════════════════
// Inside, names are Russian (the data was written that way); outside, everything is English. A string the coder
// passes is looked up in EN; an unknown one goes through as is (so Russian still works).
const EN = {
  // colours (Punto's PALETTE)
  'red': 'красный', 'dark red': 'тёмно-красный', 'orange': 'оранжевый', 'yellow': 'жёлтый', 'green': 'зелёный',
  'dark green': 'тёмно-зелёный', 'light blue': 'голубой', 'sky blue': 'голубой', 'blue': 'синий', 'dark blue': 'тёмно-синий', 'navy': 'тёмно-синий',
  'purple': 'фиолетовый', 'violet': 'фиолетовый', 'pink': 'розовый', 'white': 'белый', 'grey': 'серый', 'gray': 'серый',
  'dark grey': 'тёмно-серый', 'dark gray': 'тёмно-серый', 'black': 'чёрный', 'brown': 'коричневый', 'light brown': 'светло-коричневый',
  'beige': 'бежевый', 'gold': 'золотой', 'golden': 'золотой', 'silver': 'серебряный', 'turquoise': 'бирюзовый', 'teal': 'бирюзовый',
  // faces
  'smile': 'улыбка', 'happy': 'радость', 'surprised': 'удивление', 'angry': 'сердитый', 'zombie': 'зомби', 'skull': 'череп',
  // animations
  'idle': 'стоит', 'stand': 'стоит', 'walk': 'идёт', 'run': 'бежит', 'sit': 'сидит', 'hold': 'держит', 'wave': 'машет',
  'jump': 'прыгает', 'shamble': 'ковыляет', 'aim': 'целится', 'strike': 'рубит',
  // anchors
  'chest': 'грудь', 'chest right': 'грудь справа', 'chest left': 'грудь слева', 'belly': 'живот', 'back': 'спина', 'neck': 'шея',
  'belt': 'пояс', 'belt back': 'пояс сзади', 'belt right': 'пояс справа', 'belt left': 'пояс слева',
  'thigh right': 'бедро справа', 'thigh left': 'бедро слева', 'knee right': 'колено справа', 'knee left': 'колено слева',
  'shoulder right': 'плечо справа', 'shoulder left': 'плечо слева', 'hand right': 'рука справа', 'hand left': 'рука слева',
  'right hand': 'рука справа', 'left hand': 'рука слева', 'top of head': 'макушка', 'forehead': 'лоб', 'face': 'лицо', 'mouth': 'рот',
  // things in the hand (decor baked into a costume; for swappable things use the hand sockets)
  'staff': 'посох', 'sword': 'меч', 'axe': 'топор', 'hammer': 'молоток', 'wrench': 'гаечный ключ', 'ladle': 'половник', 'torch': 'факел',
  'flashlight': 'фонарик', 'wand': 'палочка', 'scepter': 'скипетр', 'pitchfork': 'вилы', 'shield': 'щит', 'clipboard': 'планшет', 'tablet': 'планшет',
  'bow': 'лук', 'spear': 'копьё', 'pickaxe': 'кирка', 'shovel': 'лопата', 'broom': 'метла', 'fishing rod': 'удочка', 'paintbrush': 'кисть',
  'racket': 'ракетка', 'ball': 'мяч', 'blaster': 'бластер', 'microphone': 'микрофон', 'scroll': 'свиток', 'lantern': 'фонарь', 'tray': 'поднос',
  'suitcase': 'чемодан', 'cane': 'трость', 'umbrella': 'зонт', 'phone': 'телефон', 'magnifier': 'лупа', 'magnifying glass': 'лупа',
  'hockey stick': 'клюшка', 'pointer': 'указка',
  // on the back
  'backpack': 'рюкзак', 'air tank': 'баллон', 'tank': 'баллон', 'cape': 'плащ', 'shield on back': 'щит за спиной', 'wings': 'крылья',
  'quiver': 'колчан', 'guitar': 'гитара', 'shoulder bag': 'сумка через плечо', 'satchel': 'сумка через плечо', 'sword on back': 'меч за спиной',
  'collar': 'воротник',
  // on the belt
  'scabbard': 'ножны', 'holster': 'кобура', 'radio': 'рация', 'flask': 'фляга', 'book': 'книга', 'bag': 'сумка', 'pouch': 'сумка',
  'keys': 'ключи', 'dagger': 'кинжал', 'baton': 'дубинка', 'tail': 'хвост',
  // on the chest
  'camera': 'фотоаппарат', 'binoculars': 'бинокль', 'whistle': 'свисток', 'bow tie': 'бабочка', 'tie': 'галстук', 'medallion': 'медальон',
  // hats
  'hat': 'шляпа', 'wizard hat': 'конус', 'cone': 'конус', 'pointed cap': 'колпак', 'gnome hat': 'колпак', 'chef hat': 'поварской колпак',
  "chef's hat": 'поварской колпак', 'top hat': 'цилиндр', 'cap': 'кепка', 'baseball cap': 'кепка', 'peaked cap': 'фуражка', 'police cap': 'фуражка',
  'sailor cap': 'бескозырка', 'beret': 'берет', 'nurse cap': 'шапочка', 'beanie': 'шапка', 'bobble hat': 'шапка', 'ushanka': 'ушанка',
  'fur hat': 'ушанка', 'turban': 'тюрбан', 'hood': 'капюшон', 'tricorn': 'треуголка', 'crown': 'корона', 'tiara': 'диадема',
  'bandana': 'бандана', 'halo': 'нимб', 'horns': 'рожки', 'antennae': 'антенки', 'antennas': 'антенки', 'headphones': 'наушники',
  'pumpkin': 'тыква', 'bridal': 'фата', 'veil': 'фата',
  // helmets
  'dome': 'купол', 'hard hat': 'купол', 'bucket': 'ведро', 'sphere': 'сфера', 'space': 'сфера', 'horned': 'рогатый',
  // hair
  'short': 'короткие', 'bob': 'каре', 'long': 'длинные', 'ponytail': 'хвост', 'bun': 'пучок', 'bald': 'лысый',
  // masks, glasses, badges, sizes, hems, stripes
  'medical': 'медицинская', 'eye patch': 'повязка на глаз', 'eyepatch': 'повязка на глаз', 'hero': 'героя',
  'regular': 'обычные', 'normal': 'обычные', 'dark': 'тёмные', 'sunglasses': 'тёмные', 'goggles': 'защитные', 'safety': 'защитные',
  'star': 'звезда', 'circle': 'круг', 'stripe': 'полоса', 'moon': 'луна', 'patch': 'заплатка',
  'small': 'маленький', 'medium': 'средний', 'big': 'большой', 'large': 'большой',
  'hip': 'бедро', 'thigh': 'бедро', 'knee': 'колено', 'shin': 'голень', 'floor': 'пол', 'torso': 'торс', 'vest': 'жилет', 'coat': 'пальто',
  'elf': 'эльф',
};
const tr = (v) => (typeof v === 'string' ? EN[v.trim().toLowerCase()] ?? v : v);
const trObj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, trObj(v)])) : tr(o));
const en = (fn) => (...args) => fn(...args.map(trObj));

// figure names: English → the library's Russian ones (Russian and the old synonyms keep working)
const NAMES = {
  wizard: 'волшебник', worker: 'рабочий', builder: 'рабочий', clerk: 'клерк', 'office worker': 'клерк', doctor: 'врач', scientist: 'учёный',
  knight: 'рыцарь', chef: 'повар', cook: 'повар', pirate: 'пират', woman: 'девушка', 'young woman': 'девушка', sportswoman: 'спортсменка',
  athlete: 'спортсменка', astronaut: 'космонавт', zombie: 'зомби', ninja: 'ниндзя', viking: 'викинг', cowboy: 'ковбой', superhero: 'супергерой',
  robot: 'робот', firefighter: 'пожарный', fireman: 'пожарный', nurse: 'медсестра', 'police officer': 'полицейский', policeman: 'полицейский',
  cop: 'полицейский', diver: 'водолаз', 'mail carrier': 'почтальон', postman: 'почтальон', teacher: 'учитель', 'female teacher': 'учительница',
  shopkeeper: 'продавец', seller: 'продавец', waiter: 'официант', waitress: 'официантка', pilot: 'пилот', 'flight attendant': 'стюардесса',
  sailor: 'моряк', captain: 'капитан', 'taxi driver': 'таксист', gardener: 'садовник', plumber: 'сантехник', vet: 'ветеринар',
  veterinarian: 'ветеринар', judge: 'судья', librarian: 'библиотекарь', miner: 'шахтёр', lumberjack: 'лесоруб', fisherman: 'рыбак',
  photographer: 'фотограф', journalist: 'журналист', reporter: 'журналист', janitor: 'уборщик', cleaner: 'уборщик', guard: 'охранник',
  'security guard': 'охранник', detective: 'детектив', mechanic: 'механик', programmer: 'программист', 'pastry chef': 'кондитер', baker: 'кондитер',
  farmer: 'фермер', beekeeper: 'пчеловод', gnome: 'гном', dwarf: 'гном', king: 'король', queen: 'королева', princess: 'принцесса',
  prince: 'принц', jester: 'шут', witch: 'ведьма', necromancer: 'некромант', paladin: 'паладин', barbarian: 'варвар', druid: 'друид',
  monk: 'монах', alchemist: 'алхимик', 'dark knight': 'рыцарь тьмы', orc: 'орк', elf: 'эльф', archer: 'лучник', fairy: 'фея', angel: 'ангел',
  imp: 'чертёнок', devil: 'чертёнок', archaeologist: 'археолог', explorer: 'исследователь', hunter: 'охотник', climber: 'альпинист',
  mountaineer: 'альпинист', hiker: 'турист', tourist: 'турист', alien: 'пришелец', cyborg: 'киборг', 'space marine': 'космодесантник',
  'starship pilot': 'пилот звездолёта', 'space pilot': 'пилот звездолёта', android: 'андроид', vampire: 'вампир', mummy: 'мумия',
  skeleton: 'скелет', werewolf: 'оборотень', ghost: 'призрак', 'pumpkin head': 'тыквоголовый', 'football player': 'футболист',
  'soccer player': 'футболист', 'basketball player': 'баскетболист', boxer: 'боксёр', 'tennis player': 'теннисист',
  'female tennis player': 'теннисистка', skier: 'лыжник', runner: 'бегун', 'hockey player': 'хоккеист', cyclist: 'велосипедист',
  coach: 'тренер', grandpa: 'дедушка', grandfather: 'дедушка', 'old man': 'дедушка', grandma: 'бабушка', grandmother: 'бабушка',
  'old woman': 'бабушка', schoolboy: 'школьник', boy: 'школьник', kid: 'школьник', child: 'школьник', schoolgirl: 'школьница', girl: 'школьница',
  toddler: 'малыш', baby: 'малыш', musician: 'музыкант', artist: 'художник', painter: 'художник', dj: 'диджей', blogger: 'блогер',
  singer: 'певица', ballerina: 'балерина', dancer: 'балерина', bride: 'невеста', cowgirl: 'ковбойша', samurai: 'самурай',
  legionary: 'легионер', 'roman soldier': 'легионер', pharaoh: 'фараон',
};
for (const [e, r] of Object.entries(NAMES)) if (!ALIASES[e]) ALIASES[e] = r;
const PLAIN = new Set(['person', 'man', 'human', 'walking man', 'base', 'none', '']);   // no costume: the base figure
/** The figure names the coder may use (English). */
/** The figure names the coder may use (English; Russian works too). */
export const FIGURE_NAMES = ['person', ...Object.keys(NAMES).filter((e) => COSTUMES[NAMES[e]])];
function outfitOf(name) {
  if (name == null) return null;
  const n = String(name).trim().toLowerCase();
  if (PLAIN.has(n)) return null;
  const r = ALIASES[n] ?? ALIASES[name] ?? name;
  if (!COSTUMES[r]) throw new Error(`No figure "${name}". Known: ${FIGURE_NAMES.join(', ')}`);
  return r;
}

// joints: the same names as Punto's person() (research/code/src/style/people.ts), plus elbows and knees
const JOINT = { root: 'Root', hips: 'Body', torso: 'Torso', head: 'Head', armR: 'ArmRight', armL: 'ArmLeft', forearmR: 'ForearmRight',
  forearmL: 'ForearmLeft', legR: 'LegRight', legL: 'LegLeft', shinR: 'ShinRight', shinL: 'ShinLeft', coatR: 'CoatRight', coatL: 'CoatLeft',
  skirtR: 'SkirtRight', skirtL: 'SkirtLeft' };
// height of the bare figure in the sheet's units (feet at 0): figure() scales it to the height asked
let H0 = 0;
function baseHeight() {
  if (!H0) { const g = bake(null, 'улыбка'); g.body.computeBoundingBox(); H0 = g.body.boundingBox.max.y; }
  return H0;
}
// the grip in each fist (sheet px): a thing's handle sits here, in the axes of Punto's knowledge/hand.md —
// the handle along Y, +Y out of the top of the fist (the thumb side, forward when the arm hangs), −Z along the forearm
// (a barrel points where the forearm points). Sizes of things are real metres for a 1.7 m person; the socket scales them.
const GRIP = [358, 866, 1378];
function handSocket(bone, left) {
  const s = new THREE.Object3D(); s.name = left ? 'HandLeft' : 'HandRight';
  const g = left ? [2 * AX - GRIP[0], GRIP[1], GRIP[2]] : GRIP, elbow = BONES[left ? 'forearmL' : 'forearmR'].p;
  s.position.copy(v3(g)).sub(v3(elbow));
  const z = v3(elbow).sub(v3(g)).normalize(), y = new THREE.Vector3(0, 0, 1), x = new THREE.Vector3().crossVectors(y, z).normalize();
  y.crossVectors(z, x);
  s.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  s.scale.setScalar(baseHeight() / 1.7);
  bone.add(s);
  return s;
}

/**
 * A ready figure by name, as one mesh (one draw call) in Punto's look.
 *   figure('pirate')                                  // 1 unit tall: on a tabletop board, one game unit
 *   figure('zombie', { height: 1.7 })                 // in the room: metres
 *   figure('knight', { face: 'angry', colors: { shirt: 'blue' } })
 * height — an adult's height in the units of the world it stands in (a kid's costume comes out smaller).
 * Feet at y = 0, facing +Z. userData.joints: Body, Torso, Head, ArmRight/Left, ForearmRight/Left, LegRight/Left,
 * ShinRight/Left, HandRight/Left (put a thing into a hand: joints.HandRight.add(sword())).
 */
export function figure(name = 'person', { height = 1, face, colors, material } = {}) {
  const outfit = outfitOf(name);
  const inner = makeFigure({ outfit, face: tr(face), colors: trObj(colors) });
  const B = inner.userData.bones, joints = {};
  for (const n of BONE_NAMES) { B[n].name = JOINT[n] ?? n; joints[JOINT[n] ?? n] = B[n]; }
  joints.HandRight = handSocket(B.forearmR, false);
  joints.HandLeft = handSocket(B.forearmL, true);
  if (material) inner.traverse((o) => { if (o.isSkinnedMesh && o.material === MAT) o.material = material; });
  const root = new THREE.Group(); root.name = 'Figure';
  root.add(inner);
  root.scale.setScalar(height / baseHeight());
  root.userData = { joints, bones: B, outfit, stride: inner.userData.stride, walk: inner.userData.walk };
  return root;
}
/** Plays an animation on a figure: call every frame with the time in seconds. 'walk' uses the figure's own gait. */
export function animate(fig, anim = 'idle', time = 0) {
  const B = fig.userData.bones, u = fig.userData;
  let a = tr(anim);
  if (a === 'идёт' && u.walk && ANIMS[u.walk]) a = u.walk;
  if (!ANIMS[a]) throw new Error(`No animation "${anim}". Known: idle, walk, run, sit, hold, wave, jump, shamble, aim, strike`);
  resetPose(B); ANIMS[a](time, B, u.stride ?? 0.55); follow(B); clampJoints(B);
}
/** Turns the head (within its limits) and, beyond them, the body towards a point in the scene. Call after animate(). */
export function lookAt(fig, point) { lookAtPoint(fig.children[0], fig.userData.bones, point); clampJoints(fig.userData.bones); }
/** A new figure from verbs: defineFigure('fire chief', { wear: [shirt({ color: 'red' }), hat({ shape: 'peaked cap' }), …] }). */
export function defineFigure(name, def) {
  const d = { ...def, face: tr(def.face), walk: tr(def.walk) };
  defineCostume(name, d);
  if (!FIGURE_NAMES.includes(name)) FIGURE_NAMES.push(name);
}
export const verbs = {
  shirt: en(shirt), pants: en(pants), boots: en(boots), skin: en(skin), belt: en(beltColor), coat: en(coatV), vest: en(vest), skirt: en(skirt),
  dress: en(dress), sleeves: en(sleeves), gloves: en(gloves), apron: en(apron), scarf: en(scarf), pads: en(pads), kneepads: en(kneepads),
  stripes: en(stripes), hat: en(hat),
  helmet: en((o = {}) => helmet({ ...o, brim: o.brim === 'спина' ? 'сзади' : o.brim })), hair: en(hair), lashes, beard: en(beard),
  mustache: en(mustache), ears: en(ears), mask: en(mask), glasses: en(glassesV), badge: en(badge), item: en(item), face: en(face), walk: en(walk),
};

export { makeFigure, defineCostume, wear, setFace, bake, model, bones, BONES, BONE_NAMES, COSTUMES, FACES, ANIMS, ALIASES, FIG, NAMED, COL,
  resetPose, follow, clampJoints, lookAtPoint, fx, fy, sz, S, AX, CUR_OUTFIT, FACE, STRIDE, MAT, ITEMS, ANCHORS, EN };
