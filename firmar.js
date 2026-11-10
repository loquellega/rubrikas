/*
 * Rubrikas · página de firma
 * Parte de la colección Alchemy of Meaning (Alquimia del Significado).
 * © 2026 Héctor Cruz Juárez · https://hectorcruz.com.mx
 * Software libre bajo licencia GPL-3.0-or-later.
 */
import {$, $$, el, api, aviso, dialogo, acercaDe, abrirPDF, pintarPaginas, COLORES, LOGO, AJUSTE0, ajusteLimpio, colocarFirma} from './comun.js';
import {montarDocx, cajaCampo} from './docx.js';

const raiz = $('#raiz');
const T = location.hash.slice(1);
const F = {datos: null, firma: null, iniciales: null, metodo: {}, textos: {}, aj: {firma: {...AJUSTE0}, iniciales: {...AJUSTE0}}, activo: null};
const LS = 'rubrikas.';
const sinPdf = n => n.replace(/\.(pdf|docx)$/i, '');
const nombre1 = n => (n || '').split(' ')[0];
$('#logo').innerHTML = LOGO + '<span>Rubrikas</span>';
$('#logo').onclick = acercaDe;

const tarjetaFinal = (icono, titulo, ...cuerpo) => raiz.replaceChildren(el('div', {class: 'contenido'},
  el('div', {class: 'tarjeta final'}, el('div', {class: 'ok-circulo', style: icono === '✓' ? {} : {background: '#f2f1ec', color: '#6b6b66'}}, icono), el('h1', {}, titulo), ...cuerpo)));

async function iniciar() {
  if (!/^[a-f0-9]{40}$/.test(T)) return tarjetaFinal('?', 'El enlace está incompleto', el('p', {class: 'tenue'}, 'Abre el enlace completo que te enviaron. A veces se corta al copiarlo.'));
  try { F.datos = await api('f_sobre', {params: {t: T}}); }
  catch (e) { return tarjetaFinal('!', 'No se puede abrir', el('p', {class: 'tenue'}, e.status === 410 ? 'Quien te lo envió canceló esta solicitud.' : 'Este enlace ya no funciona. Pide uno nuevo a quien te lo envió.')); }
  const {sobre, yo, toca, firmantes, emisor} = F.datos;
  document.title = 'Firmar · ' + sobre.titulo;
  if (yo.estado === 'firmado') return verFirmado();
  if (yo.estado === 'rechazado') return tarjetaFinal('·', 'Avisamos que no vas a firmar', el('p', {class: 'tenue'}, `${emisor} ya lo sabe.` + (yo.rechazo?.motivo ? ` Tu comentario: «${yo.rechazo.motivo}».` : '')));
  if (sobre.estado === 'rechazado') return tarjetaFinal('·', 'Esta solicitud se detuvo', el('p', {class: 'tenue'}, `Otra persona no firmó. ${emisor} te dirá cómo seguir.`));
  if (!toca) {
    const mio = firmantes.find(x => x.id === yo.id).orden;
    const antes = firmantes.filter(f => f.orden < mio && f.estado !== 'firmado').map(f => f.nombre);
    return tarjetaFinal('⏳', 'Aún no es tu turno', el('p', {class: 'tenue'}, `Primero firma ${antes.join(' y ')}. Después podrás firmar con este mismo enlace` + (yo.correo ? ' y te avisaremos por correo.' : '.')));
  }
  verFirmar();
}

function verFirmado() {
  const {sobre, docs, emisor} = F.datos;
  tarjetaFinal('✓', '¡Listo, firmaste!',
    sobre.final
      ? el('div', {style: {display: 'grid', gap: '10px', justifyItems: 'center'}},
        el('p', {class: 'tenue'}, 'Ya firmaron todos. Guarda tu copia:'),
        ...docs.flatMap(d => d.tipo === 'docx'
          ? [el('a', {class: 'boton primario', href: `api.php?a=f_doc&t=${T}&d=${d.id}&final=1`}, '↓ ' + sinPdf(d.nombre) + ' (Word)'),
             el('a', {class: 'boton', href: `api.php?a=f_doc&t=${T}&d=${d.id}&final=1&formato=pdf`}, '↓ ' + sinPdf(d.nombre) + ' (PDF)')]
          : [el('a', {class: 'boton primario', href: `api.php?a=f_doc&t=${T}&d=${d.id}&final=1`}, '↓ ' + sinPdf(d.nombre))]),
        el('p', {class: 'tenue chico'}, 'Cada documento lleva al final una hoja con el registro de las firmas.'))
      : el('p', {class: 'tenue'}, `Le avisamos a ${emisor}. Cuando firmen todos, podrás descargar tu copia desde este mismo enlace.`));
}

