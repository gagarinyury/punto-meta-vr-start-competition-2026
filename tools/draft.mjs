// A draft of a game the coder is still writing: the part of the file that is already whole,
// turned into code the page can run to show the thing growing in the room (src/draft.ts, research/notes/STREAM.md).
//
// The TypeScript parser reads a file that stops mid-word. Of the body of feature(...) every
// statement but the last is whole (the last may have been cut where it still parses, like
// `new Mesh` or `x.position`), so the last one is left out until the body is closed.
//
// The draft starts by handing the page a getter for every variable the body declares
// (`import.meta.draft`): the page finds the things made so far by them, also when the draft
// throws half-way or waits for a model.
//
//   node tools/draft.mjs logs/made/<file>.ts [0.15,0.5,1]   — check the cuts of a kept file
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { compileGame } from './compile.mjs';

/**
 * The code inside the reply's ```ts fence as far as it has come, and whether the fence has closed.
 * Undefined before the code starts.
 */
export function codeOf(reply) {
  const open = reply.match(/```(?:ts|tsx|typescript)?[ \t]*\n/);
  let text;
  if (open) text = reply.slice(open.index + open[0].length);
  else if (/^\s*(?:import\b|\/\/|\/\*)/.test(reply)) text = reply; // no fence at all
  else return undefined;
  // the closing fence: on its own line, or (rarely) right after the last character of the code
  const close = text.search(/\n[ \t]*```/);
  if (close >= 0) return { text: text.slice(0, close + 1), closed: true };
  const glued = text.match(/```\s*$/);
  return glued ? { text: text.slice(0, glued.index), closed: true } : { text, closed: false };
}

const isFeatureCall = (statement) =>
  ts.isExpressionStatement(statement) &&
  ts.isCallExpression(statement.expression) &&
  ts.isIdentifier(statement.expression.expression) &&
  statement.expression.expression.text === 'feature';

// the names a statement declares at the body's own level: `const a = …, [b, c] = …, { d } = …`
function declared(statement, names) {
  if (!ts.isVariableStatement(statement)) return;
  const take = (name) => {
    if (ts.isIdentifier(name)) names.push(name.text);
    else for (const element of name.elements) if (!ts.isOmittedExpression(element)) take(element.name);
  };
  for (const declaration of statement.declarationList.declarations) take(declaration.name);
}

/**
 * The statement still being written, when it is a call that takes a function — `tabletop(world, …, (board) => {`,
 * where a game on a table builds everything (15.11: such games showed nothing till the end) — cut to that function's
 * finished statements and closed again; the variables made in it so far go to the page (`import.meta.draftInner`),
 * so a group being filled there shows on the draft's board. Undefined when the statement is not such a call.
 */
function opened(code, statement) {
  let call = ts.isExpressionStatement(statement) ? statement.expression
    : ts.isVariableStatement(statement) ? statement.declarationList.declarations[0]?.initializer : undefined;
  if (call && ts.isAwaitExpression(call)) call = call.expression;
  if (!call || !ts.isCallExpression(call)) return undefined;
  const fn = [...call.arguments].reverse().find((a) => (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) && a.body && ts.isBlock(a.body));
  if (!fn) return undefined;
  const inner = fn.body.statements;
  const done = inner.slice(0, -1); // the last one may be cut
  const names = [];
  for (const one of done) declared(one, names);
  const hand = names.length ? `\nimport.meta.draftInner?.({ ${[...new Set(names)].map((name) => `${name}: () => ${name}`).join(', ')} });` : '';
  const deeper = inner.length ? opened(code, inner[inner.length - 1]) : undefined; // a callback inside the callback
  return code.slice(statement.getFullStart(), fn.body.getStart() + 1) +
    done.map((one) => code.slice(one.getFullStart(), one.end)).join('') + hand + (deeper ?? '') + '\n});';
}

/**
 * The runnable draft of `code` (a feature file, maybe cut anywhere): { js, statements }, where
 * `statements` grows as the file does. Undefined while there is nothing to run yet.
 * `closed`: the file is known to be whole, so its last statement counts too.
 */
export function draftOf(code, closed = false) {
  const file = ts.createSourceFile('draft.ts', code, ts.ScriptTarget.Latest, true);
  const top = file.statements;
  const at = top.findIndex(isFeatureCall);
  if (at < 0) return undefined;
  const setup = top[at].expression.arguments[1];
  if (!setup || !(ts.isArrowFunction(setup) || ts.isFunctionExpression(setup)) || !setup.body || !ts.isBlock(setup.body)) return undefined;
  // something follows feature(...) at the file's level: its body is closed
  const whole = closed || at < top.length - 1;
  const body = whole ? [...setup.body.statements] : setup.body.statements.slice(0, -1);
  // the statement still being written, if it is a call with a function being filled (tabletop's board)
  const last = setup.body.statements[setup.body.statements.length - 1];
  const tail = !whole && last ? opened(code, last) ?? '' : '';
  if (!body.length && !tail) return undefined;
  const parameter = setup.parameters[0]?.name;
  const world = parameter && ts.isIdentifier(parameter) ? parameter.text : 'world';
  const names = [];
  for (const statement of body) declared(statement, names);
  const text = (statement) => code.slice(statement.getFullStart(), statement.end);
  const source =
    top.slice(0, at).map(text).join('') +
    `\nfeature(import.meta, async (${world}) => {\n` +
    `import.meta.draft?.({ ${[...new Set(names)].map((name) => `${name}: () => ${name}`).join(', ')} });` +
    body.map(text).join('') +
    tail +
    '\n});\n' +
    // helpers declared after feature(...) (functions are hoisted) come too; the last of them
    // may be cut until the file is closed
    top.slice(at + 1, closed ? undefined : -1).map(text).join('');
  try {
    return { js: compileGame(source), statements: at + body.length };
  } catch {
    return undefined; // the cut left something the compiler does not take: the next draft will do
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [path, cuts = '0.15,0.3,0.5,0.7,0.9,1'] = process.argv.slice(2);
  const full = readFileSync(path, 'utf8');
  for (const cut of cuts.split(',').map(Number)) {
    const started = performance.now();
    const draft = draftOf(full.slice(0, Math.floor(full.length * cut)), cut === 1);
    console.log(`${cut}: ${draft ? `${draft.statements} statements, ${draft.js.length} chars of js` : 'no draft'}, ${(performance.now() - started).toFixed(1)} ms`);
  }
}
