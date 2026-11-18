// Library of ready figures: verbs only (see FIGURES.md). Internal names are Russian; English names are aliases (figures.js).
// Called once by figures.js: library(FIG).
export function library(FIG) {
const { makeFigure, defineCostume, setFace, wear, COSTUMES, FACES, dress, ears, alias, ALIASES, lookAtPoint, clampJoints, shirt, pants, boots, skin, beltColor, coat, vest, skirt, sleeves, gloves,
  apron, scarf, pads, kneepads, stripes, hat, helmet, hair, lashes, beard, mustache, mask, glasses, badge, item, pouch, face, walk, ANCHORS, ITEMS, NAMED } = FIG;
// Библиотека типажей: только глаголы из FIGURES.md. Кодер берёт по имени: makeFigure({ outfit: 'пожарный' })
const C = (name, ...wear) => defineCostume(name, { wear });
const HAIR_BLOND = 0xd9b26a, HAIR_BLACK = 0x2b2420, HAIR_GINGER = 0xc0652e, HAIR_GREY = 0xb9bcc0;

// ── Профессии ──
C('пожарный', shirt({ color: 'тёмно-серый' }), pants({ color: 'тёмно-серый' }), boots({ color: 'чёрный' }), coat({ color: 'красный', closed: true }),
  stripes({ on: 'пальто', color: 'жёлтый' }), helmet({ shape: 'купол', color: 'красный', brim: 'сзади' }), gloves({ color: 'жёлтый' }),
  item('рука справа', 'топор'), item('спина', 'баллон'), item('пояс слева', 'рация'));
C('медсестра', shirt({ color: 'голубой' }), pants({ color: 'голубой' }), boots({ color: 'белый' }), coat({ color: 'белый', closed: true }),
  hat({ shape: 'шапочка', color: 'белый' }), hair({ style: 'каре', color: HAIR_BLOND }), lashes(), badge('шапочка' in {} ? 'лоб' : 'грудь справа', { shape: 'круг', color: 'красный', size: 'маленький' }),
  item('рука справа', 'планшет'));
C('полицейский', shirt({ color: 'голубой' }), pants({ color: 'тёмно-синий' }), boots({ color: 'чёрный' }), beltColor({ color: 'чёрный' }),
  vest({ color: 'тёмно-синий', closed: true }), stripes({ on: 'жилет', color: 'серебряный' }), hat({ shape: 'фуражка', color: 'тёмно-синий' }),
  badge('грудь слева', { shape: 'звезда', color: 'золотой' }), item('пояс справа', 'дубинка'), item('пояс слева', 'рация'), item('рука справа', 'фонарик'));
C('водолаз', shirt({ color: 'тёмно-синий' }), pants({ color: 'тёмно-синий' }), boots({ color: 'чёрный' }), sleeves({ color: 'тёмно-синий' }),
  stripes({ on: 'торс', color: 'жёлтый' }), gloves({ color: 'чёрный' }), helmet({ shape: 'сфера', color: 'золотой', visor: 'голубой' }),
  item('спина', 'баллон'), item('рука справа', 'фонарик'));
C('почтальон', shirt({ color: 'голубой' }), pants({ color: 'тёмно-синий' }), hat({ shape: 'фуражка', color: 'синий' }), item('спина', 'сумка через плечо', { color: 'коричневый' }),
  badge('грудь слева', { shape: 'полоса', color: 'жёлтый' }), item('рука справа', 'свиток', { color: 'белый' }));
C('учитель', shirt({ color: 'белый' }), pants({ color: 'тёмно-серый' }), boots({ color: 'коричневый' }), vest({ color: 'коричневый' }), glasses({ type: 'обычные' }),
  item('шея', 'галстук', { color: 'тёмно-красный' }), item('рука справа', 'указка'), hair({ style: 'короткие', color: HAIR_GREY }));
C('учительница', shirt({ color: 'белый' }), dress({ color: 'тёмно-синий', hem: 'колено' }), hair({ style: 'пучок', color: 'коричневый' }), lashes(),
  glasses({ type: 'обычные' }), item('рука справа', 'книга' in {} ? 'указка' : 'указка'), boots({ color: 'чёрный' }));
C('продавец', shirt({ color: 'зелёный' }), apron({ color: 'красный' }), hat({ shape: 'кепка', color: 'красный' }), badge('грудь справа', { shape: 'полоса', color: 'белый' }));
C('официант', shirt({ color: 'белый' }), pants({ color: 'чёрный' }), boots({ color: 'чёрный' }), vest({ color: 'чёрный' }), item('шея', 'бабочка'),
  item('рука справа', 'поднос'), hair({ style: 'короткие', color: HAIR_BLACK }));
C('официантка', shirt({ color: 'белый' }), dress({ color: 'чёрный', hem: 'колено' }), apron({ color: 'белый' }), hair({ style: 'хвост', color: HAIR_GINGER }), lashes(),
  item('рука справа', 'поднос'));
C('пилот', shirt({ color: 'белый' }), pants({ color: 'тёмно-синий' }), boots({ color: 'чёрный' }), coat({ color: 'тёмно-синий', hem: 'бедро', closed: true }),
  hat({ shape: 'фуражка', color: 'тёмно-синий' }), badge('грудь слева', { shape: 'полоса', color: 'золотой' }), item('шея', 'галстук', { color: 'чёрный' }), item('рука справа', 'чемодан', { color: 'чёрный' }));
C('стюардесса', dress({ color: 'тёмно-синий', hem: 'колено' }), scarf({ color: 'красный' }), hat({ shape: 'шапочка', color: 'тёмно-синий' }),
  hair({ style: 'пучок', color: HAIR_BLOND }), lashes(), badge('грудь слева', { shape: 'полоса', color: 'золотой', size: 'маленький' }), boots({ color: 'тёмно-синий' }));
C('моряк', shirt({ color: 'белый' }), pants({ color: 'тёмно-синий' }), stripes({ on: 'торс', color: 'синий' }), hat({ shape: 'бескозырка', color: 'белый', band: 'тёмно-синий' }),
  item('шея', 'галстук', { color: 'тёмно-синий' }));
C('капитан', shirt({ color: 'белый' }), pants({ color: 'белый' }), boots({ color: 'чёрный' }), coat({ color: 'тёмно-синий', cuff: 'золотой', hem: 'бедро', closed: true }),
  hat({ shape: 'фуражка', color: 'белый' }), beard({ color: HAIR_GREY }), badge('грудь слева', { shape: 'звезда', color: 'золотой' }), item('грудь', 'бинокль'));
C('таксист', shirt({ color: 'жёлтый' }), pants({ color: 'тёмно-серый' }), hat({ shape: 'кепка', color: 'чёрный' }), vest({ color: 'чёрный' }), glasses({ type: 'тёмные' }), mustache({ color: HAIR_BLACK }));
C('садовник', shirt({ color: 'бежевый' }), pants({ color: 'тёмно-зелёный' }), boots({ color: 'коричневый' }), apron({ color: 'зелёный' }),
  hat({ shape: 'шляпа', color: 'бежевый' }), gloves({ color: 'зелёный' }), item('рука справа', 'лопата'));
C('сантехник', shirt({ color: 'синий' }), pants({ color: 'синий' }), hat({ shape: 'кепка', color: 'красный' }), mustache({ color: 'коричневый' }),
  item('рука справа', 'гаечный ключ'), item('пояс слева', 'сумка', { color: 'чёрный' }));
C('ветеринар', shirt({ color: 'бирюзовый' }), pants({ color: 'бирюзовый' }), coat({ color: 'белый', hem: 'бедро' }), hair({ style: 'хвост', color: 'коричневый' }), lashes(),
  badge('грудь слева', { shape: 'круг', color: 'зелёный', size: 'маленький' }), item('рука справа', 'планшет'));
C('судья', shirt({ color: 'белый' }), coat({ color: 'чёрный', hem: 'пол', closed: true }), glasses({ type: 'обычные' }), hair({ style: 'короткие', color: HAIR_GREY }), item('рука справа', 'молоток', { color: 'коричневый' }));
C('библиотекарь', shirt({ color: 'бежевый' }), coat({ color: 'тёмно-зелёный', hem: 'бедро' }), glasses({ type: 'обычные' }), hair({ style: 'пучок', color: HAIR_GREY }), lashes(),
  dress({ color: 'коричневый', hem: 'голень' }), item('рука справа', 'свиток'));
C('шахтёр', shirt({ color: 'тёмно-серый' }), pants({ color: 'тёмно-синий' }), helmet({ shape: 'купол', color: 'жёлтый' }), stripes({ on: 'торс', color: 'оранжевый' }),
  gloves({ color: 'тёмно-серый' }), item('рука справа', 'кирка'), item('рука слева', 'фонарь'));
C('лесоруб', shirt({ color: 'красный' }), pants({ color: 'синий' }), boots({ color: 'коричневый' }), beard({ color: HAIR_GINGER }), hat({ shape: 'шапка', color: 'тёмно-зелёный', band: 'красный' }),
  vest({ color: 'тёмно-зелёный' }), item('рука справа', 'топор'));
C('рыбак', shirt({ color: 'бежевый' }), pants({ color: 'тёмно-зелёный' }), boots({ color: 'тёмно-зелёный' }), vest({ color: 'тёмно-зелёный' }),
  hat({ shape: 'шляпа', color: 'светло-коричневый' }), beard({ color: HAIR_GREY }), item('рука справа', 'удочка'), item('пояс слева', 'сумка'));
C('фотограф', shirt({ color: 'тёмно-серый' }), vest({ color: 'бежевый' }), hat({ shape: 'берет', color: 'чёрный' }), item('грудь', 'фотоаппарат'), glasses({ type: 'обычные' }));
C('журналист', shirt({ color: 'белый' }), coat({ color: 'бежевый', hem: 'бедро' }), hair({ style: 'каре', color: HAIR_BLACK }), lashes(), item('рука справа', 'микрофон'), item('пояс слева', 'сумка'));
C('уборщик', shirt({ color: 'синий' }), pants({ color: 'синий' }), apron({ color: 'серый' }), hat({ shape: 'кепка', color: 'синий' }), gloves({ color: 'жёлтый' }), item('рука справа', 'метла'));
C('охранник', shirt({ color: 'белый' }), pants({ color: 'чёрный' }), boots({ color: 'чёрный' }), coat({ color: 'чёрный', hem: 'бедро' }), glasses({ type: 'тёмные' }),
  item('шея', 'галстук', { color: 'чёрный' }), item('пояс слева', 'рация'), hair({ style: 'лысый' }), face('сердитый'));
C('детектив', shirt({ color: 'белый' }), coat({ color: 'бежевый', hem: 'колено', closed: true }), hat({ shape: 'шляпа', color: 'коричневый' }), item('рука справа', 'лупа'), mustache({ color: 'коричневый' }));
C('механик', shirt({ color: 'синий' }), pants({ color: 'синий' }), hat({ shape: 'кепка', color: 'красный' }), gloves({ color: 'чёрный' }), badge('живот', { shape: 'заплатка', color: 'тёмно-серый' }),
  item('рука справа', 'гаечный ключ'), item('пояс слева', 'ключи'));
C('программист', shirt({ color: 'чёрный' }), coat({ color: 'тёмно-серый', hem: 'бедро', closed: true }), glasses({ type: 'обычные' }), hat({ shape: 'наушники', color: 'чёрный' }),
  item('рука справа', 'телефон'));
C('кондитер', shirt({ color: 'белый' }), apron({ color: 'розовый' }), hat({ shape: 'поварской колпак', color: 'белый' }), item('рука справа', 'половник'), item('шея', 'бабочка', { color: 'розовый' }));
C('фермер', shirt({ color: 'бежевый' }), pants({ color: 'синий' }), boots({ color: 'коричневый' }), vest({ color: 'тёмно-зелёный' }), sleeves({ color: 'бежевый' }),
  scarf({ color: 'красный' }), hat({ shape: 'шляпа', color: 'светло-коричневый', band: 'коричневый' }), item('рука справа', 'вилы'));
C('пчеловод', shirt({ color: 'белый' }), pants({ color: 'белый' }), coat({ color: 'белый', closed: true }), sleeves({ color: 'белый' }), gloves({ color: 'светло-коричневый' }),
  hat({ shape: 'шляпа', color: 'белый', band: 'серый', veil: true }), item('рука справа', 'фонарь'));

// ── Фэнтези и сказки ──
C('гном', shirt({ color: 'бежевый' }), pants({ color: 'коричневый' }), vest({ color: 'тёмно-зелёный', closed: true }), hat({ shape: 'колпак', color: 'красный', band: 'белый' }),
  beard({ color: 'белый' }), mustache({ color: 'белый' }), item('рука справа', 'кирка'), item('спина', 'рюкзак'), { scale: 0.8 });
C('король', shirt({ color: 'белый' }), pants({ color: 'тёмно-красный' }), beltColor({ color: 'золотой' }), coat({ color: 'тёмно-красный', cuff: 'белый', hem: 'пол' }),
  pads({ color: 'золотой' }), hat({ shape: 'корона', color: 'золотой' }), beard({ color: HAIR_GREY }), mustache({ color: HAIR_GREY }), item('рука справа', 'скипетр'));
C('королева', dress({ color: 'фиолетовый' }), coat({ color: 'тёмно-красный', cuff: 'белый', hem: 'пол' }), hat({ shape: 'корона', color: 'золотой' }),
  hair({ style: 'пучок', color: HAIR_GINGER }), lashes(), item('шея', 'медальон'), item('рука справа', 'скипетр'));
C('принцесса', dress({ color: 'розовый' }), gloves({ color: 'белый' }), hair({ style: 'длинные', color: HAIR_BLOND }), lashes(), hat({ shape: 'диадема', color: 'золотой' }),
  item('шея', 'медальон'));
C('принц', shirt({ color: 'белый' }), pants({ color: 'белый' }), boots({ color: 'коричневый' }), vest({ color: 'синий', closed: true }), item('спина', 'плащ', { color: 'тёмно-красный' }),
  hat({ shape: 'диадема', color: 'золотой' }), item('пояс слева', 'ножны'), hair({ style: 'короткие', color: HAIR_BLOND }));
C('шут', shirt({ color: 'красный' }), pants({ color: 'жёлтый' }), vest({ color: 'жёлтый', closed: true }), hat({ shape: 'колпак', color: 'красный', band: 'жёлтый' }),
  badge('грудь справа', { shape: 'круг', color: 'красный' }), badge('грудь слева', { shape: 'круг', color: 'синий' }), face('радость'));
C('ведьма', dress({ color: 'чёрный' }), hat({ shape: 'конус', color: 'чёрный', band: 'фиолетовый' }), hair({ style: 'длинные', color: HAIR_BLACK }), lashes(),
  item('рука справа', 'метла'), skin({ color: 0xc6d9a8 }), item('шея', 'медальон', { color: 'зелёный' }));
C('некромант', coat({ color: 'чёрный', cuff: 'фиолетовый', hem: 'пол', closed: true }), hat({ shape: 'капюшон', color: 'чёрный' }), face('череп'),
  skin({ color: 0xd9d6cc }), item('рука справа', 'посох', { color: 'тёмно-серый' }), gloves({ color: 'чёрный' }));
C('паладин', helmet({ shape: 'ведро', color: 'золотой' }), vest({ color: 'серебряный', closed: true }), pads({ color: 'золотой' }), gloves({ color: 'серебряный' }),
  item('рука справа', 'меч'), item('рука слева', 'щит', { color: 'белый' }), shirt({ color: 'белый' }), boots({ color: 'серебряный' }), badge('грудь', { shape: 'звезда', color: 'золотой', size: 'большой' }));
C('варвар', skin({ color: 0xd9a37a }), shirt({ color: 0xd9a37a }), pants({ color: 'коричневый' }), boots({ color: 'коричневый' }), beard({ color: HAIR_GINGER }),
  hair({ style: 'длинные', color: HAIR_GINGER }), pads({ color: 'светло-коричневый' }), item('рука справа', 'топор'), face('сердитый'));
C('друид', coat({ color: 'тёмно-зелёный', hem: 'пол', closed: true }), hat({ shape: 'капюшон', color: 'зелёный' }), beard({ color: 'белый' }), item('рука справа', 'посох'),
  item('пояс слева', 'сумка', { color: 'коричневый' }));
C('монах', coat({ color: 'коричневый', hem: 'пол', closed: true }), hat({ shape: 'капюшон', color: 'коричневый' }), item('рука справа', 'фонарь'), item('шея', 'медальон', { color: 'коричневый' }));
C('алхимик', shirt({ color: 'фиолетовый' }), apron({ color: 'коричневый' }), glasses({ type: 'защитные' }), beard({ color: HAIR_GREY }), gloves({ color: 'чёрный' }),
  item('пояс слева', 'фляга'), item('пояс справа', 'книга'), item('рука справа', 'свиток'));
C('рыцарь тьмы', helmet({ shape: 'ведро', color: 'чёрный' }), vest({ color: 'тёмно-серый', closed: true }), pads({ color: 'чёрный' }), gloves({ color: 'чёрный' }),
  shirt({ color: 'тёмно-красный' }), pants({ color: 'чёрный' }), boots({ color: 'чёрный' }), item('рука справа', 'меч', { color: 'тёмно-серый' }), item('спина', 'плащ', { color: 'чёрный' }));
C('орк', skin({ color: 0x7fa356 }), shirt({ color: 'коричневый' }), pants({ color: 'тёмно-серый' }), pads({ color: 'тёмно-серый' }), item('рука справа', 'топор'),
  hair({ style: 'лысый' }), face('сердитый'), beltColor({ color: 'чёрный' }));
C('эльф', shirt({ color: 'зелёный' }), pants({ color: 'коричневый' }), boots({ color: 'коричневый' }), ears(), hair({ style: 'длинные', color: HAIR_BLOND }),
  item('спина', 'колчан'), item('рука справа', 'лук'), vest({ color: 'тёмно-зелёный' }));
C('лучник', shirt({ color: 'зелёный' }), pants({ color: 'коричневый' }), hat({ shape: 'капюшон', color: 'тёмно-зелёный' }), item('спина', 'колчан'), item('рука справа', 'лук'),
  gloves({ color: 'коричневый' }));
C('фея', dress({ color: 'голубой', hem: 'колено' }), item('спина', 'крылья', { color: 'белый' }), hair({ style: 'хвост', color: HAIR_BLOND }), lashes(),
  item('рука справа', 'палочка'), hat({ shape: 'диадема', color: 'серебряный' }), { scale: 0.75 });
C('ангел', dress({ color: 'белый' }), item('спина', 'крылья', { color: 'белый' }), hat({ shape: 'нимб', color: 'золотой' }), hair({ style: 'каре', color: HAIR_BLOND }), face('радость'));
C('чертёнок', skin({ color: 0xd9574a }), shirt({ color: 'тёмно-красный' }), pants({ color: 'чёрный' }), hat({ shape: 'рожки', color: 'чёрный' }), item('пояс сзади', 'хвост', { color: 'тёмно-красный' }),
  hair({ style: 'короткие', color: HAIR_BLACK }), face('радость'), { scale: 0.8 });

// ── Приключения ──
C('археолог', shirt({ color: 'бежевый' }), pants({ color: 'светло-коричневый' }), vest({ color: 'коричневый' }), hat({ shape: 'шляпа', color: 'коричневый' }),
  item('рука справа', 'факел'), item('пояс слева', 'сумка'));
C('исследователь', shirt({ color: 'бежевый' }), pants({ color: 'бежевый' }), hat({ shape: 'шляпа', color: 'бежевый', band: 'коричневый' }), item('грудь', 'бинокль'),
  item('спина', 'рюкзак'), mustache({ color: HAIR_GINGER }));
C('охотник', shirt({ color: 'тёмно-зелёный' }), pants({ color: 'коричневый' }), vest({ color: 'оранжевый' }), hat({ shape: 'кепка', color: 'оранжевый' }), item('спина', 'рюкзак', { color: 'тёмно-зелёный' }),
  item('рука справа', 'лук'));
C('альпинист', shirt({ color: 'оранжевый' }), pants({ color: 'тёмно-серый' }), helmet({ shape: 'купол', color: 'красный' }), glasses({ type: 'тёмные' }), gloves({ color: 'чёрный' }),
  item('спина', 'рюкзак', { color: 'синий' }), item('рука справа', 'кирка'));
C('турист', shirt({ color: 'голубой' }), pants({ color: 'бежевый' }), hat({ shape: 'кепка', color: 'белый' }), item('грудь', 'фотоаппарат'), item('спина', 'рюкзак', { color: 'оранжевый' }),
  glasses({ type: 'тёмные' }));

// ── Фантастика ──
C('пришелец', skin({ color: 0x8fd18a }), shirt({ color: 'серебряный' }), pants({ color: 'серебряный' }), boots({ color: 'тёмно-серый' }), hat({ shape: 'антенки', color: 'фиолетовый' }),
  hair({ style: 'лысый' }), face('удивление'));
C('киборг', shirt({ color: 'тёмно-серый' }), pants({ color: 'чёрный' }), vest({ color: 'серебряный', closed: true }), sleeves({ color: 'серебряный' }), gloves({ color: 'серебряный' }),
  glasses({ type: 'тёмные' }), hair({ style: 'короткие', color: HAIR_BLACK }), face('сердитый'), item('рука справа', 'бластер'));
C('космодесантник', helmet({ shape: 'сфера', color: 'тёмно-зелёный', visor: 'оранжевый' }), vest({ color: 'тёмно-зелёный', closed: true }), pads({ color: 'тёмно-зелёный' }),
  gloves({ color: 'чёрный' }), shirt({ color: 'тёмно-серый' }), pants({ color: 'тёмно-серый' }), boots({ color: 'чёрный' }), item('рука справа', 'бластер'), item('спина', 'рюкзак', { color: 'тёмно-серый' }));
C('пилот звездолёта', shirt({ color: 'оранжевый' }), pants({ color: 'оранжевый' }), helmet({ shape: 'сфера', color: 'белый', visor: 'голубой' }), gloves({ color: 'белый' }),
  badge('плечо справа', { shape: 'полоса', color: 'синий' }), badge('грудь слева', { shape: 'звезда', color: 'синий' }), boots({ color: 'белый' }));
C('андроид', skin({ color: 0xcdd3da }), shirt({ color: 'белый' }), pants({ color: 'белый' }), boots({ color: 'серый' }), hair({ style: 'лысый' }), badge('лоб', { shape: 'круг', color: 'голубой', size: 'маленький' }));

// ── Хеллоуин ──
C('вампир', skin({ color: 0xe8e2dc }), shirt({ color: 'белый' }), pants({ color: 'чёрный' }), vest({ color: 'тёмно-красный', closed: true }), item('спина', 'плащ', { color: 'чёрный' }),
  item('спина', 'воротник', { color: 'тёмно-красный' }), hair({ style: 'короткие', color: HAIR_BLACK }), face('сердитый'));
C('мумия', skin({ color: 0xe0d6bc }), shirt({ color: 0xe0d6bc }), pants({ color: 0xe0d6bc }), boots({ color: 0xe0d6bc }), hair({ style: 'лысый' }), face('зомби'), walk('ковыляет'),
  ...['грудь', 'живот', 'спина', 'бедро справа', 'бедро слева', 'колено справа', 'колено слева', 'лоб'].map((a) => badge(a, { shape: 'полоса', color: 0xb9ad90, size: 'большой' })));
C('скелет', skin({ color: 0xf1ede2 }), shirt({ color: 'чёрный' }), pants({ color: 'чёрный' }), hair({ style: 'лысый' }), face('череп'),
  ...['грудь', 'живот'].map((a) => badge(a, { shape: 'полоса', color: 0xf1ede2, size: 'большой' })), badge('грудь справа', { shape: 'полоса', color: 0xf1ede2 }), badge('грудь слева', { shape: 'полоса', color: 0xf1ede2 }));
C('оборотень', skin({ color: 0x8a6a4a }), shirt({ color: 'тёмно-красный' }), pants({ color: 'синий' }), beard({ color: 0x5a4030 }), hair({ style: 'длинные', color: 0x5a4030 }),
  badge('грудь', { shape: 'заплатка', color: 0x5a4030 }), item('пояс сзади', 'хвост', { color: 0x5a4030 }), face('сердитый'));
C('призрак', dress({ color: 'белый' }), hat({ shape: 'капюшон', color: 'белый' }), skin({ color: 0xf3f2ec }), sleeves({ color: 'белый' }), gloves({ color: 'белый' }), face('удивление'));
C('тыквоголовый', hat({ shape: 'тыква', color: 'оранжевый' }), shirt({ color: 'фиолетовый' }), pants({ color: 'чёрный' }), item('спина', 'плащ', { color: 'чёрный' }), item('рука справа', 'фонарь'));

// ── Спорт ──
C('футболист', shirt({ color: 'красный' }), pants({ color: 'белый' }), boots({ color: 'чёрный' }), badge('спина', { shape: 'круг', color: 'белый', size: 'большой' }), item('рука справа', 'мяч'));
C('баскетболист', shirt({ color: 'оранжевый' }), pants({ color: 'оранжевый' }), boots({ color: 'белый' }), hat({ shape: 'бандана', color: 'белый' }), item('рука справа', 'мяч', { color: 'оранжевый' }),
  badge('грудь', { shape: 'полоса', color: 'белый' }));
C('боксёр', shirt({ color: 'белый' }), pants({ color: 'красный' }), gloves({ color: 'красный', size: 'большой' }), hair({ style: 'короткие', color: HAIR_BLACK }), face('сердитый'));
C('теннисист', shirt({ color: 'белый' }), pants({ color: 'белый' }), boots({ color: 'белый' }), hat({ shape: 'кепка', color: 'белый' }), item('рука справа', 'ракетка'));
C('теннисистка', shirt({ color: 'белый' }), skirt({ color: 'белый', hem: 'бедро' }), boots({ color: 'белый' }), hat({ shape: 'бандана', color: 'розовый' }), hair({ style: 'хвост', color: HAIR_BLOND }),
  lashes(), item('рука справа', 'ракетка', { color: 'розовый' }));
C('лыжник', shirt({ color: 'синий' }), pants({ color: 'чёрный' }), sleeves({ color: 'синий' }), hat({ shape: 'шапка', color: 'красный', band: 'белый' }), glasses({ type: 'защитные' }),
  gloves({ color: 'чёрный' }), item('рука справа', 'трость', { color: 'серебряный' }), item('рука слева', 'трость', { color: 'серебряный' }));
C('бегун', shirt({ color: 'жёлтый' }), pants({ color: 'чёрный' }), boots({ color: 'белый' }), hat({ shape: 'бандана', color: 'синий' }), badge('грудь', { shape: 'полоса', color: 'белый', size: 'большой' }));
C('хоккеист', shirt({ color: 'синий' }), pants({ color: 'синий' }), helmet({ shape: 'купол', color: 'белый' }), pads({ color: 'синий' }), gloves({ color: 'синий', size: 'большой' }),
  kneepads({ color: 'белый' }), item('рука справа', 'клюшка'));
C('велосипедист', shirt({ color: 'зелёный' }), pants({ color: 'чёрный' }), helmet({ shape: 'купол', color: 'зелёный' }), glasses({ type: 'тёмные' }), gloves({ color: 'чёрный' }));
C('тренер', shirt({ color: 'синий' }), pants({ color: 'синий' }), sleeves({ color: 'синий' }), hat({ shape: 'кепка', color: 'синий' }), item('грудь', 'свисток'), item('рука справа', 'планшет'));

// ── Быт ──
C('дедушка', shirt({ color: 'бежевый' }), pants({ color: 'тёмно-серый' }), vest({ color: 'коричневый' }), glasses({ type: 'обычные' }), hair({ style: 'лысый' }), mustache({ color: HAIR_GREY }),
  item('рука справа', 'трость'), { stride: 0.35 });
C('бабушка', dress({ color: 'тёмно-зелёный', hem: 'голень' }), scarf({ color: 'красный' }), glasses({ type: 'обычные' }), hair({ style: 'пучок', color: HAIR_GREY }), lashes(),
  item('пояс слева', 'сумка', { color: 'тёмно-красный' }), { stride: 0.35 });
C('школьник', shirt({ color: 'белый' }), pants({ color: 'тёмно-синий' }), hat({ shape: 'кепка', color: 'красный' }), item('спина', 'рюкзак', { color: 'синий' }), face('радость'), { scale: 0.75 });
C('школьница', shirt({ color: 'белый' }), skirt({ color: 'тёмно-синий', hem: 'бедро' }), hair({ style: 'хвост', color: HAIR_GINGER }), lashes(), item('спина', 'рюкзак', { color: 'розовый' }),
  item('шея', 'бабочка', { color: 'красный' }), face('радость'), { scale: 0.75 });
C('малыш', shirt({ color: 'жёлтый' }), pants({ color: 'голубой' }), hat({ shape: 'шапка', color: 'голубой', band: 'белый' }), face('радость'), { scale: 0.6 });
C('музыкант', shirt({ color: 'чёрный' }), pants({ color: 'синий' }), coat({ color: 'чёрный', hem: 'бедро' }), item('спина', 'гитара'), hair({ style: 'длинные', color: HAIR_BLACK }), glasses({ type: 'тёмные' }));
C('художник', shirt({ color: 'белый' }), apron({ color: 'синий' }), hat({ shape: 'берет', color: 'красный' }), mustache({ color: HAIR_BLACK }), item('рука справа', 'кисть'),
  badge('живот', { shape: 'заплатка', color: 'жёлтый', size: 'маленький' }));
C('диджей', shirt({ color: 'фиолетовый' }), pants({ color: 'чёрный' }), hat({ shape: 'наушники', color: 'голубой' }), glasses({ type: 'тёмные' }), item('шея', 'медальон'));
C('блогер', shirt({ color: 'розовый' }), pants({ color: 'голубой' }), hat({ shape: 'кепка', color: 'жёлтый' }), item('рука справа', 'телефон'), face('радость'));
C('певица', dress({ color: 'красный' }), hair({ style: 'длинные', color: HAIR_BLACK }), lashes(), item('рука справа', 'микрофон'), item('шея', 'медальон'));
C('балерина', dress({ color: 'розовый', hem: 'бедро' }), hair({ style: 'пучок', color: 'коричневый' }), lashes(), boots({ color: 'розовый' }), hat({ shape: 'диадема', color: 'серебряный' }));
C('невеста', dress({ color: 'белый' }), gloves({ color: 'белый' }), hair({ style: 'пучок', color: HAIR_BLOND }), lashes(), hat({ shape: 'диадема', color: 'серебряный', veil: 'фата' }), face('радость'));
C('ковбойша', shirt({ color: 'розовый' }), pants({ color: 'синий' }), boots({ color: 'коричневый' }), vest({ color: 'коричневый' }), hat({ shape: 'шляпа', color: 'светло-коричневый' }),
  hair({ style: 'хвост', color: HAIR_BLOND }), lashes(), scarf({ color: 'красный' }), item('пояс слева', 'кобура'));

// ── История ──
C('самурай', coat({ color: 'тёмно-синий', cuff: 'белый', hem: 'голень', closed: true }), pads({ color: 'тёмно-красный' }), hair({ style: 'пучок', color: HAIR_BLACK }),
  item('пояс слева', 'ножны', { color: 'чёрный' }), item('спина', 'меч за спиной'), face('сердитый'));
C('легионер', shirt({ color: 'красный' }), skirt({ color: 'красный', hem: 'бедро' }), vest({ color: 'золотой', closed: true }), helmet({ shape: 'купол', color: 'золотой' }),
  item('рука справа', 'копьё'), item('рука слева', 'щит', { color: 'красный' }), boots({ color: 'коричневый' }));
C('фараон', shirt({ color: 'белый' }), skirt({ color: 'белый', hem: 'колено' }), hat({ shape: 'тюрбан', color: 'золотой' }), item('шея', 'медальон'), item('рука справа', 'скипетр'),
  badge('грудь', { shape: 'полоса', color: 'синий', size: 'большой' }), boots({ color: 'золотой' }));

// ── Синонимы: кодер может писать как ему удобно ──
alias(['строитель', 'прораб'], 'рабочий'); alias(['маг', 'чародей', 'колдун'], 'волшебник'); alias(['доктор', 'медик'], 'врач');
alias(['медбрат', 'санитарка'], 'медсестра'); alias(['шериф'], 'ковбой'); alias(['офисный работник', 'менеджер'], 'клерк');
alias(['кок', 'шеф-повар'], 'повар'); alias(['корсар', 'флибустьер'], 'пират'); alias(['астронавт'], 'космонавт'); alias(['мертвец'], 'зомби');
alias(['полицейская'], 'полицейский'); alias(['пожарник'], 'пожарный'); alias(['учёная'], 'учёный'); alias(['школьник младший', 'ребёнок'], 'школьник');
alias(['бабуля'], 'бабушка'); alias(['дед'], 'дедушка'); alias(['стражник'], 'охранник'); alias(['морячок', 'матрос'], 'моряк');
alias(['следователь', 'сыщик'], 'детектив'); alias(['ведьмочка', 'колдунья'], 'ведьма'); alias(['фея-крёстная'], 'фея'); alias(['чёрт', 'бесёнок'], 'чертёнок');
alias(['космический пехотинец'], 'космодесантник'); alias(['скелетон'], 'скелет'); alias(['привидение'], 'призрак');

}