/* ───────── firmar ───────── */
const requerido = c => c.tipo === 'firma' || c.tipo === 'iniciales' || (c.tipo === 'texto' && c.requerido !== false);
const mios = () => F.datos.campos.filter(c => c.mio);
const pendientes = () => mios().filter(c => requerido(c) && !(c.tipo === 'texto' ? (F.textos[c.id] || '').trim() : F[c.tipo]));

async function verFirmar() {
  const {sobre, docs, campos, yo, firmantes, emisor} = F.datos;
  for (const t of ['firma', 'iniciales']) {
    const g = leer(t);
    if (g && mios().some(c => c.tipo === t)) { F[t] = g; F.metodo[t] = leerMetodo(t); F.aj[t] = leerAjuste(t); }
  }
  const cont = el('div', {class: 'paginas'});
  const progreso = el('span', {class: 'crece chico'});
  const boton = el('button', {class: 'primario grande', onclick: () => pendientes().length ? siguiente(true) : terminar()});
  raiz.replaceChildren(
    el('div', {class: 'contenido'},
      el('div', {class: 'tarjeta intro'},
        el('h1', {}, `Hola, ${nombre1(yo.nombre)}`),
        el('p', {}, `${emisor} te pidió firmar ${docs.length === 1 ? 'este documento' : 'estos documentos'}:`),
        el('div', {class: 'docs-lista'}, ...docs.map(d => el('div', {}, '📄', sinPdf(d.nombre)))),
        sobre.mensaje ? el('p', {class: 'mensaje'}, sobre.mensaje) : '',
        el('p', {class: 'tenue'}, 'Léelo con calma. Donde te toca firmar verás un recuadro verde: tócalo, haz tu firma y se pone sola en todos tus lugares.'),
        el('button', {class: 'enlace peligro', style: {justifySelf: 'start'}, onclick: rechazar}, 'No estoy de acuerdo, no voy a firmar')),
      cont),
    el('div', {class: 'barra'}, el('div', {}, progreso, boton)));
  F.actualizar = () => {
    const p = pendientes(), total = mios().filter(requerido).length;
    progreso.textContent = p.length ? `Te ${p.length === 1 ? 'falta 1 lugar' : `faltan ${p.length} lugares`} de ${total}` : '¡Todo listo!';
    progreso.className = 'crece chico ' + (p.length ? 'tenue' : 'verde');
    boton.textContent = p.length ? (p[0].tipo === 'texto' ? 'Llenar ↓' : 'Firmar aquí ↓') : 'Terminar y firmar';
  };

  const ancho = Math.min(860, innerWidth - 28);
  const cajas = {};
  for (const d of docs) {
    try {
      if (d.tipo === 'docx') {
        const r = await fetch(`api.php?a=f_doc&t=${T}&d=${d.id}`); if (!r.ok) throw new Error(r.status);
        cajas[d.id] = (await montarDocx(cont, await r.arrayBuffer(), d, ancho)).cajas;
      } else pintarPaginas(cont, await abrirPDF(`api.php?a=f_doc&t=${T}&d=${d.id}`), d, ancho);
    }
    catch (e) { cont.append(el('p', {class: 'rojo'}, sinPdf(d.nombre) + ': no se pudo abrir. Recarga la página.')); }
  }
  const tipoDoc = Object.fromEntries(docs.map(d => [d.id, d.tipo]));
  const colorDe = fid => COLORES[Math.max(0, firmantes.findIndex(f => f.id === fid)) % COLORES.length];
  for (const c of campos) {
    const word = tipoDoc[c.doc] === 'docx';
    const div = word ? $(`.docx-hoja[data-doc="${c.doc}"]`) : $(`.pagina[data-doc="${c.doc}"][data-p="${c.pagina}"]`); if (!div) continue;
    let st;
    if (word) { const cj = cajas[c.doc]?.[c.marca]; if (!cj) continue; const b = cajaCampo(cj, c.tipo); st = {left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px'}; }
    else st = {left: c.x * 100 + '%', top: c.y * 100 + '%', width: c.w * 100 + '%', height: c.h * 100 + '%'};
    if (!c.mio) {
      const f = firmantes.find(x => x.id === c.firmante);
      const hecho = f?.estado === 'firmado';
      const cd = el('div', {class: 'campo ajeno' + (hecho ? ' lleno' : ''), style: {...st, '--c': colorDe(c.firmante)}}, el('span', {class: 'et'}, nombre1(f?.nombre) + (hecho ? ' ✓' : '')));
      if (hecho) {
        const im = f.imagenes?.[c.tipo];
        if (im) requestAnimationFrame(() => colocarFirma(cd, `api.php?a=f_img&t=${T}&n=${encodeURIComponent(im.archivo)}`, f.ajustes?.[c.tipo] || {escala: 1, dx: 0, dy: 0}, 'firma de ' + f.nombre));
        const tx = c.tipo === 'fecha' ? f.fecha_texto : c.tipo === 'nombre' ? f.nombre : c.tipo === 'texto' ? f.textos?.[c.id] : '';
        if (tx) cd.append(el('span', {class: 'valor'}, tx));
      }
      div.append(cd);
      continue;
    }
    const cd = el('div', {class: 'campo mio', 'data-id': c.id, 'data-tipo': c.tipo, style: {...st, '--c': '#3d8b10'}});
    if (c.tipo === 'texto') cd.append(el('input', {placeholder: c.etiqueta || 'Escribe aquí', 'aria-label': c.etiqueta || 'texto', maxlength: 200, value: F.textos[c.id] || '',
      oninput: e => { F.textos[c.id] = e.target.value; pintarMios(); }}));
    else if (c.tipo === 'firma' || c.tipo === 'iniciales') gestos(cd, c.tipo);
    div.append(cd);
  }
  pintarMios();
}

function pintarMios() {
  const hoy = new Date().toLocaleDateString('es-MX', {day: '2-digit', month: '2-digit', year: 'numeric'});
  for (const cd of $$('.campo.mio')) {
    const t = cd.dataset.tipo;
    if (t === 'texto') { cd.classList.toggle('lleno', !!(F.textos[cd.dataset.id] || '').trim()); continue; }
    if (t === 'fecha' || t === 'nombre') { cd.replaceChildren(el('span', {class: 'valor'}, t === 'fecha' ? hoy : F.datos.yo.nombre)); cd.classList.add('lleno'); continue; }
    if (F[t]) { cd.querySelector('.pide')?.remove(); colocarFirma(cd, F[t], F.aj[t], t); }
    else cd.replaceChildren(el('span', {class: 'pide'}, t === 'firma' ? 'Firma aquí' : 'Iniciales'));
    cd.classList.toggle('lleno', !!F[t]);
  }
  F.actualizar?.();
}

function siguiente(abrirSiEsFirma = false) {
  const c = pendientes()[0]; if (!c) return;
  const cd = $(`.campo[data-id="${c.id}"]`);
  cd?.scrollIntoView({behavior: 'smooth', block: 'center'});
  if (c.tipo === 'texto') setTimeout(() => cd?.querySelector('input')?.focus(), 450);
  else if (abrirSiEsFirma && !F[c.tipo]) setTimeout(() => abrirFirma(c.tipo), 450);
}

/* ───────── hacer la firma ───────── */
function leer(t) { try { return localStorage.getItem(LS + t) || null; } catch { return null; } }
function leerMetodo(t) { try { return localStorage.getItem(LS + t + '.metodo') || 'dibujada'; } catch { return 'dibujada'; } }
function leerAjuste(t) { try { return ajusteLimpio(JSON.parse(localStorage.getItem(LS + t + '.aj') || 'null') || AJUSTE0); } catch { return {...AJUSTE0}; } }
function recordar(t, url, metodo) { try { localStorage.setItem(LS + t, url); localStorage.setItem(LS + t + '.metodo', metodo); } catch {} }
function olvidar(t) { try { ['', '.metodo', '.aj'].forEach(k => localStorage.removeItem(LS + t + k)); } catch {} }
function recordarAjuste(t) { try { if (leer(t)) localStorage.setItem(LS + t + '.aj', JSON.stringify(F.aj[t])); } catch {} }

/* ───────── ajustar la firma ya puesta: arrastrar, pellizcar, rueda o botones ───────── */
function gestos(cd, tipo) {
  const ptrs = new Map(); let ini = null, movio = false;
  const aplicar = () => { F.aj[tipo] = ajusteLimpio(F.aj[tipo]); for (const x of $$(`.campo.mio[data-tipo="${tipo}"]`)) if (F[tipo]) colocarFirma(x, F[tipo], F.aj[tipo], tipo); };
  const foto = () => {
    const p = [...ptrs.values()];
    return {aj: {...F.aj[tipo]}, p: p.map(q => ({...q})), d: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0,
      cx: p.reduce((a, q) => a + q.x, 0) / p.length, cy: p.reduce((a, q) => a + q.y, 0) / p.length};
  };
  cd.addEventListener('pointerdown', e => {
    if (e.target.closest('.herr')) return;
    if (!F[tipo]) return;
    e.preventDefault();
    cd.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    ini = foto(); movio = false;
  });
  cd.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !ini) return;
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const p = [...ptrs.values()];
    const cx = p.reduce((a, q) => a + q.x, 0) / p.length, cy = p.reduce((a, q) => a + q.y, 0) / p.length;
    if (Math.abs(cx - ini.cx) + Math.abs(cy - ini.cy) > 4 || p.length > 1) movio = true;
    if (!movio) return;
    const a = F.aj[tipo];
    const rc = cd.getBoundingClientRect(); // tamaño en pantalla (el DOCX puede estar escalado)
    a.dx = ini.aj.dx + (cx - ini.cx) / rc.width;
    a.dy = ini.aj.dy + (cy - ini.cy) / rc.height;
    if (p.length > 1 && ini.d > 0) a.escala = ini.aj.escala * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / ini.d;
    aplicar();
  });
  const fin = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size) { ini = foto(); return; } // sigue un dedo: continúa moviendo desde aquí
    if (!movio && e.type === 'pointerup') abrirAjuste(cd, tipo, aplicar);
    else { recordarAjuste(tipo); if (F.activo !== cd) abrirAjuste(cd, tipo, aplicar); }
    ini = null;
  };
  cd.addEventListener('pointerup', fin); cd.addEventListener('pointercancel', fin);
  cd.addEventListener('click', () => { if (!F[tipo]) abrirFirma(tipo); });
  cd.addEventListener('wheel', e => {
    if (!F[tipo] || F.activo !== cd) return;
    e.preventDefault();
    F.aj[tipo].escala *= Math.exp(-e.deltaY * 0.0015); aplicar(); recordarAjuste(tipo);
  }, {passive: false});
}
function abrirAjuste(cd, tipo, aplicar) {
  cerrarAjuste();
  F.activo = cd; cd.classList.add('ajustando');
  const paso = f => () => { f(F.aj[tipo]); aplicar(); recordarAjuste(tipo); };
  const b = (txt, fn, t) => el('button', {title: t, 'aria-label': t, onpointerdown: e => e.stopPropagation(), onclick: e => { e.stopPropagation(); fn(); }}, txt);
  cd.append(el('div', {class: 'herr'},
    b('−', paso(a => a.escala /= 1.12), 'más chica'), b('+', paso(a => a.escala *= 1.12), 'más grande'),
    b('↺', paso(a => Object.assign(a, AJUSTE0)), 'como al principio'),
    b('Cambiar', () => { cerrarAjuste(); abrirFirma(tipo); }, 'hacer otra firma'),
    b('Listo', cerrarAjuste, 'listo')));
  if (!F.ayudaAjuste) { F.ayudaAjuste = true; aviso(matchMedia('(pointer: coarse)').matches ? 'Arrastra para moverla y pellizca para cambiar su tamaño' : 'Arrastra para moverla; usa − y + o la rueda para el tamaño'); }
}
function cerrarAjuste() {
  if (!F.activo) return;
  F.activo.classList.remove('ajustando'); F.activo.querySelector('.herr')?.remove(); F.activo = null;
}
addEventListener('pointerdown', e => { if (F.activo && !e.target.closest('.campo.ajustando')) cerrarAjuste(); }, true);

