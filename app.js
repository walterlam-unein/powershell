(function () {
  'use strict';
  const h = React.createElement;
  const { useState, useRef, useEffect } = React;
  const E = window.PSLabEngine, lessons = window.PSLabLessons;
  const STORAGE = 'powershell-lab-v1:' + location.pathname.replace(/index\.html$/, '');
  const TOTAL = lessons.reduce((n, lesson) => n + lesson.steps.length, 0);
  const glyphs = {
    terminal: ['m5 6 6 6-6 6', 'M13 18h6'], folder: ['M3 7V5h6l2 2h10v13H3z'], file: ['M6 3h8l4 4v14H6z', 'M14 3v5h5', 'M9 12h6M9 16h6'],
    arrow: ['M5 12h14m-5-5 5 5-5 5'], check: ['m5 12 4 4L19 6'], close: ['m6 6 12 12M18 6 6 18'],
    reset: ['M3 10a9 9 0 1 1 1 8', 'M3 4v6h6'], book: ['M4 3h13a3 3 0 0 1 3 3v15H6a2 2 0 0 1-2-2z', 'M4 17h16', 'M8 7h7M8 10h5'],
    chevron: ['m9 5 7 7-7 7'], up: ['m5 14 7-7 7 7'], help: ['M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 3', 'M12 17h.01'],
    computer: ['M3 4h18v13H3z', 'M8 21h8M12 17v4'], save: ['M5 3h12l3 3v15H4V3z', 'M8 3v6h8V3M8 21v-8h8v8'], variable: ['M9 4H6v16h3M15 4h3v16h-3'],
    info: ['M12 11v6M12 7h.01'], list: ['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01']
  };
  function Icon({ name, size = 20, ...props }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, ...props },
      (glyphs[name] || glyphs.info).map((d, i) => h('path', { d, key: i })));
  }
  function Button({ children, icon, className = '', ...props }) {
    return h('button', { type: 'button', className: 'button ' + className, ...props }, icon && h(Icon, { name: icon, size: 17 }), children);
  }
  function fresh() {
    const engine = E.createState();
    return { version: 1, engine, checkpoint: E.clone(engine), mission: 0, step: 0, stepDone: false, completed: [], entries: [], history: [], feedback: null, hints: 0, finished: false, started: false, practiceSnapshot: null };
  }
  function loadSaved() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE));
      if (!data || data.version !== 1 || !Number.isInteger(data.mission) || !lessons[data.mission] || !lessons[data.mission].steps[data.step] || !data.engine?.nodes?.[E.HOME.toLowerCase()] || !data.checkpoint || !Array.isArray(data.entries) || !Array.isArray(data.history) || !Array.isArray(data.completed)) return null;
      data.entries = data.entries.slice(-160); data.history = data.history.slice(-100);
      return data;
    } catch (_) { return null; }
  }
  function Dialog({ open, title, children, onClose, wide = false }) {
    const ref = useRef(null);
    useEffect(() => {
      const dialog = ref.current;
      if (open && !dialog.open) dialog.showModal();
      if (!open && dialog.open) dialog.close();
    }, [open]);
    return h('dialog', { ref, className: 'dialog' + (wide ? ' wide' : ''), onCancel: e => { e.preventDefault(); onClose(); }, 'aria-labelledby': 'dialog-title' },
      h('div', { className: 'dialog-heading' }, h('h2', { id: 'dialog-title' }, title), h(Button, { icon: 'close', className: 'icon-button', 'aria-label': 'Cerrar ventana', onClick: onClose })), children);
  }
  function App() {
    const initial = useRef(undefined);
    if (initial.current === undefined) initial.current = loadSaved();
    const [state, setState] = useState(() => initial.current || fresh());
    const [modal, setModal] = useState(initial.current?.started ? 'resume' : null);
    const [input, setInput] = useState('');
    const [storageOK, setStorageOK] = useState(true);
    const [mobileExplorer, setMobileExplorer] = useState(false);
    const [selected, setSelected] = useState(state.engine.cwd);
    const [preview, setPreview] = useState(null);
    const [highlights, setHighlights] = useState([]);
    const [expanded, setExpanded] = useState(() => new Set(['c:\\', 'c:\\users', E.HOME.toLowerCase(), state.engine.cwd.toLowerCase()]));
    const inputRef = useRef(null), terminalRef = useRef(null), historyCursor = useRef(null), draft = useRef(''), glowTimeout = useRef(null);
    const stateRef = useRef(state); stateRef.current = state;
    const mission = lessons[state.mission], step = mission.steps[state.step];
    const completedSteps = lessons.slice(0, state.mission).reduce((n, m) => n + m.steps.length, 0) + state.step + (state.stepDone ? 1 : 0);
    const percent = state.finished ? 100 : Math.round(completedSteps / TOTAL * 100);
    const learned = Array.from(new Set(lessons.slice(0, state.mission + 1).flatMap(m => m.introduces)));
    useEffect(() => {
      if (modal === 'resume') return;
      try { localStorage.setItem(STORAGE, JSON.stringify(state)); setStorageOK(true); }
      catch (_) { setStorageOK(false); }
    }, [state, modal]);
    useEffect(() => {
      if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }, [state.entries, state.engine.pending]);
    useEffect(() => { if (!modal && !mobileExplorer) inputRef.current?.focus({ preventScroll: true }); }, [modal, state.mission, state.step, mobileExplorer]);
    useEffect(() => () => clearTimeout(glowTimeout.current), []);
    useEffect(() => {
      if (!document.modelContext?.registerTool) return;
      const lifecycle = new AbortController();
      try {
        Promise.resolve(document.modelContext.registerTool({
          name: 'get_powershell_lab_state', title: 'Consultar la práctica de PowerShell',
          description: 'Consulta la misión, el objetivo y el estado virtual de la práctica visible. No ejecuta instrucciones ni cambia el progreso.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input) {
            if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Se espera un objeto vacío.');
            const s = stateRef.current, m = lessons[s.mission];
            return { mission: s.mission + 1, step: s.step + 1, goal: m.steps[s.step].goal, stepCompleted: s.stepDone, finished: s.finished, cwd: s.engine.cwd, awaitingResponse: !!s.engine.pending, variables: E.clone(s.engine.variables), files: E.children(s.engine, s.engine.cwd).map(n => ({ name: n.name, type: n.type })) };
          }
        }, { signal: lifecycle.signal })).catch(() => {});
      } catch (_) {}
      return () => lifecycle.abort();
    }, []);
    function expandTo(path) {
      setExpanded(prev => {
        const next = new Set(prev); let p = path;
        for (let i = 0; i < 25; i++) { next.add(p.toLowerCase()); if (p === 'C:\\') break; p = E.parentPath(p); }
        return next;
      });
    }
    function showResult(r) {
      if (r.browse) { setSelected(r.browse); expandTo(r.browse); }
      if (r.preview) { setPreview(r.preview); setSelected(r.preview); expandTo(E.parentPath(r.preview)); }
      else if (r.event.kind === 'navigate') setPreview(null);
      if (r.highlights?.length) {
        setHighlights(r.highlights.map(x => x.toLowerCase())); r.highlights.forEach(expandTo);
        clearTimeout(glowTimeout.current); glowTimeout.current = setTimeout(() => setHighlights([]), 1500);
      }
    }
    function submit(e) {
      e?.preventDefault();
      if (!input.trim() && !state.engine.pending) return;
      const pending = state.engine.pending;
      const r = pending ? E.answer(input, state.engine) : E.execute(input, state.engine, { learned });
      const passed = !state.finished && E.validate(step.check, r);
      const isHelp = r.event.kind === 'help';
      let tone = r.ok ? 'info' : 'error', title = r.title, explanation = r.explanation;
      if (passed) { tone = 'success'; title = 'Objetivo cumplido'; }
      else if (r.ok && !r.pending && !isHelp && !state.stepDone && !state.finished) {
        tone = 'notice'; title = 'La instrucción funciona';
        explanation += ' Para completar este paso todavía necesitas ' + step.goal + '.';
      }
      const feedback = { tone, title, explanation };
      const entry = { input, prompt: pending ? pending.prompt + ': ' : 'PS ' + state.engine.cwd + '> ', output: r.output, error: !r.ok, feedback, isAnswer: !!pending };
      setState(prev => ({ ...prev, engine: r.state, started: true, entries: [...prev.entries, entry].slice(-160), history: pending ? prev.history : [...prev.history, input].slice(-100), feedback,
        stepDone: prev.stepDone || passed, completed: passed && prev.step === mission.steps.length - 1 ? Array.from(new Set([...prev.completed, prev.mission])) : prev.completed }));
      setInput(''); historyCursor.current = null; draft.current = ''; showResult(r);
      inputRef.current?.focus();
    }
    function keyDown(e) {
      if (state.engine.pending) return;
      if (e.key === 'ArrowUp' && state.history.length) {
        e.preventDefault();
        if (historyCursor.current === null) { draft.current = input; historyCursor.current = state.history.length - 1; }
        else historyCursor.current = Math.max(0, historyCursor.current - 1);
        setInput(state.history[historyCursor.current]);
      }
      if (e.key === 'ArrowDown' && historyCursor.current !== null) {
        e.preventDefault(); historyCursor.current++;
        if (historyCursor.current >= state.history.length) { historyCursor.current = null; setInput(draft.current); }
        else setInput(state.history[historyCursor.current]);
      }
    }
    function advance() {
      if (!state.stepDone) return;
      if (state.mission === lessons.length - 1 && state.step === mission.steps.length - 1) { setState(prev => ({ ...prev, finished: true })); setModal('complete'); return; }
      let mi = state.mission, si = state.step + 1, engine = E.clone(state.engine), snapshot = state.practiceSnapshot, entries = state.entries;
      engine.pending = null;
      if (si >= mission.steps.length) { mi++; si = 0; }
      if (lessons[mi].challenge && !mission.challenge) {
        snapshot = E.clone(engine); engine = E.createState(); engine.variables = E.clone(snapshot.variables); engine.cwd = E.HOME + '\\Documents';
        entries = [...entries, { system: 'Reto final · Se abrió un espacio nuevo de archivos. Tus variables siguen disponibles.' }];
        setPreview(null); setSelected(engine.cwd); expandTo(engine.cwd);
      }
      setState(prev => ({ ...prev, mission: mi, step: si, engine, checkpoint: E.clone(engine), entries, practiceSnapshot: snapshot, stepDone: false, feedback: null, hints: 0 }));
      setInput(''); historyCursor.current = null;
    }
    function resetLab() {
      setState(fresh()); setModal(null); setInput(''); setPreview(null); setSelected(E.HOME); setHighlights([]); setMobileExplorer(false); historyCursor.current = null;
      setExpanded(new Set(['c:\\', 'c:\\users', E.HOME.toLowerCase()]));
    }
    function restoreStep() {
      const engine = E.clone(state.checkpoint);
      setState(prev => ({ ...prev, engine, stepDone: false, feedback: null, hints: 0, completed: prev.completed.filter(n => n !== prev.mission), entries: [...prev.entries, { system: 'Se restauró el inicio de este paso. Puedes intentarlo otra vez.' }] }));
      setPreview(null); setSelected(engine.cwd); expandTo(engine.cwd); setInput(''); setModal(null);
    }
    function chooseNode(node) {
      setSelected(node.path);
      if (node.type === 'file') setPreview(node.path);
      else { setPreview(null); setExpanded(prev => { const next = new Set(prev); next.has(node.path.toLowerCase()) ? next.delete(node.path.toLowerCase()) : next.add(node.path.toLowerCase()); return next; }); }
    }
    function TreeNode({ node, depth = 0 }) {
      const isExpanded = expanded.has(node.path.toLowerCase()), isCurrent = node.path.toLowerCase() === state.engine.cwd.toLowerCase();
      return h('div', { className: 'tree-node', key: node.path },
        h('button', { type: 'button', className: 'tree-row' + (selected.toLowerCase() === node.path.toLowerCase() ? ' selected' : '') + (highlights.includes(node.path.toLowerCase()) ? ' highlighted' : ''), style: { paddingLeft: 13 + depth * 18 }, onClick: () => chooseNode(node), 'aria-expanded': node.type === 'folder' ? isExpanded : undefined, title: node.path, 'data-path': node.path },
          h('span', { className: 'tree-chevron' + (isExpanded ? ' expanded' : '') }, node.type === 'folder' && h(Icon, { name: 'chevron', size: 12 })),
          h(Icon, { name: node.path === 'C:\\' ? 'computer' : node.type === 'folder' ? 'folder' : 'file', size: 19, className: 'node-icon ' + node.type }),
          h('span', { className: 'node-name' }, node.path === 'C:\\' ? 'Disco local (C:)' : node.name),
          isCurrent && h('span', { className: 'current-tag', title: 'Carpeta de trabajo de la terminal' }, 'PS')),
        node.type === 'folder' && isExpanded && E.children(state.engine, node.path).map(child => TreeNode({ node: child, depth: depth + 1 })));
    }
    const previewNode = preview && E.nodeAt(state.engine, preview);
    function closeModal() { setModal(null); }
    const helpBody = h('div', { className: 'help-content' },
      h('p', { className: 'muted' }, 'Comandos presentados hasta esta misión. También puedes escribir help en la terminal.'),
      learned.filter(n => E.docs[n]).map(n => h('section', { className: 'help-item', key: n }, h('h3', null, E.docs[n].name), h('p', null, E.docs[n].summary), h('code', null, E.docs[n].syntax))),
      h('p', { className: 'small muted' }, 'También se admiten parámetros explícitos, como -Path, -Value y -Prompt, y nombres de comandos sin distinguir mayúsculas. Las operaciones y las variables forman parte del lenguaje.'));
    return h('div', { className: 'app-shell' },
      h('header', { className: 'app-header' },
        h('div', { className: 'brand' }, h('span', { className: 'brand-mark' }, h(Icon, { name: 'terminal', size: 24 })), h('div', null, h('h1', null, 'PowerShell ', h('span', null, 'Lab')), h('p', null, 'Laboratorio de programación'))),
        h('button', { className: 'header-progress', type: 'button', onClick: () => setModal('missions'), 'aria-label': 'Ver misiones y progreso' },
          h('span', { className: 'progress-caption' }, h('span', null, 'PowerShell básico'), h('strong', null, percent + '%')),
          h('span', { className: 'progress-track', role: 'progressbar', 'aria-label': 'Progreso de la práctica', 'aria-valuenow': percent, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: { width: percent + '%' } }))),
        h('nav', { className: 'header-actions', 'aria-label': 'Controles del laboratorio' },
          h(Button, { icon: 'folder', className: 'mobile-files', onClick: () => setMobileExplorer(!mobileExplorer), 'aria-expanded': mobileExplorer }, 'Archivos'),
          h(Button, { icon: 'book', onClick: () => setModal('help') }, h('span', { className: 'button-label' }, 'Comandos')),
          h(Button, { icon: 'reset', className: 'icon-button', onClick: () => setModal('reset'), 'aria-label': 'Reiniciar laboratorio', title: 'Reiniciar laboratorio' }))),
      !storageOK && h('div', { className: 'storage-warning', role: 'status' }, 'El navegador no permite guardar el progreso. Puedes practicar, pero mantén esta página abierta.'),
      h('main', { className: 'workspace' },
        h('section', { className: 'terminal-panel', 'aria-label': 'Terminal de PowerShell y misión actual' },
          h('div', { className: 'terminal-bar' }, h('span', { className: 'terminal-tab' }, h(Icon, { name: 'terminal', size: 18 }), 'Windows PowerShell'), h('span', { className: 'simulation-label' }, 'SIMULACIÓN EDUCATIVA')),
          h('section', { className: 'mission' + (state.finished ? ' free-mode' : ''), 'aria-label': 'Misión actual' },
            h('div', { className: 'mission-topline' }, h('span', { className: 'eyebrow' }, state.finished ? 'PRÁCTICA LIBRE' : 'MISIÓN ' + String(state.mission + 1).padStart(2, '0') + ' / 12'),
              h('span', { className: 'mission-topic' }, state.finished ? 'Los ocho comandos están disponibles' : mission.topic),
              !state.finished && h('span', { className: 'step-counter' }, 'Paso ' + (state.step + 1) + ' de ' + mission.steps.length)),
            h('h2', null, state.finished ? 'Sigue experimentando' : step.title),
            h('p', { className: 'mission-description' }, state.finished ? 'Crea más carpetas, prueba variables o consulta help. Tus archivos virtuales y tu progreso se guardan en este navegador.' : step.instruction),
            !state.finished && state.step === 0 && h('details', { className: 'concept' }, h('summary', null, h(Icon, { name: 'info', size: 14 }), 'Entender este paso'), h('p', null, mission.intro)),
            !state.finished && !mission.challenge && h('div', { className: 'command-example' }, h('span', null, 'Escribe'), h('code', null, step.example)),
            !state.finished && step.parts && h('div', { className: 'anatomy' }, step.parts.map(([text, meaning]) => h('span', { key: text }, h('code', null, text), h('small', null, meaning)))),
            !state.finished && mission.challenge && !state.stepDone && h('div', { className: 'hint-area' },
              h(Button, { className: 'text-button', icon: 'help', disabled: state.hints >= step.hints.length, onClick: () => setState(prev => ({ ...prev, hints: Math.min(prev.hints + 1, step.hints.length) })) }, state.hints ? 'Otra pista' : 'Necesito una pista'),
              state.hints > 0 && h('p', { className: state.hints === 3 ? 'hint code-hint' : 'hint', role: 'status' }, step.hints[state.hints - 1])),
            !state.finished && state.stepDone && h('div', { className: 'next-row' }, h('span', { className: 'passed-label' }, h(Icon, { name: 'check', size: 16 }), 'Paso completado'),
              h(Button, { className: 'primary next-button', onClick: advance, icon: 'arrow', 'data-testid': 'next' }, state.mission === 11 && state.step === mission.steps.length - 1 ? 'Finalizar práctica' : step.transition ? 'Iniciar reto final' : state.step === mission.steps.length - 1 ? 'Siguiente misión' : 'Siguiente paso')),
            !state.finished && state.stepDone && step.transition && h('p', { className: 'transition-note' }, step.transition)),
          h('div', { className: 'terminal-scroll', ref: terminalRef, role: 'log', 'aria-label': 'Historial de comandos', 'aria-live': 'polite', 'aria-relevant': 'additions' },
            h('div', { className: 'terminal-intro' }, h('span', null, 'Windows PowerShell'), h('p', null, 'Sesión de práctica · Solo archivos virtuales'), h('p', { className: 'terminal-tip' }, 'Escribe un comando y presiona Enter. ', h('span', null, '↑ ↓'), ' recupera tu historial.')),
            state.entries.map((entry, i) => entry.system ? h('div', { className: 'system-entry', key: i }, entry.system) : h('div', { className: 'terminal-entry', key: i },
              h('div', { className: 'history-command' }, h('span', { className: 'prompt' }, entry.prompt), h('span', null, entry.input)),
              entry.output?.map((line, j) => h('pre', { className: 'terminal-output', key: j }, line)),
              h('div', { className: 'inline-feedback ' + entry.feedback.tone }, h(Icon, { name: entry.error ? 'close' : entry.feedback.tone === 'success' ? 'check' : 'info', size: 16 }), h('div', null, h('strong', null, entry.feedback.title), h('p', null, entry.feedback.explanation)))))),
          h('form', { className: 'terminal-input-area' + (state.engine.pending ? ' awaiting' : ''), onSubmit: submit },
            state.engine.pending && h('span', { className: 'input-status' }, 'Read-Host está esperando tu respuesta'),
            h('div', { className: 'prompt-line' }, h('label', { htmlFor: 'command-input', className: 'prompt input-prompt' }, state.engine.pending ? state.engine.pending.prompt + ': ' : 'PS ' + state.engine.cwd + '>'),
              h('input', { id: 'command-input', 'data-testid': 'command-input', ref: inputRef, value: input, onChange: e => setInput(e.target.value), onKeyDown: keyDown, type: 'text', spellCheck: false, autoComplete: 'off', autoCapitalize: 'off', autoCorrect: 'off', maxLength: 2000, 'aria-label': state.engine.pending ? 'Tu respuesta a Read-Host' : 'Escribe un comando de PowerShell', placeholder: state.engine.pending ? 'Escribe tu respuesta…' : 'Escribe aquí…' }),
              h('button', { className: 'submit-command', type: 'submit', 'aria-label': state.engine.pending ? 'Enviar respuesta' : 'Ejecutar comando', title: 'Enter' }, h(Icon, { name: 'arrow', size: 19 }))))),
        h('aside', { className: 'explorer-panel' + (mobileExplorer ? ' mobile-open' : ''), 'aria-label': 'Explorador de archivos virtuales' },
          h('div', { className: 'explorer-header' }, h(Icon, { name: 'folder', size: 20 }), h('h2', null, 'Explorador de archivos'), h(Button, { className: 'icon-button mobile-files', icon: 'close', 'aria-label': 'Cerrar explorador', onClick: () => setMobileExplorer(false) })),
          h('div', { className: 'explorer-address' }, h('span', { className: 'small muted' }, 'Carpeta de la terminal'), h('code', { title: state.engine.cwd }, state.engine.cwd)),
          h('div', { className: 'file-tree', 'aria-label': 'Carpetas y archivos' }, TreeNode({ node: E.nodeAt(state.engine, 'C:\\') })),
          h('section', { className: 'preview-panel', 'aria-label': 'Vista previa del archivo' },
            h('div', { className: 'panel-section-label' }, h(Icon, { name: 'file', size: 16 }), h('span', null, 'VISTA PREVIA'), previewNode && h('span', { className: 'file-type' }, 'TXT')),
            previewNode ? h('div', { className: 'file-preview' }, h('h3', null, previewNode.name), h('pre', { 'data-testid': 'file-preview' }, previewNode.content || 'El archivo está vacío.'), h('span', { className: 'small muted' }, previewNode.content.length + ' caracteres')) : h('div', { className: 'empty-preview' }, h(Icon, { name: 'file', size: 31 }), h('p', null, 'Tu archivo, por dentro'), h('span', null, 'Selecciona un archivo de texto para leer su contenido.'))),
          h('section', { className: 'variables-panel', 'aria-label': 'Variables de la sesión' },
            h('div', { className: 'panel-section-label' }, h(Icon, { name: 'variable', size: 16 }), h('span', null, 'VARIABLES'), h('span', { className: 'count' }, Object.keys(state.engine.variables).length)),
            Object.keys(state.engine.variables).length ? h('dl', { className: 'variables' }, Object.entries(state.engine.variables).map(([name, value]) => h('div', { className: 'variable-row', key: name }, h('dt', null, '$' + name), h('dd', null, String(value) || 'Texto vacío')))) : h('p', { className: 'variables-empty' }, 'Las variables que crees aparecerán aquí.')))),
      h('footer', { className: 'app-footer' }, h('span', { className: 'save-status' }, h(Icon, { name: storageOK ? 'save' : 'info', size: 14 }), storageOK ? 'Progreso guardado en este navegador' : 'Sesión sin guardado'),
        h('span', { className: 'footer-help' }, 'Simulador · No modifica archivos de tu equipo'),
        !state.finished && h('button', { type: 'button', className: 'restore-button', onClick: () => setModal('restore') }, 'Restaurar paso')),
      h(Dialog, { open: !!modal, onClose: closeModal, wide: modal === 'missions', title: ({ resume: 'Tu práctica sigue aquí', reset: 'Reiniciar el laboratorio', restore: 'Restaurar este paso', help: 'Tu guía de comandos', missions: 'Recorrido de aprendizaje', complete: 'Práctica completada' })[modal] || '' },
        modal === 'resume' && h('div', null, h('p', null, 'Tienes una sesión guardada en la misión ' + (state.mission + 1) + ': ' + mission.topic + '. Tus archivos, variables e historial siguen disponibles.'), h('div', { className: 'dialog-actions' }, h(Button, { onClick: () => setModal('reset') }, 'Reiniciar laboratorio'), h(Button, { className: 'primary', icon: 'arrow', onClick: closeModal }, 'Continuar práctica'))),
        modal === 'reset' && h('div', null, h('p', null, 'Se eliminará el progreso de esta práctica, incluidos los archivos virtuales, variables e historial. Volverás a la primera misión.'), h('div', { className: 'dialog-actions' }, h(Button, { onClick: closeModal }, 'Cancelar'), h(Button, { className: 'danger', onClick: resetLab, 'data-testid': 'confirm-reset' }, 'Sí, reiniciar'))),
        modal === 'restore' && h('div', null, h('p', null, 'Los archivos y variables volverán al estado que tenían al comenzar este paso. Se conserva el avance de las misiones anteriores y el historial de intentos.'), h('div', { className: 'dialog-actions' }, h(Button, { onClick: closeModal }, 'Cancelar'), h(Button, { className: 'primary', onClick: restoreStep }, 'Restaurar paso'))),
        modal === 'help' && helpBody,
        modal === 'missions' && h('div', { className: 'mission-list' }, lessons.map((m, i) => h('div', { className: 'mission-list-item' + (i === state.mission ? ' active' : ''), key: m.id }, h('span', { className: 'mission-number' }, state.completed.includes(i) ? h(Icon, { name: 'check', size: 16 }) : String(i + 1).padStart(2, '0')), h('div', null, h('strong', null, m.topic), h('p', null, m.steps.length + (m.steps.length === 1 ? ' paso' : ' pasos') + (i === state.mission ? ' · En curso' : ''))), i === 11 && h('span', { className: 'challenge-label' }, 'Aplicación')))),
        modal === 'complete' && h('div', null, h('div', { className: 'completion-mark' }, h(Icon, { name: 'check', size: 26 })), h('p', null, 'Completaste las 12 misiones y creaste una ficha con tu nombre. Ya puedes ubicarte, gestionar archivos virtuales y usar variables.'), h('p', { className: 'muted' }, 'Antes de cerrar: explica qué diferencia hay entre Get-ChildItem y Get-Content. Puedes seguir usando la terminal para comprobarlo.'), h('div', { className: 'dialog-actions' }, h(Button, { className: 'primary', onClick: closeModal }, 'Seguir practicando')))));
  }
  ReactDOM.createRoot(document.getElementById('root')).render(h(App));
})();
