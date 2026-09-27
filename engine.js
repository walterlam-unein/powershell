/* PowerShell Lab — intérprete educativo. No ejecuta código ni comandos del sistema. */
(function (root) {
  'use strict';
  const HOME = 'C:\\Users\\Estudiante';
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = path => path.toLowerCase();
  const parentPath = path => path.lastIndexOf('\\') <= 2 ? 'C:\\' : path.slice(0, path.lastIndexOf('\\'));
  const filename = path => path === 'C:\\' ? 'C:' : path.slice(path.lastIndexOf('\\') + 1);
  function fail(message, title = 'Revisa la instrucción') { const e = new Error(message); e.title = title; throw e; }
  function createState() {
    const nodes = Object.create(null);
    ['C:\\', 'C:\\Users', HOME, HOME + '\\Documents', HOME + '\\Downloads', HOME + '\\Pictures'].forEach(path => {
      nodes[key(path)] = { path, name: filename(path), type: 'folder', content: '' };
    });
    return { cwd: HOME, nodes, variables: {}, pending: null };
  }
  function variable(state, name) {
    if (name.toLowerCase() === 'home') return HOME;
    return Object.prototype.hasOwnProperty.call(state.variables, name.toLowerCase()) ? state.variables[name.toLowerCase()] : '';
  }
  function interpolate(text, state) {
    return text.replace(/\$\{([a-z_]\w*)\}|\$([a-z_]\w*)/gi, (_, a, b) => String(variable(state, a || b)));
  }
  function tokenize(source) {
    const tokens = []; let i = 0;
    while (i < source.length) {
      if (/\s/.test(source[i])) { i++; continue; }
      const start = i; let quote = null, text = '';
      if (source[i] === '"' || source[i] === "'") {
        quote = source[i++]; let closed = false;
        while (i < source.length) {
          if (source[i] === quote) {
            if (quote === "'" && source[i + 1] === "'") { text += "'"; i += 2; continue; }
            i++; closed = true; break;
          }
          if (quote === '"' && source[i] === '`' && i + 1 < source.length) {
            i++; const ch = source[i++]; text += ch === 'n' ? '\n' : ch === 't' ? '\t' : ch === '$' ? '\u0000' : ch;
          } else text += source[i++];
        }
        if (!closed) fail('Falta cerrar una comilla. Abre y cierra el texto con el mismo tipo de comillas.', 'Instrucción incompleta');
        if (i < source.length && !/\s/.test(source[i])) fail('Separa las partes de la instrucción con espacios.');
      } else {
        while (i < source.length && !/\s/.test(source[i])) {
          if (source[i] === '"' || source[i] === "'") fail('Deja un espacio antes de abrir las comillas.');
          text += source[i++];
        }
      }
      tokens.push({ text, quote, raw: source.slice(start, i) });
    }
    return tokens;
  }
  function tokenValue(token, state) {
    if (token.quote === "'") return token.text;
    if (!token.quote && /^\$[a-z_]\w*$/i.test(token.text)) return variable(state, token.text.slice(1));
    return interpolate(token.text, state).replace(/\u0000/g, '$');
  }
  function resolvePath(value, state) {
    let path = String(value).replace(/\//g, '\\');
    if (!path.trim()) fail('Escribe el nombre de una carpeta o archivo después de -Path.');
    if (path === '~') path = HOME;
    if (path.startsWith('~\\')) path = HOME + path.slice(1);
    if (/^[a-z]:/i.test(path) && !/^c:/i.test(path)) fail('En este laboratorio está disponible la unidad C:.');
    if (/[*?]/.test(path)) fail('En esta práctica utiliza un nombre concreto, sin comodines.');
    if (/^c:$/i.test(path)) return 'C:\\';
    if (/^c:\\/i.test(path)) path = path.slice(3);
    else if (path.startsWith('\\')) path = path.slice(1);
    else path = state.cwd.slice(3) + '\\' + path;
    const parts = [];
    for (const part of path.split('\\')) {
      if (!part || part === '.') continue;
      if (part === '..') { parts.pop(); continue; }
      if (/[<>:"|]/.test(part)) fail('El nombre contiene un carácter que no se puede utilizar en una ruta de Windows.');
      parts.push(part);
    }
    const normalized = 'C:\\' + parts.join('\\');
    const existing = state.nodes[key(normalized)];
    if (existing) return existing.path;
    const parent = state.nodes[key(parentPath(normalized))];
    return parent ? parent.path.replace(/\\$/, '') + '\\' + filename(normalized) : normalized;
  }
  const nodeAt = (state, path) => state.nodes[key(path)];
  function children(state, path) {
    return Object.values(state.nodes).filter(n => n.path !== 'C:\\' && key(parentPath(n.path)) === key(path))
      .sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1);
  }
  function requireNode(state, path, type) {
    const node = nodeAt(state, path);
    if (!node) fail('No se encuentra ' + path + '. Comprueba la ubicación con Get-Location y los nombres con Get-ChildItem.', 'La ruta no existe');
    if (type && node.type !== type) fail(type === 'folder' ? 'Esa ruta corresponde a un archivo. Set-Location necesita una carpeta.' : 'Esa ruta es una carpeta. Indica un archivo de texto.');
    return node;
  }
  function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) { const old = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = old; }
    }
    return row[b.length];
  }
  function nearest(word, names) {
    const sorted = names.map(name => [name, distance(word.toLowerCase(), name.toLowerCase())]).sort((a, b) => a[1] - b[1]);
    return sorted.length && sorted[0][1] <= Math.max(2, Math.floor(word.length / 4)) ? sorted[0][0] : null;
  }
  function bind(tokens, state, allowed, positional) {
    const args = Object.create(null), rest = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.quote && /^-[a-z]/i.test(token.text)) {
        const name = token.text.slice(1).toLowerCase();
        if (!allowed.includes(name)) {
          const suggestion = nearest(name, allowed);
          fail('El parámetro ' + token.text + ' no está disponible en este comando.' + (suggestion ? ' ¿Querías escribir -' + suggestion + '?' : ' Usa ' + allowed.map(x => '-' + x).join(', ') + '.'), 'Parámetro incorrecto');
        }
        if (Object.prototype.hasOwnProperty.call(args, name)) fail('El parámetro ' + token.text + ' está repetido. Utilízalo una sola vez.');
        if (!tokens[i + 1] || (!tokens[i + 1].quote && /^-[a-z]/i.test(tokens[i + 1].text))) fail('Falta un valor después de ' + token.text + '.', 'Instrucción incompleta');
        args[name] = tokenValue(tokens[++i], state);
      } else rest.push(tokenValue(token, state));
    }
    for (const value of rest) {
      const slot = positional.find(name => !Object.prototype.hasOwnProperty.call(args, name));
      if (!slot) fail('Hay más valores de los que espera este comando. Si escribes una frase, ponla entre comillas.');
      args[slot] = value;
    }
    return args;
  }
  function required(args, name) {
    if (!Object.prototype.hasOwnProperty.call(args, name)) fail('Falta indicar -' + name + ' y su valor.', 'Instrucción incompleta');
    return args[name];
  }
  function math(source, state) {
    const raw = source.replace(/\$([a-z_]\w*)/gi, (_, name) => {
      const value = variable(state, name);
      if (value === '' || !Number.isFinite(Number(value))) fail('$' + name + ' necesita un valor numérico para esta operación.');
      return '(' + Number(value) + ')';
    });
    if (!/^[\d.\s+*/()\-]+$/.test(raw)) fail('Utiliza números, paréntesis y los operadores +, -, * o /.');
    const tokens = raw.match(/\d+(?:\.\d*)?|\.\d+|[()+*/-]/g) || []; let i = 0;
    function primary() {
      if (tokens[i] === '+') { i++; return primary(); }
      if (tokens[i] === '-') { i++; return -primary(); }
      if (tokens[i] === '(') { i++; const n = sum(); if (tokens[i++] !== ')') fail('Falta cerrar un paréntesis.'); return n; }
      const t = tokens[i++]; if (t === undefined || !/^(\d|\.)/.test(t) || !Number.isFinite(Number(t))) fail('Falta un número en la operación.');
      return Number(t);
    }
    function product() { let n = primary(); while (tokens[i] === '*' || tokens[i] === '/') { const op = tokens[i++], b = primary(); if (op === '/' && b === 0) fail('No se puede dividir entre cero. Cambia el divisor.', 'División entre cero'); n = op === '*' ? n * b : n / b; } return n; }
    function sum() { let n = product(); while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++], b = product(); n = op === '+' ? n + b : n - b; } return n; }
    const value = sum(); if (i !== tokens.length || !Number.isFinite(value)) fail('Revisa los números, los operadores y los paréntesis.'); return value;
  }
  function response(state, command, output, explanation, event = {}, extra = {}) {
    return { ok: true, state, command, output, explanation, title: 'Comando ejecutado', event: { command, ...event }, highlights: [], ...extra };
  }
  const docs = {
    'write-output': { name: 'Write-Output', summary: 'Envía información a la salida de la terminal.', syntax: 'Write-Output "Hola mundo"' },
    'read-host': { name: 'Read-Host', summary: 'Pide un dato y espera una respuesta del teclado.', syntax: '$nombre = Read-Host "¿Cómo te llamas?"' },
    'get-location': { name: 'Get-Location', summary: 'Muestra la carpeta de trabajo actual.', syntax: 'Get-Location' },
    'get-childitem': { name: 'Get-ChildItem', summary: 'Lista los archivos y carpetas de una ubicación.', syntax: 'Get-ChildItem' },
    'set-location': { name: 'Set-Location', summary: 'Cambia la carpeta de trabajo de la terminal.', syntax: 'Set-Location $HOME' },
    'new-item': { name: 'New-Item', summary: 'Crea una carpeta o un archivo.', syntax: 'New-Item MiProyecto -ItemType Directory' },
    'set-content': { name: 'Set-Content', summary: 'Escribe texto y reemplaza el contenido anterior.', syntax: 'Set-Content ficha.txt "Hola"' },
    'get-content': { name: 'Get-Content', summary: 'Lee el contenido de un archivo.', syntax: 'Get-Content ficha.txt' }
  };
  const commands = {
    'write-output': (tokens, state) => {
      const args = bind(tokens, state, ['inputobject'], ['inputobject']);
      const value = required(args, 'inputobject');
      const references = tokens.filter(t => t.quote !== "'").flatMap(t => Array.from(t.text.matchAll(/\$\{?([a-z_]\w*)\}?/gi), m => m[1].toLowerCase()));
      return response(state, 'write-output', [String(value)], 'Write-Output envía el valor a la salida. Aquí lo ves en la terminal; no se guarda en un archivo.', { kind: 'output', value, references }, { value });
    },
    'get-location': (tokens, state) => {
      bind(tokens, state, [], []);
      return response(state, 'get-location', ['Path\n----\n' + state.cwd], 'Esta es tu carpeta de trabajo. Los nombres de archivo sin una ruta completa se buscarán aquí.', { kind: 'location', path: state.cwd }, { value: state.cwd, highlights: [state.cwd] });
    },
    'get-childitem': (tokens, state) => {
      const args = bind(tokens, state, ['path'], ['path']), path = resolvePath(args.path === undefined ? '.' : args.path, state);
      const node = requireNode(state, path), items = node.type === 'folder' ? children(state, path) : [node];
      const lines = items.map(n => (n.type === 'folder' ? 'd-----  ' : '-a----  ') + (n.type === 'folder' ? '' : String(new TextEncoder().encode(n.content).length)).padStart(7) + '  ' + n.name);
      return response(state, 'get-childitem', items.length ? ['    Directory: ' + (node.type === 'folder' ? path : parentPath(path)) + '\n\nMode     Length  Name\n----     ------  ----\n' + lines.join('\n')] : [], items.length ? 'Se listaron ' + items.length + ' elementos. Los mismos nombres se resaltan en el explorador.' : 'Esta carpeta está vacía. Que no aparezca una lista es normal.', { kind: 'list', path, count: items.length }, { highlights: items.map(n => n.path), browse: node.type === 'folder' ? path : parentPath(path) });
    },
    'set-location': (tokens, state) => {
      const args = bind(tokens, state, ['path'], ['path']), path = resolvePath(required(args, 'path'), state);
      const node = requireNode(state, path, 'folder'); state.cwd = node.path;
      return response(state, 'set-location', [], 'La terminal ahora trabaja en ' + node.path + '. Cambió el prompt y el explorador seleccionó esa carpeta.', { kind: 'navigate', path: node.path }, { highlights: [node.path], browse: node.path });
    },
    'new-item': (tokens, state) => {
      const args = bind(tokens, state, ['path', 'itemtype', 'value'], ['path']), path = resolvePath(required(args, 'path'), state);
      const type = String(required(args, 'itemtype')).toLowerCase();
      if (!['directory', 'file'].includes(type)) fail('-ItemType debe ser Directory para una carpeta o File para un archivo.', 'Tipo de elemento incorrecto');
      if (nodeAt(state, path)) fail(filename(path) + ' ya existe. No necesitas crearlo otra vez. Puedes entrar en la carpeta o restaurar este paso.', 'El elemento ya existe');
      requireNode(state, parentPath(path), 'folder');
      const node = { path, name: filename(path), type: type === 'directory' ? 'folder' : 'file', content: type === 'file' ? String(args.value === undefined ? '' : args.value) : '' };
      state.nodes[key(path)] = node;
      return response(state, 'new-item', ['    Directory: ' + parentPath(path) + '\n\nMode    Name\n----    ----\n' + (node.type === 'folder' ? 'd-----  ' : '-a----  ') + node.name], 'New-Item creó ' + (node.type === 'folder' ? 'la carpeta ' : 'el archivo ') + node.name + '. -ItemType ' + (node.type === 'folder' ? 'Directory' : 'File') + ' indica el tipo de elemento. Observa el nuevo elemento en el explorador.', { kind: 'create', path, type: node.type }, { highlights: [path], browse: parentPath(path), preview: node.type === 'file' ? path : null });
    },
    'set-content': (tokens, state) => {
      const args = bind(tokens, state, ['path', 'value'], ['path', 'value']), path = resolvePath(required(args, 'path'), state), value = String(required(args, 'value'));
      requireNode(state, parentPath(path), 'folder'); const existing = nodeAt(state, path);
      if (existing && existing.type === 'folder') fail('La ruta corresponde a una carpeta. Indica un archivo, por ejemplo ficha.txt.');
      state.nodes[key(path)] = { path, name: filename(path), type: 'file', content: value };
      return response(state, 'set-content', [], (existing ? 'Se reemplazó el contenido de ' : 'Se creó y escribió ') + filename(path) + '. Set-Content no añade texto al final: guarda el nuevo contenido completo. Puedes verlo en la vista previa.', { kind: 'write', path, value }, { highlights: [path], browse: parentPath(path), preview: path });
    },
    'get-content': (tokens, state) => {
      const args = bind(tokens, state, ['path'], ['path']), path = resolvePath(required(args, 'path'), state), node = requireNode(state, path, 'file');
      return response(state, 'get-content', node.content ? [node.content] : [], node.content ? 'Get-Content leyó ' + node.name + '. La terminal y la vista previa muestran el mismo texto. El archivo no se modificó.' : node.name + ' está vacío. Utiliza Set-Content para escribir dentro.', { kind: 'read', path, value: node.content }, { value: node.content, highlights: [path], browse: parentPath(path), preview: path });
    },
    'read-host': (tokens, state) => {
      const args = bind(tokens, state, ['prompt'], ['prompt']); state.pending = { prompt: args.prompt === undefined ? 'Escribe una respuesta' : String(args.prompt), variable: null };
      return response(state, 'read-host', [], 'Read-Host espera tu respuesta. Escribe el dato, sin comillas, y presiona Enter.', { kind: 'waiting' }, { title: 'Esperando tu respuesta', pending: true });
    }
  };
  function help(tokens, state, context) {
    const learned = context.learned || Object.keys(docs);
    const target = tokens[0] ? String(tokenValue(tokens[0], state)).toLowerCase() : '';
    if (target && (!docs[target] || !learned.includes(target))) fail('La ayuda muestra los comandos presentados hasta esta misión. Escribe help para verlos.', 'Ayuda de esta práctica');
    const output = target ? [docs[target].name + '\n' + docs[target].summary + '\n\nEjemplo:\n' + docs[target].syntax] : ['Comandos presentados\n\n' + learned.filter(n => docs[n]).map(n => docs[n].name.padEnd(17) + docs[n].summary).join('\n')];
    return response(state, 'help', output, 'Puedes consultar esta ayuda cuando lo necesites. No cambia tu progreso.', { kind: 'help' });
  }
  function evaluate(source, state, context) {
    const tokens = tokenize(source);
    if (!tokens.length) fail('Escribe una instrucción antes de presionar Enter.');
    const name = tokens[0].text.toLowerCase();
    if (commands[name]) return commands[name](tokens.slice(1), state, context);
    if (name === 'help' || name === 'get-help') return help(tokens.slice(1), state, context);
    if (tokens.length === 1 && (tokens[0].quote || /^\$[a-z_]\w*$/i.test(tokens[0].text))) {
      const value = tokenValue(tokens[0], state);
      return response(state, 'expression', [String(value)], 'La expresión devuelve su valor en la terminal.', { kind: 'expression', value }, { value });
    }
    if (/^[\d.(+\-]/.test(source) || /^\$[a-z_]\w*\s*[+*/-]/i.test(source)) {
      const value = math(source, state);
      return response(state, 'math', [String(value)], 'El resultado es ' + value + '. PowerShell puede evaluar expresiones matemáticas. Los paréntesis se resuelven primero; después, multiplicación y división.', { kind: 'math', value, operators: source.match(/[+*/-]/g) || [] }, { value });
    }
    const suggestion = nearest(name, Object.keys(docs));
    fail(suggestion ? 'Parece que querías escribir ' + docs[suggestion].name + '. Revisa las letras y el guion del nombre.' : 'No se reconoce ' + tokens[0].text + '. Escribe help para consultar los comandos de esta práctica.', suggestion ? 'Posible error de escritura' : 'Comando no disponible');
  }
  function execute(source, original, context = {}) {
    const state = clone(original);
    try {
      source = String(source).trim();
      if (source.length > 2000) fail('La instrucción es demasiado larga. Utiliza hasta 2000 caracteres.');
      if (state.pending) return answer(source, state);
      if (/^PS\s+[a-z]:/i.test(source)) fail('Escribe solo el comando. PS, la ruta y > ya forman parte de la terminal.');
      const assignment = source.match(/^\$([a-z_]\w*)\s*=\s*([\s\S]*)$/i);
      if (assignment) {
        const name = assignment[1].toLowerCase();
        if (['home', 'host', 'pwd', 'env', 'null', 'true', 'false'].includes(name)) fail('Utiliza un nombre propio para tu variable, como $nombre o $curso. $' + assignment[1] + ' está reservado en este laboratorio.');
        if (!assignment[2].trim()) fail('Falta el valor después de =.', 'Instrucción incompleta');
        const r = evaluate(assignment[2], state, context);
        if (r.pending) { r.state.pending.variable = name; r.event.variable = name; return r; }
        if (r.value === undefined) fail('En esta práctica guarda textos, números o una respuesta de Read-Host en tus variables.');
        r.state.variables[name] = r.value;
        return response(r.state, 'assignment', [], '$' + name + ' ahora guarda ' + JSON.stringify(r.value) + '. Una asignación no necesita mostrar un resultado. Observa la variable en el panel derecho.', { kind: 'assign', variable: name, value: r.value });
      }
      return evaluate(source, state, context);
    } catch (error) {
      return { ok: false, state: original, output: [], title: error.title || 'Revisa la instrucción', explanation: error.message, event: { kind: 'error' }, highlights: [] };
    }
  }
  function answer(text, original) {
    const state = clone(original), pending = state.pending;
    if (!pending) return { ok: false, state: original, title: 'No hay una pregunta pendiente', explanation: 'Escribe primero Read-Host.', event: { kind: 'error' }, output: [], highlights: [] };
    if (pending.variable) state.variables[pending.variable] = text;
    state.pending = null;
    return response(state, 'read-host', pending.variable ? [] : [text], pending.variable ? 'Tu respuesta quedó guardada como texto en $' + pending.variable + '. Ya puedes usarla en un mensaje o un archivo.' : 'Read-Host recibió tu respuesta y la devolvió a la terminal.', { kind: 'input', variable: pending.variable, value: text });
  }
  function validate(check, r) {
    if (!r.ok || !check) return false;
    const event = r.event;
    if (check.command && event.command !== check.command) return false;
    if (check.kind && event.kind !== check.kind) return false;
    if (check.path && key(event.path || '') !== key(check.path.replace('$HOME', HOME))) return false;
    if (check.type && event.type !== check.type) return false;
    if (check.operator && !event.operators?.includes(check.operator)) return false;
    if (check.reference && !event.references?.includes(check.reference)) return false;
    if (check.variable && event.variable !== check.variable.toLowerCase()) return false;
    if (check.value !== undefined && event.value !== check.value) return false;
    if (check.nonempty && !String(event.value || '').trim()) return false;
    if (check.template !== undefined && String(event.value) !== interpolate(check.template, r.state)) return false;
    if (check.contentVariable && String(event.value).trim().toLowerCase() !== String(variable(r.state, check.contentVariable)).trim().toLowerCase()) return false;
    return true;
  }
  const api = { HOME, createState, execute, answer, validate, resolvePath, parentPath, filename, children, nodeAt, clone, docs, commands, variable };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PSLabEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