function abrirFirma(tipo) {
  const ini = tipo === 'iniciales';
  let listo = null, metodo = 'dibujada';
  const zona = el('div', {style: {display: 'grid', gap: '10px'}});
  const usar = el('button', {class: 'primario grande', disabled: true}, 'Listo');
  const rec = el('input', {type: 'checkbox', checked: !!leer(tipo)});
  const cambiar = el('button', {class: 'enlace'});
  const v = dialogo(ini ? 'Haz tus iniciales' : 'Haz tu firma', [zona,
    el('label', {class: 'casilla chico'}, rec, el('span', {}, 'Recordarla en este dispositivo')),
    el('div', {class: 'fila'}, cambiar, el('span', {class: 'crece'}), usar)]);
  const poner = (url, m) => { listo = url; metodo = m; usar.disabled = !url; };
  usar.onclick = () => {
    if (F[tipo] !== listo) F.aj[tipo] = {...AJUSTE0};
    F[tipo] = listo; F.metodo[tipo] = metodo;
    if (rec.checked) { recordar(tipo, listo, metodo); recordarAjuste(tipo); } else olvidar(tipo);
    v.remove(); pintarMios();
    if (pendientes().length) siguiente(); else aviso('Toca tu firma si quieres moverla o cambiar su tamaño');
  };
  const dibujar = () => {
    poner(null);
    const lz = lienzo(url => poner(url, 'dibujada'));
    zona.replaceChildren(lz.nodo, el('div', {class: 'fila'}, el('span', {class: 'crece tenue chico'}, 'Usa tu dedo, una pluma o el ratón.'), el('button', {class: 'enlace', onclick: lz.borrar}, 'Borrar')));
    requestAnimationFrame(lz.ajustar);
    cambiar.textContent = '¿Prefieres subir una imagen?'; cambiar.onclick = subirImg;
  };
  const subirImg = () => {
    poner(null);
    const archivo = el('input', {type: 'file', accept: 'image/png,image/jpeg', class: 'oculto', onchange: async e => {
      try { const url = await limpiarImagen(e.target.files[0]); vista.replaceChildren(el('img', {src: url, alt: 'tu firma'})); poner(url, 'imagen'); }
      catch (er) { aviso(er.message, true); }
    }});
    const vista = el('div', {class: 'vista', role: 'button', tabindex: 0, onclick: () => archivo.click()},
      el('div', {}, el('b', {style: {color: 'var(--texto)'}}, 'Toca para elegir una foto o imagen de tu firma'), el('div', {class: 'chico'}, 'PNG o JPG. Si tiene fondo blanco, se lo quitamos.')));
    zona.replaceChildren(vista, archivo);
    cambiar.textContent = 'Mejor la dibujo'; cambiar.onclick = dibujar;
  };
  dibujar();
}

