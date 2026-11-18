// What Punto says in the intro. The voice is recorded once from these lines
// (node tools/voice.mjs -> public/voice/<key>.wav) and played from the files:
// change a line here, then run the tool again.
export const INTRO_LINES = {
  // before XR, after the player's first touch of the page (a page may not sound before that)
  start: "Hit my button and let's get started!",
  hello: "I'm Punto! I live in the code behind your walls. You say it, I build it. Congrats, you're a coder now.",
  // after the way in: what shall we do? Three ready answers (play, learn, make), then the turn is the player's
  offer: 'So, what are we making? A wall-blaster? A mini solar system right in your living room? Whatever you want.',
  askMe: 'Look at me, pinch, and tell me what to make!',
  again: 'Welcome back! What are we building today?',
  example: 'Watch! You can just say: I want a red cube!',
  cube: 'A red cube!',
  ball: 'Now… make it a ball!',
  real: 'And make it real!',
  grab: 'Grab it! Point and pinch.',
  leave: 'Want to leave? Just press my button, right here!',
  wall: 'Now watch this!',
  oops: 'Screw it, I got it!',
  // the way in (src/entrance.ts): Punto behind the cracked wall, then in the room
  anyone: 'Can anybody hear me? Hey! Is anybody out there?',
  help1: 'Hey! Over here!',
  help2: 'Psst! Down here! Little help?',
  seen: "Oh, hey! You can see me? Yeah, so... I'm kinda stuck in your wall.",
  pull: 'Look at a piece of the wall and pull it toward you!',
  nudge1: 'Any piece works. Just point and pinch!',
  nudge2: "Come on, it's barely hanging on anyway!",
  pulled1: 'Yeah, just like that!',
  pulled2: 'One more!',
  pulled3: "Okay, that's enough—I think I can squeeze through.",
  pushing: "Alright, alright, I'll push from the inside!",
  stuck: 'Ugh... wedged in. Hang on...',
  fixit: 'Uh... we kinda wrecked your wall. Let\'s fix it before anyone notices. Look at me, pinch, and say "fix it."',
  sayFix: 'Look at me, pinch, and say "fix it."',
  free: "I'm out! Appreciate it!",
  planets: 'How about a mini solar system?',
  tryBlaster: 'Now you try! Point at me, pinch, and say: give me a blaster that breaks walls!',
  remind: 'Look at me, pinch, and tell me what you want!',
  blasterReady: 'Boom! Grab it and pull the trigger. Go break some walls!',
  // ideas while the player warms up (with 'planets')
  suggestHoop: 'Want a basketball hoop right on your wall? Just ask!',
  suggestDna: 'Or maybe... a giant DNA strand? Just say the word!',
  sorry: 'Missed that—say it one more time?',
  // after the live coder: said only when the new thing really is in the scene
  done: 'Done!',
  // a thing for a spot in the room: the player points there while Punto codes (src/place.ts)
  pointIt: 'Point where you want it and pinch!',
  gotIt: 'Got it! Putting it right there.',
  fixing: 'Whoops! Let me fix that.',
  failed: "Huh, that didn't work. Try asking again?",
  // while the live coder writes: now and then a word, so the wait is not silent (first "working on it",
  // then a coder's joke or two, then "almost done")
  busyWorking: 'Working on it, working on it...',
  busyTyping: 'Tap-tap-tap... semicolon... boom.',
  busyBugs: 'Hold on, squashing a bug... got it.',
  busyMagic: 'Coding is basically magic, just with way more brackets.',
  busyCompile: 'Compiling... compiling... beep-boop.',
  busyAlmost: 'Almost there... just a couple more lines.',
  busySoon: 'Hang tight... adding the finishing touches.',
  // after a thing is made: the way to keep it (the director opens the tablet on «save»)
  saveOffer: "Like it? Just say: save it! And I'll keep it on my tablet.",
  // Punto's own sounds, not words
  laugh: '[laughing]',
  woohoo: 'Woohoo!',
  hmm: 'Hmm…',
};

export type IntroLine = keyof typeof INTRO_LINES;