/** Lienzo de dibujo con trazo suave; entrega un PNG recortado y transparente. */
function lienzo(alCambiar) {
  const c = el('canvas', {'aria-label': 'área para dibujar la firma'});
  const indica = el('div', {class: 'indica'}, 'Firma aquí');
  const nodo = el('div', {class: 'lienzo'}, c, el('div', {class: 'guia'}), el('span', {class: 'x'}, '×'), indica);
  const x = c.getContext('2d');
  const trazos = []; let actual = null;
  const ajustar = () => {
    const r = c.getBoundingClientRect(), d = Math.max(2, devicePixelRatio || 1);
    c.width = Math.round(r.width * d); c.height = Math.round(r.height * d);
    redibujar();
  };
  const punto = e => { const r = c.getBoundingClientRect(); return {x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, t: e.timeStamp}; };
  function trazar(ctx, W, H, tr, grosor) {
    if (!tr.length) return;
    ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle = '#14213d';
    if (tr.length === 1) { ctx.beginPath(); ctx.arc(tr[0].x * W, tr[0].y * H, grosor / 2, 0, 7); ctx.fill(); return; }
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      const vel = Math.hypot((b.x - a.x) * W, (b.y - a.y) * H) / Math.max(1, b.t - a.t);
      ctx.lineWidth = grosor * Math.max(.55, Math.min(1.25, 1.3 - vel * .35 / (W / 600)));
      const m0 = i > 1 ? {x: (tr[i - 2].x + a.x) / 2, y: (tr[i - 2].y + a.y) / 2} : a, m1 = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
      ctx.beginPath(); ctx.moveTo(m0.x * W, m0.y * H); ctx.quadraticCurveTo(a.x * W, a.y * H, m1.x * W, m1.y * H); ctx.stroke();
    }
  }
  function redibujar() {
    x.clearRect(0, 0, c.width, c.height);
    for (const t of trazos) trazar(x, c.width, c.height, t, c.width / 260);
    indica.classList.toggle('oculto', trazos.length > 0);
  }
  c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); actual = [punto(e)]; trazos.push(actual); redibujar(); });
  c.addEventListener('pointermove', e => { if (!actual) return; for (const ev of e.getCoalescedEvents?.() || [e]) actual.push(punto(ev)); redibujar(); });
  const fin = () => { if (!actual) return; actual = null; alCambiar(exportar()); };
  c.addEventListener('pointerup', fin); c.addEventListener('pointercancel', fin);
  function exportar() {
    const pts = trazos.flat(); if (pts.length < 4) return null;
    const W = 1400, H = Math.round(W * c.height / c.width), g = W / 260;
    const minx = Math.min(...pts.map(p => p.x)) * W - g * 2, maxx = Math.max(...pts.map(p => p.x)) * W + g * 2;
    const miny = Math.min(...pts.map(p => p.y)) * H - g * 2, maxy = Math.max(...pts.map(p => p.y)) * H + g * 2;
    const o = document.createElement('canvas');
    o.width = Math.max(10, Math.ceil(maxx - minx)); o.height = Math.max(10, Math.ceil(maxy - miny));
    const ox = o.getContext('2d'); ox.translate(-minx, -miny);
    for (const t of trazos) trazar(ox, W, H, t, g);
    return o.toDataURL('image/png');
  }
  return {nodo, ajustar, borrar: () => { trazos.length = 0; redibujar(); alCambiar(null); }};
}

/** Reduce, quita el fondo claro y recorta los márgenes vacíos de una imagen. */
async function limpiarImagen(archivo) {
  if (!archivo) throw new Error('Elige una imagen');
  if (!/^image\/(png|jpeg)$/.test(archivo.type)) throw new Error('Usa una imagen PNG o JPG');
  if (archivo.size > 12 * 1024 * 1024) throw new Error('La imagen pesa demasiado');
  const bmp = await createImageBitmap(archivo);
  const k = Math.min(1, 1200 / bmp.width, 1200 / bmp.height);
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(bmp, 0, 0, c.width, c.height);
  const im = x.getImageData(0, 0, c.width, c.height), d = im.data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let i = 0; i < d.length; i += 4) {
    const l = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
    d[i + 3] = Math.min(d[i + 3], Math.max(0, Math.min(255, (235 - l) * 255 / 60)));
    if (d[i + 3] > 24) { const p = i / 4, px = p % c.width, py = (p / c.width) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  }
  if (x1 < 0) throw new Error('No encontramos la firma en la imagen. Prueba con una foto más contrastada.');
  x.putImageData(im, 0, 0);
  const m = 6, o = document.createElement('canvas');
  o.width = x1 - x0 + 1 + 2 * m; o.height = y1 - y0 + 1 + 2 * m;
  o.getContext('2d').drawImage(c, x0, y0, x1 - x0 + 1, y1 - y0 + 1, m, m, x1 - x0 + 1, y1 - y0 + 1);
  return o.toDataURL('image/png');
}