// The same lines in Russian (?lang=ru in the address), recorded in one take and cut: node tools/voice-take.mjs --ru.
// One character, not a mascot: a mischievous partner who made a mess and is getting out of it — short,
// on «ты», few exclamation marks; the gesture is «наведи руку, зажми пальцы» (no «щипни»), plates are
// «схвати и тяни». The server already hears Russian and answers in it.
export const INTRO_LINES_RU: Record<IntroLine, string> = {
  start: 'Жми мою кнопку — и поехали.',
  hello: 'Я Пунто. Живу тут, в коде за твоими стенами. Ты придумываешь — я собираю. Так что кодить, по сути, будешь ты.',
  offer: 'Ну что, с чего начнём? Можно бластер, который ломает стены. Можно Солнечную систему, прямо тут. Или придумай своё.',
  askMe: 'Наведи на меня руку, зажми пальцы и говори.',
  again: 'О, снова ты. Что сегодня соберём?',
  example: 'Смотри! Можно просто сказать: хочу красный кубик!',
  cube: 'Красный кубик!',
  ball: 'А теперь… пусть станет мячиком!',
  real: 'И пусть будет настоящим!',
  grab: 'Хватай! Наведи и щипни.',
  leave: 'Хочешь выйти? Просто нажми мою кнопку, вот здесь!',
  wall: 'А теперь смотри!',
  oops: 'Ладно, сам починю.',
  anyone: 'Меня кто-нибудь слышит? Эй! Там есть кто-нибудь?',
  help1: 'Эй. Я тут, в стене.',
  help2: 'Пс-с… сюда посмотри.',
  seen: 'О, ты меня видишь? Фух. Слушай, я тут немного… застрял в твоей стене.',
  pull: 'Хватай любой кусок и тяни на себя.',
  nudge1: 'Любой. Схвати и дёрни.',
  nudge2: 'Давай-давай, они на честном слове держатся.',
  pulled1: 'Во. Отлично.',
  pulled2: 'Ещё один.',
  pulled3: 'Всё, хватит… вроде пролезу.',
  pushing: 'Ладно, сам вытолкну. Отойди-ка.',
  stuck: 'Так… застрял. Без паники.',
  fixit: 'М-да, дыра знатная. Давай заделаем, пока никто не зашёл. Наведи на меня руку, зажми пальцы и скажи: почини.',
  sayFix: 'Зажми пальцы и скажи: почини.',
  free: 'Фух. Вылез. Спасибо.',
  planets: 'Может, Солнечную систему? Маленькую, прямо тут.',
  tryBlaster: 'Теперь ты! Наведи на меня, щипни и скажи: дай бластер, который ломает стены!',
  remind: 'Я слушаю. Наведи руку, зажми пальцы — и говори.',
  blasterReady: 'Держи. Жмёшь на курок — и ломаешь что хочешь.',
  suggestHoop: 'Хочешь баскетбольное кольцо прямо на стене? Только скажи.',
  suggestDna: 'Или… молекулу ДНК? Огромную. Только скажи.',
  sorry: 'Не расслышал. Ещё раз?',
  done: 'Готово. Смотри.',
  pointIt: 'Покажи рукой, куда поставить, и зажми пальцы.',
  gotIt: 'Понял, делаю там.',
  fixing: 'Так, что-то не то. Сейчас поправлю.',
  failed: 'Не вышло. Скажи как-нибудь по-другому.',
  busyWorking: 'Так, делаю…',
  busyTyping: 'Где я забыл точку с запятой… а, вот она.',
  busyBugs: 'Хм, не то… а, понял. Сейчас.',
  busyMagic: 'Секунду, сейчас соберётся. Если не взорвётся.',
  busyCompile: 'Так, это сюда… это туда…',
  busyAlmost: 'Почти. Пара строчек осталась.',
  busySoon: 'Сейчас… последний штрих.',
  saveOffer: 'Нравится? Скажи: «сохрани»! И я положу это на свой планшет.',
  laugh: '[laughing]',
  woohoo: 'Ура.',
  hmm: 'Хм…',
};

/** The language of the voice: ?lang=ru in the address gives Russian, anything else English. */
export const LANG: 'en' | 'ru' = typeof location !== 'undefined' && new URLSearchParams(location.search).get('lang') === 'ru' ? 'ru' : 'en';
/** A line's words in the voice's language. */
export const lineText = (line: IntroLine): string => (LANG === 'ru' ? INTRO_LINES_RU : INTRO_LINES)[line];

/** With Live (?voice=live) Punto hears all the time: no «зажми пальцы» to speak (16.11, the queue item 6). The
 *  lines that teach the pinch to talk say it without; the rest are as recorded. «Покажи рукой, куда поставить» stays:
 *  that pinch is for the place, not for talking. */
const LIVE_LINES: Partial<Record<IntroLine, [string, string]>> = {
  askMe: ['Just tell me what to make!', 'Просто скажи, что сделать.'],
  remind: ["I'm listening. Just say it!", 'Я слушаю. Просто говори.'],
  fixit: ['Uh... we kinda wrecked your wall. Let\'s fix it before anyone notices. Just say "fix it."', 'М-да, дыра знатная. Давай заделаем, пока никто не зашёл. Просто скажи: почини.'],
  sayFix: ['Just say "fix it."', 'Просто скажи: почини.'],
  tryBlaster: ['Now you try! Say: give me a blaster that breaks walls!', 'Теперь ты! Скажи: дай бластер, который ломает стены!'],
};
export const liveLineText = (line: IntroLine): string => {
  const live = LIVE_LINES[line];
  return live ? live[LANG === 'ru' ? 1 : 0] : lineText(line);
};
/** Where a line's recording is. */
export const voiceFile = (line: IntroLine): string => `./voice/${LANG === 'ru' ? 'ru/' : ''}${line}.wav`;
/** A short piece of text on screen in the voice's language. */
export const ui = (english: string, russian: string): string => (LANG === 'ru' ? russian : english);