/* ───────── terminar ───────── */
function terminar() {
  cerrarAjuste();
  const {sobre, yo, docs} = F.datos;
  if (pendientes().length) return siguiente(true);
  const acepto = el('input', {type: 'checkbox'});
  const firmar = el('button', {class: 'primario grande', disabled: true, style: {width: '100%'}}, 'Firmar');
  let verificado = !sobre.codigo || yo.verificado;
  const zonaCodigo = el('div', {style: {display: 'grid', gap: '10px'}});
  const actualizar = () => { firmar.disabled = !(acepto.checked && verificado); };
  acepto.onchange = actualizar;
  if (!verificado) {
    const oculto = yo.correo.replace(/^(.)[^@]*(@.*)$/, '$1•••$2');
    const cod = el('input', {class: 'codigo', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '······', 'aria-label': 'código'});
    const confirmar = async () => {
      try { await api('f_verificar', {datos: {t: T, codigo: cod.value}}); verificado = true; zonaCodigo.replaceChildren(el('p', {class: 'verde'}, '✓ Listo, confirmamos que eres tú')); actualizar(); }
      catch (e) { aviso(e.message, true); }
    };
    cod.oninput = () => { if (cod.value.replace(/\D/g, '').length === 6) confirmar(); };
    const pedir = el('button', {onclick: async () => {
      try {
        pedir.disabled = true; await api('f_codigo', {datos: {t: T}});
        aviso('Te mandamos un código a ' + oculto);
        pedir.replaceWith(el('p', {class: 'chico tenue'}, `Escribe el código de 6 números que llegó a ${oculto}`), cod); cod.focus();
      } catch (e) { aviso(e.message, true); pedir.disabled = false; }
    }}, 'Mandarme un código');
    zonaCodigo.append(el('p', {}, el('b', {}, 'Primero confirma que eres tú. '), `Te mandamos un código a ${oculto}.`), pedir);
  }
  const v = dialogo('Último paso', [
    el('div', {class: 'resumen-firma'}, F.firma ? el('img', {src: F.firma, alt: 'tu firma'}) : '',
      el('div', {}, el('b', {}, yo.nombre), el('div', {class: 'tenue chico'}, docs.length === 1 ? sinPdf(docs[0].name || docs[0].nombre) : `${docs.length} documentos`))),
    zonaCodigo,
    el('label', {class: 'casilla'}, acepto, el('span', {}, 'Leí los documentos y acepto firmarlos de forma electrónica, con el mismo valor que mi firma a mano.')),
    firmar,
    el('p', {class: 'tenue chico', style: {textAlign: 'center'}}, 'Guardamos la fecha, la hora y desde dónde firmaste, como respaldo de tu firma.')]);
  firmar.onclick = async () => {
    firmar.disabled = true; firmar.textContent = 'Firmando…';
    const d = {t: T, acepto: true, textos: F.textos, ajustes: {firma: F.aj.firma, iniciales: F.aj.iniciales}};
    for (const t of ['firma', 'iniciales']) if (F[t]) { d[t] = F[t]; d[t + '_metodo'] = F.metodo[t] === 'imagen' ? 'imagen' : 'dibujada'; }
    try {
      await api('f_firmar', {datos: d});
      v.remove();
      F.datos = await api('f_sobre', {params: {t: T}});
      $('.barra')?.remove();
      verFirmado(); scrollTo(0, 0);
    } catch (e) { aviso(e.message, true); firmar.disabled = false; firmar.textContent = 'Firmar'; }
  };
}

function rechazar() {
  const m = el('textarea', {rows: 3, maxlength: 500, placeholder: 'Cuéntanos por qué (opcional). Ej.: hay un error en mi nombre.'});
  const v = dialogo('¿No vas a firmar?', [
    el('p', {}, `Le avisaremos a ${F.datos.emisor} y la solicitud se detendrá. Si solo hay un error, escríbelo para que lo corrija.`), m,
    el('div', {class: 'fila'}, el('button', {class: 'enlace', onclick: () => v.remove()}, 'Mejor no'), el('span', {class: 'crece'}),
      el('button', {class: 'primario', style: {background: 'var(--peligro)', borderColor: 'var(--peligro)'}, onclick: async () => {
        try { await api('f_rechazar', {datos: {t: T, motivo: m.value}}); v.remove(); $('.barra')?.remove(); iniciar(); }
        catch (e) { aviso(e.message, true); }
      }}, 'No voy a firmar'))]);
}

addEventListener('hashchange', () => location.reload());
iniciar();
