/*
 * Rubrikas · panel
 * Parte de la colección Alchemy of Meaning (Alquimia del Significado).
 * © 2026 Héctor Cruz Juárez · https://hectorcruz.com.mx
 * Software libre bajo licencia GPL-3.0-or-later.
 */
import {$, $$, el, api, setCsrf, aviso, dialogo, acercaDe, abrirPDF, medidas, pintarPaginas, detectarLineas, cajaPorOmision,
  estampar, sha256hex, COLORES, TIPOS, LOGO, iniciales, AJUSTE0, ajusteLimpio, colocarFirma} from './comun.js';
import {esDocx, analizar, montarDocx, cajaCampo, estamparDocx, pdfDeVista} from './docx.js';

const main = $('#main');
const E = {ses: null, sobre: null, pdfs: {}, bytes: {}, cajas: {}, elegido: null, fAct: null, tipo: 'firma', ajustes: null, guardarT: 0};
const nuevoId = p => p + crypto.getRandomValues(new Uint32Array(1))[0].toString(16).padStart(8, '0').slice(0, 6);
const colorDe = fid => COLORES[Math.max(0, E.sobre.firmantes.findIndex(f => f.id === fid)) % COLORES.length];
const fecha = iso => iso ? new Date(iso).toLocaleString('es-MX', {day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'}) : '';
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const avatar = (f, i, listo = false) => el('span', {class: 'avatar' + (listo ? ' listo' : ''), title: f.nombre, style: {background: COLORES[i % COLORES.length]}}, iniciales(f.nombre));
const sinPdf = n => n.replace(/\.(pdf|docx)$/i, '');
const docDe = id => E.sobre.docs.find(d => d.id === id);
const esWord = d => d?.tipo === 'docx';

const logo = $('#logo');
logo.innerHTML = LOGO + '<span>Rubrikas</span>';
logo.onclick = e => { e.preventDefault(); if (E.ses?.dentro) inicio(); else acercaDe(); };
$('#bSalir').onclick = async () => { await api('salir', {datos: {}}); location.hash = ''; location.reload(); };
$('#bAjustes').onclick = verAjustes;

async function arrancar() {
  E.ses = await api('estado');
  setCsrf(E.ses.csrf);
  if (!E.ses.dentro) return verEntrar();
  $('#bAjustes').classList.remove('oculto'); $('#bSalir').classList.remove('oculto');
  E.ajustes = await api('ajustes');
  const id = location.hash.slice(1);
  if (/^S\d{6}-[a-f0-9]{6}$/.test(id)) abrir(id); else inicio();
}
const pantalla = (...hijos) => { main.replaceChildren(el('div', {class: 'contenido'}, ...hijos)); scrollTo(0, 0); };

/* ───────── entrar ───────── */
function verEntrar() {
  const nueva = !E.ses.configurado;
  const c1 = el('input', {type: 'password', autocomplete: nueva ? 'new-password' : 'current-password', placeholder: 'Contraseña'});
  const c2 = el('input', {type: 'password', autocomplete: 'new-password', placeholder: 'Repite la contraseña'});
  const form = el('form', {class: 'tarjeta entrar'},
    el('div', {class: 'logo-grande'}),
    el('h1', {style: {textAlign: 'center'}}, nueva ? 'Bienvenido a Rubrikas' : 'Entrar'),
    el('p', {class: 'tenue', style: {textAlign: 'center'}}, nueva ? 'Crea una contraseña para tu panel. Las personas que firman no la necesitan: les llega su propio enlace.' : 'Escribe tu contraseña para ver tus envíos.'),
    c1, nueva ? c2 : '',
    el('button', {class: 'primario grande', type: 'submit'}, nueva ? 'Crear y entrar' : 'Entrar'));
  form.querySelector('.logo-grande').innerHTML = LOGO;
  form.onsubmit = async e => {
    e.preventDefault();
    try {
      if (nueva) {
        if (c1.value.length < 8) return aviso('La contraseña necesita al menos 8 caracteres', true);
        if (c1.value !== c2.value) return aviso('Las contraseñas no coinciden', true);
        await api('configurar', {datos: {clave: c1.value}});
      } else await api('entrar', {datos: {clave: c1.value}});
      location.reload();
    } catch (er) { aviso(er.message, true); }
  };
  main.replaceChildren(el('div', {class: 'contenido'}, form));
  c1.focus();
}

/* ───────── inicio ───────── */
function resumen(s) {
  const n = s.firmantes.filter(f => f.estado === 'firmado').length, t = s.firmantes.length;
  switch (s.estado) {
    case 'borrador': return ['Sin enviar', ''];
    case 'enviado': return [t - n === 1 ? 'Falta 1 firma' : `Faltan ${t - n} firmas`, 'espera'];
    case 'firmado': return ['Firmado · preparando archivos', 'ok'];
    case 'completo': return ['Firmado por todos', 'ok'];
    case 'rechazado': return ['Alguien no quiso firmar', 'mal'];
    case 'anulado': return ['Cancelado', ''];
  }
  return [s.estado, ''];
}

async function inicio() {
  history.replaceState(null, '', location.pathname);
  E.sobre = null;
  const lista = await api('lista');
  const porCerrar = lista.filter(s => s.estado === 'firmado');
  if (porCerrar.length && !E.cerrando) {
    E.cerrando = true;
    (async () => { for (const s of porCerrar) { try { await prepararFinal(await api('sobre', {params: {id: s.id}})); } catch {} } E.cerrando = false; if (!E.sobre) inicio(); })();
  }
  const tarjeta = s => {
    const [txt, cls] = resumen(s);
    const n = s.firmantes.filter(f => f.estado === 'firmado').length;
    return el('div', {class: 'tarjeta envio', role: 'button', tabindex: 0, onclick: () => abrir(s.id), onkeydown: e => { if (e.key === 'Enter') abrir(s.id); }},
      el('div', {}, el('h3', {}, s.titulo), el('div', {class: 'tenue chico'}, `${plural(s.docs, 'documento', 'documentos')} · ${fecha(s.creado)}`)),
      el('div', {class: 'fila', style: {justifyContent: 'flex-end'}},
        el('div', {class: 'personas'}, ...s.firmantes.map((f, i) => avatar(f, i, f.estado === 'firmado'))),
        el('span', {class: 'estado ' + cls}, txt)),
      s.estado === 'enviado' && s.firmantes.length ? el('div', {class: 'avance'}, el('i', {style: {width: (n / s.firmantes.length * 100) + '%'}})) : '');
  };
  const grupos = [
    ['Esperando firmas', lista.filter(s => ['enviado', 'firmado', 'rechazado'].includes(s.estado))],
    ['Sin enviar', lista.filter(s => s.estado === 'borrador')],
    ['Listos', lista.filter(s => s.estado === 'completo')],
    ['Cancelados', lista.filter(s => s.estado === 'anulado')]];
  const nombre = (E.ajustes?.mi_nombre || '').split(' ')[0];
  pantalla(
    el('div', {class: 'hero'},
      el('div', {class: 'crece'}, el('h1', {}, nombre ? `Hola, ${nombre}` : 'Tus envíos'), el('p', {class: 'tenue'}, 'Sube un PDF, di quién firma y listo.')),
      el('button', {class: 'primario grande', onclick: nuevo}, '+ Mandar a firmar')),
    lista.length ? '' : el('div', {class: 'tarjeta vacio'},
      el('h2', {}, 'Todavía no tienes envíos'),
      el('p', {style: {margin: '6px 0 18px'}}, 'Empieza con un contrato, una cesión o cualquier PDF.'),
      el('button', {class: 'primario', onclick: nuevo}, 'Mandar mi primer documento')),
    ...grupos.filter(([, l]) => l.length).map(([t, l]) => el('div', {class: 'seccion'}, el('h3', {}, t), ...l.map(tarjeta))));
}

/* ───────── nuevo envío (borrador) ───────── */
function nuevo() {
  E.sobre = null; E.elegido = null; E.fAct = null;
  history.replaceState(null, '', location.pathname);
  editor();
}

async function abrir(id) {
  try { E.sobre = await api('sobre', {params: {id}}); } catch (e) { aviso(e.message, true); return inicio(); }
  history.replaceState(null, '', '#' + id);
  E.elegido = null;
  E.fAct = E.sobre.firmantes[0]?.id || null;
  if (E.sobre.estado === 'borrador') editor(); else detalle();
}
async function pdfDe(doc, final = false) {
  const k = doc.id + (final ? 'F' : '');
  if (!E.pdfs[k]) E.pdfs[k] = await abrirPDF(`api.php?a=pdf&id=${E.sobre.id}&doc=${doc.id}${final ? '&final=1' : ''}`);
  return E.pdfs[k];
}

function editor() {
  const S = E.sobre;
  const archivo = el('input', {type: 'file', accept: 'application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', multiple: true, class: 'oculto', onchange: e => { subir([...e.target.files]); e.target.value = ''; }});
  const titulo = el('input', {value: S?.titulo || '', placeholder: 'Nombre del envío (por ejemplo: Contrato de gira)', style: {fontSize: '20px', fontWeight: 700, border: 0, padding: '6px 0', background: 'none', boxShadow: 'none'},
    oninput: e => { if (E.sobre) { E.sobre.titulo = e.target.value; guardarLuego(); } }});

  // paso 1
  const docs = el('div', {class: 'docs'});
  const soltar = el('div', {class: 'soltar', role: 'button', tabindex: 0, onclick: () => archivo.click(), onkeydown: e => { if (e.key === 'Enter') archivo.click(); }},
    el('b', {}, 'Arrastra aquí tus PDF o Word'), el('span', {class: 'tenue'}, 'o toca para elegirlos · puedes subir varios'));
  for (const [ev, fn] of [['dragover', e => { e.preventDefault(); soltar.classList.add('sobre'); }], ['dragleave', () => soltar.classList.remove('sobre')],
    ['drop', e => { e.preventDefault(); soltar.classList.remove('sobre'); subir([...e.dataTransfer.files].filter(f => /pdf$/i.test(f.type) || /\.(pdf|docx)$/i.test(f.name))); }]])
    soltar.addEventListener(ev, fn);
  const paso1 = el('div', {class: 'tarjeta paso'}, cabPaso(1, 'Sube los documentos'), docs, soltar, archivo);

  // paso 2
  const personas = el('div', {style: {display: 'grid', gap: '10px'}});
  const paso2 = el('div', {class: 'tarjeta paso'}, cabPaso(2, '¿Quién firma?'), personas,
    el('div', {class: 'fila'},
      el('button', {onclick: () => agregarPersona('')}, '+ Agregar persona'),
      el('button', {id: 'bYo', onclick: () => agregarPersona(E.ajustes?.mi_nombre || '', (E.ajustes?.aviso_a || '').split(/[\s,;]+/)[0] || '', true, true)}, '+ Yo también firmo')));

  // paso 3
  const quienes = el('div', {class: 'quienes'});
  const tipos = el('div', {class: 'tipos', role: 'group', 'aria-label': 'qué agregar'},
    ...[['firma', 'Firma'], ['fecha', 'Fecha'], ['texto', 'Texto'], ['iniciales', 'Iniciales']].map(([k, t]) =>
      el('button', {class: k === E.tipo ? 'activo' : '', onclick: e => { E.tipo = k; $$('button', tipos).forEach(b => b.classList.toggle('activo', b === e.currentTarget)); }}, t)));
  const hojas = el('div', {class: 'hojas', id: 'hojas'});
  const ayuda3 = el('p', {class: 'tenue chico'});
  const paso3 = el('div', {class: 'tarjeta paso'}, cabPaso(3, 'Marca dónde firma cada quien'), ayuda3,
    el('div', {class: 'fila'}, quienes, el('span', {class: 'crece'}), tipos), hojas);

  // más opciones
  const msj = el('textarea', {rows: 3, maxlength: 2000, placeholder: 'Ej. Hola, te comparto la cesión de derechos para revisar y firmar. ¡Gracias!', oninput: e => { E.sobre && (E.sobre.mensaje = e.target.value, guardarLuego()); }}, S?.mensaje || '');
  const observan = el('input', {value: (S?.observadores || []).map(o => o.correo).join(', '), placeholder: 'correo@ejemplo.com, otro@ejemplo.com',
    oninput: e => { E.sobre && (E.sobre.observadores = e.target.value, guardarLuego()); }});
  const orden = el('input', {type: 'checkbox', checked: !!S?.orden, onchange: e => { E.sobre && (E.sobre.orden = e.target.checked, guardarLuego()); }});
  const codigo = el('input', {type: 'checkbox', checked: !!S?.codigo, disabled: !E.ses.correo, onchange: e => { E.sobre && (E.sobre.codigo = e.target.checked, guardarLuego()); }});
  const mas = el('details', {class: 'tarjeta'}, el('summary', {}, 'Más opciones'),
    el('div', {style: {display: 'grid', gap: '14px', marginTop: '14px'}},
      el('label', {}, el('div', {class: 'chico', style: {fontWeight: 600, marginBottom: '6px'}}, 'Mensaje para quienes firman'), msj),
      el('label', {}, el('div', {class: 'chico', style: {fontWeight: 600, marginBottom: '6px'}}, 'Avisar también a'), observan,
        el('div', {class: 'tenue chico', style: {marginTop: '4px'}}, 'Correos separados por comas. Reciben el avance de este envío y, al final, un enlace para descargar los documentos firmados. No firman ni entran a tu panel.')),
      el('label', {class: 'casilla'}, orden, el('span', {}, 'Que firmen en orden', el('div', {class: 'tenue chico'}, 'La segunda persona recibe su turno cuando firma la primera, y así.'))),
      el('label', {class: 'casilla'}, codigo, el('span', {}, 'Pedir un código por correo antes de firmar',
        el('div', {class: 'tenue chico'}, E.ses.correo ? 'Más seguridad: confirma que quien firma es dueño de su correo.' : 'Necesita activar el envío de correos en Ajustes.'))),
      S ? el('button', {class: 'enlace peligro', style: {justifySelf: 'start'}, onclick: borrar}, 'Eliminar este borrador') : ''));

  // barra de enviar
  const falta = el('span', {class: 'crece tenue chico'});
  const enviarB = el('button', {class: 'primario grande', onclick: enviar}, 'Enviar para firmar');
  const barra = el('div', {class: 'barra'}, el('div', {}, falta, enviarB));

  main.replaceChildren(el('div', {class: 'contenido'},
    el('div', {class: 'fila'}, el('button', {class: 'enlace', onclick: inicio}, '← Volver'), el('span', {class: 'crece'})),
    titulo, paso1, paso2, paso3, mas), barra);

  /* repintados */
  E.repintar = () => {
    const S = E.sobre;
    titulo.value = S?.titulo || '';
    docs.replaceChildren(...(S?.docs || []).map(d => el('span', {class: 'doc'}, '📄 ', el('span', {title: d.nombre}, sinPdf(d.nombre)),
      el('span', {class: 'tenue'}, plural(d.paginas.length, 'pág.', 'págs.')),
      el('button', {'aria-label': 'quitar ' + d.nombre, onclick: () => quitarDoc(d)}, '×'))));
    soltar.querySelector('b').textContent = S?.docs.length ? '+ Agregar otro documento' : 'Arrastra aquí tus PDF o Word';
    personas.replaceChildren(...(S?.firmantes || []).map((f, i) => {
      const av = avatar(f, i);
      const n = el('input', {value: f.nombre, placeholder: 'Nombre completo', 'aria-label': 'nombre', oninput: e => { f.nombre = e.target.value; av.textContent = iniciales(f.nombre); guardarLuego(); pintarQuienes(); pintarCampos(); faltantes(); }});
      const c = el('input', {value: f.correo, type: 'email', class: 'correo', placeholder: E.ses.correo ? 'Correo' : 'Correo (opcional)', 'aria-label': 'correo', oninput: e => { f.correo = e.target.value; guardarLuego(); faltantes(); }});
      const derecha = f.yo ? filaMiFirma() : c;
      return el('div', {class: 'persona'}, av, n, derecha, el('button', {class: 'quitar', 'aria-label': 'quitar a ' + (f.nombre || 'esta persona'), onclick: () => quitarPersona(f)}, '×'));
    }));
    const bYo = $('#bYo'); if (bYo) bYo.classList.toggle('oculto', !!S?.firmantes.some(f => f.yo));
    paso2.classList.toggle('apagado', !S?.docs.length);
    paso3.classList.toggle('apagado', !S?.docs.length || !S?.firmantes.length);
    pintarQuienes();
    faltantes();
  };
  function pintarQuienes() {
    const S = E.sobre;
    if (!S?.firmantes.length) { quienes.replaceChildren(); ayuda3.textContent = 'Primero agrega a las personas que firman.'; return; }
    if (!S.firmantes.some(f => f.id === E.fAct)) E.fAct = S.firmantes[0].id;
    quienes.replaceChildren(...S.firmantes.map((f, i) => el('button', {class: 'quien' + (f.id === E.fAct ? ' activo' : ''), style: {'--c': COLORES[i % COLORES.length]},
      onclick: () => { E.fAct = f.id; pintarQuienes(); }}, avatar(f, i), f.nombre.split(' ')[0] || `Persona ${i + 1}`)));
    const quien = S.firmantes.find(f => f.id === E.fAct);
    ayuda3.textContent = `Ya marcamos las líneas para firmar que encontramos. Para agregar otro lugar, elige a la persona y toca el documento. Ahora estás marcando para: ${quien?.nombre || 'persona sin nombre'}.`;
  }
  E.pintarQuienes = pintarQuienes;
  function faltantes() {
    const S = E.sobre, p = [];
    if (!S?.docs.length) p.push('sube al menos un PDF');
    else if (!S.firmantes.length) p.push('agrega a quien firma');
    else {
      if (S.firmantes.some(f => !f.nombre.trim())) p.push('falta un nombre');
      if (E.ses.correo && S.codigo && S.firmantes.some(f => !/.+@.+\..+/.test(f.correo))) p.push('falta un correo');
      const sin = S.firmantes.filter(f => !S.campos.some(c => c.firmante === f.id && (c.tipo === 'firma' || c.tipo === 'iniciales')));
      if (sin.length) p.push(`marca dónde firma ${sin.map(f => f.nombre.split(' ')[0] || 'cada persona').join(' y ')}`);
    }
    const yo = S?.firmantes.find(f => f.yo);
    const sinCorreo = E.ses.correo && S?.firmantes.length ? S.firmantes.filter(f => !f.yo && !/.+@.+\..+/.test(f.correo)) : [];
    if (!p.length && sinCorreo.length) { falta.textContent = `Sin correo, ${sinCorreo.map(f => f.nombre.split(' ')[0] || 'alguien').join(' y ')} no recibirá aviso: le compartirás su enlace tú.`; falta.className = 'crece chico'; falta.style.color = 'var(--aviso)'; enviarB.disabled = false; return; }
    falta.style.color = '';
    if (!p.length && yo && !E.ajustes?.tiene_firma) { falta.textContent = 'Sin tu firma guardada, firmarás con tu propio enlace, como los demás.'; falta.className = 'crece chico tenue'; enviarB.disabled = false; return; }
    if (!p.length && yo && S.campos.some(c => c.firmante === yo.id && c.tipo === 'texto')) { falta.textContent = 'Tienes campos de texto: firmarás con tu propio enlace.'; falta.className = 'crece chico tenue'; enviarB.disabled = false; return; }
    falta.textContent = p.length ? 'Para enviar: ' + p.join(' · ') : yo ? 'Todo listo · tu firma se coloca sola al enviar' : `Todo listo · ${plural(S.docs.length, 'documento', 'documentos')}, ${plural(S.firmantes.length, 'persona', 'personas')}`;
    falta.className = 'crece chico ' + (p.length ? 'tenue' : 'verde');
    enviarB.disabled = p.length > 0;
  }
  E.faltantes = faltantes;
  E.repintar();
  if (S?.docs.length) pintarHojas();
}

function cabPaso(n, t) { return el('div', {class: 'paso-cab'}, el('span', {class: 'paso-num'}, n), el('h2', {}, t)); }

async function asegurarSobre(titulo) {
  if (E.sobre) return;
  const r = await api('crear', {datos: {titulo}});
  E.sobre = await api('sobre', {params: {id: r.id}});
  history.replaceState(null, '', '#' + r.id);
}

async function subir(archivos) {
  if (!archivos.length) return aviso('Elige archivos PDF o Word (.docx)', true);
  try { await asegurarSobre(sinPdf(archivos[0].name) + (archivos.length > 1 ? ` y ${archivos.length - 1} más` : '')); }
  catch (e) { return aviso(e.message, true); }
  const S = E.sobre;
  if (!S.firmantes.length) agregarPersona('', '', false);
  for (const a of archivos) {
    try {
      aviso('Subiendo ' + a.name + '…');
      const buf = await a.arrayBuffer();
      if (esDocx(a.name)) { await subirDocx(a, buf); continue; }
      const pdf = await abrirPDF(buf);
      const f = new FormData();
      f.append('id', S.id); f.append('pdf', a, a.name); f.append('paginas', JSON.stringify(await medidas(pdf)));
      const r = await api('subir', {form: f});
      S.docs.push(r.doc); E.pdfs[r.doc.id] = pdf;
      await detectar(r.doc);
    } catch (e) { aviso(a.name + ': ' + e.message, true); }
  }
  await guardar();
  E.repintar(); await pintarHojas();
  const n = S.campos.length;
  aviso(n ? `Encontramos ${plural(n, 'lugar', 'lugares')} para firmar` : 'Listo. Ahora marca dónde firma cada quien');
}

/** Word: las firmas van en las líneas largas «______» y en etiquetas como {firma Vivian}. */
async function subirDocx(a, buf) {
  const S = E.sobre;
  const ms = await analizar(buf.slice(0));
  // si el documento trae nombres en sus etiquetas y aún no hay personas, se agregan solas
  const nombres = [...new Set(ms.filter(m => m.etiqueta?.nombre).map(m => m.etiqueta.nombre))];
  if (nombres.length && S.firmantes.length <= 1 && !S.firmantes[0]?.nombre) {
    S.firmantes = [];
    for (const n of nombres) S.firmantes.push({id: nuevoId('f'), nombre: n, correo: '', orden: S.firmantes.length + 1, estado: 'pendiente'});
    E.fAct = S.firmantes[0].id;
  }
  const f = new FormData();
  f.append('id', S.id); f.append('archivo', a, a.name); f.append('marcas', ms.length);
  const r = await api('subir', {form: f});
  S.docs.push(r.doc); E.bytes[r.doc.id] = buf;
  const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  for (const m of ms) {
    const tipo = m.etiqueta?.tipo || 'firma';
    const quien = m.etiqueta?.nombre ? S.firmantes.find(x => norm(x.nombre).startsWith(norm(m.etiqueta.nombre)) || norm(x.nombre).includes(norm(m.etiqueta.nombre))) : null;
    S.campos.push({id: nuevoId('c'), doc: r.doc.id, marca: m.k, pagina: 0, x: 0, y: 0, w: 0, h: 0, tipo, firmante: quien?.id || S.firmantes[0]?.id, requerido: true, auto: !quien});
  }
  repartir();
  if (!ms.length) aviso(`${sinPdf(a.name)}: no encontramos líneas largas (_______________) ni etiquetas como {firma Nombre}. Agrégalas en Word y vuelve a subirlo.`, true);
}

async function bytesDe(doc) {
  if (!E.bytes[doc.id]) {
    const r = await fetch(`api.php?a=pdf&id=${E.sobre.id}&doc=${doc.id}`, {credentials: 'same-origin'});
    if (!r.ok) throw new Error('no se pudo abrir ' + doc.nombre);
    E.bytes[doc.id] = await r.arrayBuffer();
  }
  return E.bytes[doc.id].slice(0);
}

async function quitarDoc(d) {
  const S = E.sobre;
  if (!confirm(`¿Quitar «${sinPdf(d.nombre)}»?`)) return;
  await guardar(); await api('quitar_doc', {datos: {id: S.id, doc: d.id}});
  S.docs = S.docs.filter(x => x.id !== d.id); S.campos = S.campos.filter(c => c.doc !== d.id);
  E.repintar(); pintarHojas();
}

function agregarPersona(nombre, correo = '', enfocar = true, yo = false) {
  const S = E.sobre; if (!S) return;
  if (yo && S.firmantes.some(f => f.yo)) return aviso('Ya estás en la lista');
  // si la única persona está vacía, reúsala
  const vacia = yo && S.firmantes.length === 1 && !S.firmantes[0].nombre && !S.firmantes[0].correo ? S.firmantes[0] : null;
  if (vacia) { Object.assign(vacia, {nombre, correo, yo}); E.fAct = vacia.id; guardarLuego(); E.repintar(); pintarCampos(); if (yo && !E.ajustes?.tiene_firma) pedirMiFirma(); return; }
  const f = {id: nuevoId('f'), nombre, correo, orden: S.firmantes.length + 1, estado: 'pendiente', yo};
  S.firmantes.push(f); E.fAct = f.id;
  // si había líneas detectadas sin repartir bien, repártelas otra vez entre todos
  if (S.campos.some(c => c.auto)) repartir();
  guardarLuego(); E.repintar(); pintarCampos();
  if (enfocar && !nombre) $$('.persona input[aria-label=nombre]').pop()?.focus();
  if (yo && !E.ajustes?.tiene_firma) pedirMiFirma();
}
function quitarPersona(f) {
  const S = E.sobre, n = S.campos.filter(c => c.firmante === f.id).length;
  if (n && !confirm(`¿Quitar a ${f.nombre || 'esta persona'}? También se quitan sus ${n} lugares de firma.`)) return;
  S.firmantes = S.firmantes.filter(x => x.id !== f.id);
  S.campos = S.campos.filter(c => c.firmante !== f.id);
  guardarLuego(); E.repintar(); pintarCampos();
}

/** Busca líneas «____» en un documento y las reparte entre quienes firman, en orden de lectura. */
async function detectar(doc) {
  const S = E.sobre;
  const cajas = await detectarLineas(await pdfDe(doc));
  for (const b of cajas) S.campos.push({id: nuevoId('c'), doc: doc.id, tipo: 'firma', firmante: S.firmantes[0]?.id, requerido: true, auto: true, ...b});
  repartir();
}
function repartir() {
  const S = E.sobre; if (!S.firmantes.length) return;
  // por documento, en orden de lectura (página, renglón, izquierda a derecha): 1ª línea a la 1ª persona, 2ª a la 2ª…
  // quien ya tiene su lugar por etiqueta ({firma Ana}) no entra al reparto de las líneas sueltas
  const conEtiqueta = new Set(S.campos.filter(c => !c.auto && Number.isInteger(c.marca)).map(c => c.firmante));
  const libres = S.firmantes.filter(f => !conEtiqueta.has(f.id));
  const lista = libres.length ? libres : S.firmantes;
  const porDoc = {};
  for (const c of S.campos.filter(c => c.auto)) (porDoc[c.doc] ||= []).push(c);
  for (const l of Object.values(porDoc)) {
    l.sort((a, b) => a.pagina - b.pagina || (a.marca ?? 0) - (b.marca ?? 0) || (Math.abs(a.y - b.y) > .015 ? a.y - b.y : a.x - b.x));
    l.forEach((c, i) => c.firmante = lista[i % lista.length].id);
  }
}

async function pintarHojas() {
  const S = E.sobre, h = $('#hojas'); if (!h) return;
  if (!S?.docs.length) { h.replaceChildren(el('p', {class: 'tenue', style: {textAlign: 'center'}}, 'Aquí verás tus documentos.')); return; }
  const cont = el('div', {class: 'paginas'});
  h.replaceChildren(cont);
  const ancho = Math.min(820, h.clientWidth - 28);
  for (const d of S.docs) {
    if (esWord(d)) { const m = await montarDocx(cont, await bytesDe(d), d, ancho); E.cajas[d.id] = m.cajas; continue; }
    for (const div of pintarPaginas(cont, await pdfDe(d), d, ancho)) div.addEventListener('pointerdown', ponerCampo);
  }
  pintarCampos();
}

function ponerCampo(e) {
  if (e.target.closest('.campo') || e.button !== 0) return;
  const S = E.sobre;
  if (!S.firmantes.length) return aviso('Primero agrega a quien firma', true);
  const div = e.currentTarget, r = div.getBoundingClientRect();
  const d = S.docs.find(x => x.id === div.dataset.doc), p = +div.dataset.p;
  const t = cajaPorOmision(E.tipo, d.paginas[p]);
  const c = {id: nuevoId('c'), doc: d.id, pagina: p, tipo: E.tipo, firmante: E.fAct, requerido: true,
    x: Math.max(0, Math.min(1 - t.w, (e.clientX - r.left) / r.width - t.w / 2)), y: Math.max(0, Math.min(1 - t.h, (e.clientY - r.top) / r.height - t.h / 2)), w: t.w, h: t.h};
  S.campos.push(c); E.elegido = c.id;
  guardarLuego(); pintarCampos(); E.faltantes();
}

function pintarCampos(soloLectura = false, sinPdfs = false) {
  const S = E.sobre;
  $$('.campo, .marca-libre').forEach(x => x.remove());
  // Word: lugares sin asignar, para agregarles un campo con un toque
  if (!soloLectura) for (const d of S.docs.filter(esWord)) {
    const hoja = $(`.docx-hoja[data-doc="${d.id}"]`); if (!hoja) continue;
    for (const caja of Object.values(E.cajas[d.id] || {})) {
      if (S.campos.some(c => c.doc === d.id && c.marca === caja.k)) continue;
      const b = cajaCampo(caja, 'firma');
      hoja.append(el('div', {class: 'marca-libre', title: 'agregar un campo aquí', style: {left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px'},
        onclick: () => {
          if (!S.firmantes.length) return aviso('Primero agrega a quien firma', true);
          const c = {id: nuevoId('c'), doc: d.id, marca: caja.k, pagina: 0, x: 0, y: 0, w: 0, h: 0, tipo: E.tipo, firmante: E.fAct, requerido: true};
          S.campos.push(c); E.elegido = c.id; guardarLuego(); pintarCampos(); E.faltantes();
        }}, '+ lugar'));
    }
  }
  for (const c of S.campos) {
    const word = esWord(docDe(c.doc));
    if (sinPdfs && !word) continue; // los PDF ya firmados se ven con sus firmas estampadas
    const div = word ? $(`.docx-hoja[data-doc="${c.doc}"]`) : $(`.pagina[data-doc="${c.doc}"][data-p="${c.pagina}"]`); if (!div) continue;
    const caja = word ? E.cajas[c.doc]?.[c.marca] : null;
    if (word && !caja) continue;
    const b = word ? cajaCampo(caja, c.tipo) : null;
    const f = S.firmantes.find(x => x.id === c.firmante);
    const nombre = f?.nombre.split(' ')[0] || 'sin asignar';
    const cd = el('div', {class: 'campo' + (c.id === E.elegido ? ' elegido' : '') + (soloLectura && f?.estado === 'firmado' ? ' lleno' : ''), 'data-id': c.id,
      style: {...(b ? {left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px'} : {left: c.x * 100 + '%', top: c.y * 100 + '%', width: c.w * 100 + '%', height: c.h * 100 + '%'}), '--c': colorDe(c.firmante)}},
      el('span', {class: 'et'}, (c.tipo === 'firma' ? '' : TIPOS[c.tipo] + ' · ') + nombre + (soloLectura && f?.estado === 'firmado' ? ' ✓' : '')));
    if (soloLectura && f?.estado === 'firmado') { // lo que ya firmó cada quien, aunque falten otros
      const im = f.imagenes?.[c.tipo];
      if (im) requestAnimationFrame(() => colocarFirma(cd, `api.php?a=img&id=${S.id}&n=${encodeURIComponent(im.archivo)}`, f.ajustes?.[c.tipo] || {escala: 1, dx: 0, dy: 0}, 'firma de ' + f.nombre));
      const t = c.tipo === 'fecha' ? f.fecha_texto : c.tipo === 'nombre' ? f.nombre : c.tipo === 'texto' ? f.textos?.[c.id] : '';
      if (t) cd.append(el('span', {class: 'valor'}, t));
    }
    if (!soloLectura && f?.yo && E.ajustes?.tiene_firma && (c.tipo === 'firma' || c.tipo === 'iniciales'))
      requestAnimationFrame(() => colocarFirma(cd, 'api.php?a=mi_firma&v=' + E.firmaV, f.ajustes?.[c.tipo] || AJUSTE0, 'tu firma'));
    if (!soloLectura) {
      if (!word) cd.append(el('span', {class: 'tirador', title: 'cambiar tamaño'}));
      cd.addEventListener('pointerdown', arrastrar);
      if (c.id === E.elegido) cd.append(herramientas(c));
    }
    div.append(cd);
  }
}

function herramientas(c) {
  const S = E.sobre;
  const sel = el('select', {'aria-label': 'quién firma aquí', onpointerdown: e => e.stopPropagation(),
    onchange: e => { c.firmante = e.target.value; c.auto = false; guardarLuego(); pintarCampos(); E.faltantes(); }},
    ...S.firmantes.map(f => el('option', {value: f.id, selected: f.id === c.firmante}, f.nombre || 'sin nombre')));
  const btn = (txt, fn, t) => el('button', {title: t || '', onpointerdown: e => e.stopPropagation(), onclick: e => { e.stopPropagation(); fn(); }}, txt);
  const f = S.firmantes.find(x => x.id === c.firmante);
  const mia = f?.yo && E.ajustes?.tiene_firma && (c.tipo === 'firma' || c.tipo === 'iniciales');
  const aj = fn => () => {
    f.ajustes ||= {}; const a = f.ajustes[c.tipo] = ajusteLimpio(f.ajustes[c.tipo] || AJUSTE0); fn(a); f.ajustes[c.tipo] = ajusteLimpio(a);
    guardarLuego();
    for (const x of S.campos.filter(x => x.firmante === f.id && x.tipo === c.tipo)) {
      const el2 = $(`.campo[data-id="${x.id}"]`); if (el2) colocarFirma(el2, 'api.php?a=mi_firma&v=' + E.firmaV, f.ajustes[c.tipo], 'tu firma');
    }
  };
  return el('div', {class: 'herr'}, sel,
    mia ? btn('−', aj(a => a.escala /= 1.12), 'firma más chica') : '', mia ? btn('+', aj(a => a.escala *= 1.12), 'firma más grande') : '',
    mia ? btn('↑', aj(a => a.dy -= .06), 'subir la firma') : '', mia ? btn('↓', aj(a => a.dy += .06), 'bajar la firma: muerde más la línea') : '',
    S.docs.length > 1 && !esWord(docDe(c.doc)) ? btn('En todos', () => copiarATodos(c), 'el mismo lugar en todos los documentos') : '',
    esWord(docDe(c.doc)) ? el('select', {'aria-label': 'tipo', onpointerdown: e => e.stopPropagation(), onchange: e => { c.tipo = e.target.value; guardarLuego(); pintarCampos(); }},
      ...Object.entries(TIPOS).map(([k, t]) => el('option', {value: k, selected: k === c.tipo}, t))) : '',
    btn('🗑', quitarElegido, 'quitar'));
}

function copiarATodos(c) {
  const S = E.sobre; let n = 0;
  for (const d of S.docs) {
    if (d.id === c.doc || esWord(d) || d.paginas.length <= c.pagina) continue;
    if (S.campos.some(x => x.doc === d.id && x.pagina === c.pagina && x.firmante === c.firmante && Math.abs(x.x - c.x) < .01 && Math.abs(x.y - c.y) < .01)) continue;
    S.campos.push({...c, id: nuevoId('c'), doc: d.id, auto: false}); n++;
  }
  guardarLuego(); pintarCampos();
  aviso(n ? `Copiado en ${plural(n, 'documento más', 'documentos más')}` : 'Ya estaba en todos');
}

function arrastrar(e) {
  e.stopPropagation(); e.preventDefault();
  const S = E.sobre, cd = e.currentTarget, c = S.campos.find(x => x.id === cd.dataset.id);
  if (esWord(docDe(c.doc))) { if (E.elegido !== c.id) { E.elegido = c.id; pintarCampos(); } return; } // en Word el lugar es la línea: no se arrastra
  const pag = cd.parentElement.getBoundingClientRect();
  const tamano = e.target.classList.contains('tirador');
  const x0 = e.clientX, y0 = e.clientY, ini = {...c};
  let movio = false;
  cd.setPointerCapture(e.pointerId);
  const mover = ev => {
    const dx = (ev.clientX - x0) / pag.width, dy = (ev.clientY - y0) / pag.height;
    if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) > 3) movio = true;
    if (tamano) { c.w = Math.max(.03, Math.min(1 - c.x, ini.w + dx)); c.h = Math.max(.012, Math.min(1 - c.y, ini.h + dy)); }
    else { c.x = Math.max(0, Math.min(1 - c.w, ini.x + dx)); c.y = Math.max(0, Math.min(1 - c.h, ini.y + dy)); }
    Object.assign(cd.style, {left: c.x * 100 + '%', top: c.y * 100 + '%', width: c.w * 100 + '%', height: c.h * 100 + '%'});
  };
  const soltar = () => {
    cd.removeEventListener('pointermove', mover); cd.removeEventListener('pointerup', soltar);
    if (movio) guardarLuego();
    if (movio && tamano) { pintarCampos(); return; } // la firma se vuelve a acomodar al tamaño nuevo
    if (E.elegido !== c.id) { E.elegido = c.id; pintarCampos(); }
  };
  cd.addEventListener('pointermove', mover);
  cd.addEventListener('pointerup', soltar);
}

function quitarElegido() {
  const S = E.sobre;
  S.campos = S.campos.filter(x => x.id !== E.elegido);
  E.elegido = null; guardarLuego(); pintarCampos(); E.faltantes();
}
addEventListener('keydown', e => {
  if (!E.sobre || E.sobre.estado !== 'borrador' || !E.elegido) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); quitarElegido(); }
  if (e.key === 'Escape') { E.elegido = null; pintarCampos(); }
});
addEventListener('pointerdown', e => { // tocar fuera de un campo lo deselecciona
  if (E.elegido && !e.target.closest('.campo')) { E.elegido = null; if (E.sobre?.estado === 'borrador') pintarCampos(); }
}, true);

function guardarLuego() { clearTimeout(E.guardarT); E.guardarT = setTimeout(guardar, 600); }
async function guardar() {
  clearTimeout(E.guardarT); E.guardarT = 0;
  const S = E.sobre; if (!S || S.estado !== 'borrador') return;
  const obs = typeof S.observadores === 'string' ? S.observadores : (S.observadores || []).map(o => o.correo).join(',');
  try { await api('guardar', {datos: {id: S.id, titulo: S.titulo, mensaje: S.mensaje, orden: S.orden, codigo: S.codigo, firmantes: S.firmantes, campos: S.campos, observadores: obs}}); }
  catch (e) { aviso('No se guardó: ' + e.message, true); }
}
addEventListener('beforeunload', () => { if (E.guardarT) guardar(); });

async function borrar() {
  if (!confirm('¿Eliminar este envío y sus documentos?')) return;
  try { await api('borrar', {datos: {id: E.sobre.id}}); aviso('Eliminado'); inicio(); } catch (e) { aviso(e.message, true); }
}

async function enviar(e) {
  const b = e.currentTarget; b.disabled = true; b.textContent = 'Enviando…';
  await guardar();
  try {
    const r = await api('enviar', {datos: {id: E.sobre.id, correo: E.ses.correo}});
    E.sobre = await api('sobre', {params: {id: E.sobre.id}});
    listo(r.enlaces);
  } catch (er) { aviso(er.message, true); b.disabled = false; b.textContent = 'Enviar para firmar'; }
}

/* ───────── enviado: compartir enlaces ───────── */
function compartir(f, url) {
  const txt = `Hola ${f.nombre.split(' ')[0]}, te comparto «${E.sobre.titulo}» para que lo revises y firmes aquí: ${url}`;
  return el('div', {class: 'acciones'},
    el('button', {onclick: async () => { await navigator.clipboard.writeText(url); aviso('Enlace copiado'); }}, 'Copiar enlace'),
    el('a', {class: 'boton', href: 'https://wa.me/?text=' + encodeURIComponent(txt), target: '_blank', rel: 'noopener'}, 'WhatsApp'));
}
function listo(enlaces) {
  const S = E.sobre;
  const otros = enlaces.filter(x => !x.firmado);
  if (!otros.length) { aviso('Firmado. Preparando tu documento…'); return abrir(S.id); }
  const todosCorreo = otros.every(x => x.correo_enviado);
  pantalla(el('div', {class: 'tarjeta', style: {display: 'grid', gap: '16px', textAlign: 'center'}},
    el('div', {class: 'ok-circulo'}, '✓'),
    el('h1', {}, '¡Enviado!'),
    el('p', {class: 'tenue'}, todosCorreo ? 'Le mandamos un correo a cada persona con su enlace para firmar.'
      : 'Manda a cada persona su enlace. Es personal: cada quien firma con el suyo.'),
    el('div', {style: {textAlign: 'left'}}, ...enlaces.map((x, i) => el('div', {class: 'persona-estado'},
      avatar(x, i, x.firmado), el('div', {}, el('b', {}, x.nombre), el('div', {class: 'tenue chico'}, x.firmado ? 'Ya firmaste ✓' : x.correo_enviado ? 'Correo enviado ✓' : x.correo || 'Sin correo')),
      x.firmado ? '' : compartir(x, x.url)))),
    el('p', {class: 'tenue chico'}, 'Te avisaremos aquí cuando firmen. Cuando firme la última persona, tus documentos firmados quedan listos para descargar.'),
    el('div', {class: 'fila', style: {justifyContent: 'center'}},
      el('button', {onclick: () => abrir(S.id)}, 'Ver el envío'), el('button', {class: 'primario', onclick: inicio}, 'Listo'))));
}

/* ───────── detalle ───────── */
async function detalle() {
  const S = E.sobre;
  const n = S.firmantes.filter(f => f.estado === 'firmado').length, t = S.firmantes.length;
  const [txt, cls] = resumen(S);
  const estadoPersona = f => f.estado === 'firmado' ? ['Firmó · ' + fecha(f.firmado), 'ok'] : f.estado === 'rechazado' ? ['No quiso firmar', 'mal'] :
    f.estado === 'abierto' ? ['Lo abrió · ' + fecha(f.abierto) + ' · aún no firma', 'espera'] : ['Todavía no lo abre', ''];

  const descargas = S.estado === 'completo' ? el('div', {style: {display: 'grid', gap: '10px', justifyItems: 'start'}},
    el('a', {class: 'boton primario grande', href: S.docs.length === 1 && !esWord(S.docs[0]) ? `api.php?a=pdf&id=${S.id}&doc=${S.docs[0].id}&final=1&bajar=1` : `api.php?a=zip&id=${S.id}`},
      '↓ Descargar ' + (S.docs.length === 1 ? (esWord(S.docs[0]) ? 'el Word y el PDF firmados' : 'el documento firmado') : `los ${S.docs.length} documentos firmados`)),
    S.docs.length > 1 || S.docs.some(esWord) ? el('div', {class: 'fila chico'}, S.docs.length > 1 ? 'O uno por uno:' : 'Por separado:', ...S.docs.flatMap(d => esWord(d)
      ? [el('a', {href: `api.php?a=pdf&id=${S.id}&doc=${d.id}&final=1&bajar=1`}, sinPdf(d.nombre) + ' (Word)'), el('a', {href: `api.php?a=pdf&id=${S.id}&doc=${d.id}&final=1&formato=pdf&bajar=1`}, sinPdf(d.nombre) + ' (PDF)')]
      : [el('a', {href: `api.php?a=pdf&id=${S.id}&doc=${d.id}&final=1&bajar=1`}, sinPdf(d.nombre))])) : '') : '';

  const ver = el('button', {}, 'Ver documentos');
  const hojas = el('div', {class: 'hojas oculto', id: 'hojas'});
  ver.onclick = async () => {
    const abierto = !hojas.classList.toggle('oculto');
    ver.textContent = abierto ? 'Ocultar documentos' : 'Ver documentos';
    if (abierto && !hojas.childElementCount) await pintarDetalle(hojas);
  };

  pantalla(
    el('div', {class: 'fila'}, el('button', {class: 'enlace', onclick: inicio}, '← Volver')),
    el('div', {class: 'tarjeta', style: {display: 'grid', gap: '14px'}},
      el('div', {class: 'fila'}, el('h1', {class: 'crece'}, S.titulo), el('span', {class: 'estado ' + cls}, txt)),
      el('p', {class: 'tenue chico'}, `${plural(S.docs.length, 'documento', 'documentos')}: ${S.docs.map(d => sinPdf(d.nombre)).join(', ')} · enviado ${fecha(S.enviado)}`),
      S.observadores?.length ? el('p', {class: 'tenue chico'}, 'También reciben avisos: ' + S.observadores.map(o => o.correo).join(', ')) : '',
      el('div', {}, el('div', {class: 'fila chico', style: {marginBottom: '6px'}}, el('b', {}, `${n} de ${t} firmaron`)), el('div', {class: 'avance'}, el('i', {style: {width: (n / t * 100) + '%'}}))),
      S.estado === 'firmado' ? el('p', {class: 'verde', id: 'preparando'}, 'Firmaron todos. Preparando tus documentos firmados…') : '',
      S.estado === 'rechazado' ? el('p', {class: 'rojo'}, 'Alguien no quiso firmar, así que el envío se detuvo. Corrige el documento y manda uno nuevo.') : '',
      descargas),
    el('div', {class: 'tarjeta'}, el('h2', {style: {marginBottom: '6px'}}, 'Personas'),
      ...S.firmantes.map((f, i) => {
        const [et, c] = estadoPersona(f);
        const pendiente = S.estado === 'enviado' && f.estado !== 'firmado' && f.url;
        return el('div', {class: 'persona-estado'}, avatar(f, i, f.estado === 'firmado'),
          el('div', {}, el('b', {}, f.nombre), el('div', {}, el('span', {class: 'estado ' + c}, et)),
            f.rechazo?.motivo ? el('div', {class: 'rojo chico'}, '«' + f.rechazo.motivo + '»') : ''),
          pendiente ? compartir(f, f.url) : '');
      })),
    el('div', {class: 'fila'}, ver, el('span', {class: 'crece'}),
      ['enviado', 'firmado', 'rechazado'].includes(S.estado) && S.estado !== 'firmado' ? el('button', {class: 'enlace peligro', onclick: cancelar}, 'Cancelar este envío') : '',
      S.estado === 'anulado' ? el('button', {class: 'enlace peligro', onclick: borrar}, 'Eliminar') : ''),
    hojas,
    el('details', {class: 'tarjeta'}, el('summary', {}, 'Historial'),
      el('div', {class: 'historial'}, ...[...S.eventos].reverse().map(e => el('div', {}, `${fecha(e.t)} · ${e.quien === 'tú' ? 'Tú' : e.quien} ${e.que}`)))));

  if (S.estado === 'firmado') generarFinal();
}

async function pintarDetalle(h) {
  const S = E.sobre, cont = el('div', {class: 'paginas'});
  h.replaceChildren(cont);
  const ancho = Math.min(820, h.clientWidth - 28);
  const final = S.estado === 'completo' && S.final?.length;
  for (const d of S.docs) {
    if (esWord(d)) { const m = await montarDocx(cont, await bytesDe(d), d, ancho); E.cajas[d.id] = m.cajas; continue; } // Word: el original con las firmas encima
    const pdf = await pdfDe(d, final);
    const doc = final ? {...d, paginas: await medidas(pdf)} : d;
    pintarPaginas(cont, pdf, doc, ancho).forEach(x => x.classList.add('solo'));
  }
  pintarCampos(true, !!final);
}

async function cancelar() {
  if (!confirm('¿Cancelar este envío? Los enlaces dejarán de funcionar.')) return;
  await api('anular', {datos: {id: E.sobre.id}}); aviso('Envío cancelado'); abrir(E.sobre.id);
}

/** Estampa las firmas en cada PDF, agrega la constancia y los sube. Se hace solo al abrir un envío ya firmado por todos. */
async function generarFinal() {
  const S = E.sobre;
  try {
    await prepararFinal(S);
    aviso('¡Tus documentos firmados están listos!');
    abrir(S.id);
  } catch (e) {
    const p = $('#preparando');
    if (p) { p.className = 'rojo'; p.replaceChildren('No se pudieron preparar los documentos: ' + e.message + ' ', el('button', {class: 'enlace', onclick: () => abrir(S.id)}, 'Reintentar')); }
  }
}
async function prepararFinal(S) {
  {
    const url = (E.ajustes?.url || E.ajustes?.url_detectada || location.origin) + '/verificar.html';
    const imgs = {};
    for (const f of S.firmantes) for (const [tipo, im] of Object.entries(f.imagenes || {})) {
      const r = await fetch(`api.php?a=img&id=${S.id}&n=${encodeURIComponent(im.archivo)}`, {credentials: 'same-origin'});
      if (!r.ok) throw new Error('no se pudo leer la firma de ' + f.nombre);
      const bytes = new Uint8Array(await r.arrayBuffer());
      const bmp = await createImageBitmap(new Blob([bytes]));
      imgs[f.id + '-' + tipo] = {bytes, tipo: im.archivo.endsWith('.png') ? 'png' : 'jpg', ancho: bmp.width, alto: bmp.height};
    }
    const form = new FormData();
    form.append('id', S.id);
    if (E.ses.correo) form.append('avisar', '1');
    for (const d of S.docs) {
      const r = await fetch(`api.php?a=pdf&id=${S.id}&doc=${d.id}`, {credentials: 'same-origin'});
      const original = await r.arrayBuffer();
      if (await sha256hex(original) !== d.sha256) throw new Error(sinPdf(d.nombre) + ': el original no coincide con el que se envió');
      if (esWord(d)) {
        form.append('f_' + d.id, new Blob([await estamparDocx({original: original.slice(0), sobre: S, doc: d, imgs, urlVerificar: url})]), d.id + '.docx');
        form.append('f_' + d.id + '_pdf', new Blob([await respaldoPdf(S, d, original, imgs, url)], {type: 'application/pdf'}), d.id + '.pdf');
        continue;
      }
      form.append('f_' + d.id, new Blob([await estampar({original, sobre: S, doc: d, imgs, urlVerificar: url})], {type: 'application/pdf'}), d.id + '.pdf');
    }
    await api('final', {form});
    Object.keys(E.pdfs).filter(k => k.endsWith('F')).forEach(k => delete E.pdfs[k]);
  }
}

/** PDF de respaldo de un Word: la vista del documento con las firmas puestas, más la constancia. */
async function respaldoPdf(S, d, original, imgs, url) {
  const caja = el('div', {style: {position: 'fixed', left: '-20000px', top: '0', width: '900px', background: '#fff'}});
  document.body.append(caja);
  try {
    const {hoja, cajas} = await montarDocx(caja, original.slice(0), d, 5000);
    hoja.parentElement.querySelector('.docx-titulo')?.remove();
    const fs = Object.fromEntries(S.firmantes.map(f => [f.id, f]));
    const urls = {};
    for (const c of S.campos.filter(c => c.doc === d.id)) {
      const f = fs[c.firmante], cj = cajas[c.marca]; if (!f || !cj) continue;
      const b = cajaCampo(cj, c.tipo);
      const cd = el('div', {style: {position: 'absolute', left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px'}});
      hoja.append(cd);
      if (c.tipo === 'firma' || c.tipo === 'iniciales') {
        const im = imgs[f.id + '-' + c.tipo]; if (!im) continue;
        const u = urls[f.id + c.tipo] ||= await new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(new Blob([im.bytes], {type: im.tipo === 'png' ? 'image/png' : 'image/jpeg'})); });
        const img = colocarFirma(cd, u, f.ajustes?.[c.tipo] || {escala: 1, dx: 0, dy: 0});
        await img.decode().catch(() => {}); colocarFirma(cd, u, f.ajustes?.[c.tipo] || {escala: 1, dx: 0, dy: 0});
      } else {
        const v = c.tipo === 'fecha' ? f.fecha_texto : c.tipo === 'nombre' ? f.nombre : f.textos?.[c.id];
        if (v) { cd.style.cssText += `;display:flex;align-items:flex-end;font:${cj.fsPx}px 'Times New Roman',serif;background:#fff;padding:0 2px`; cd.textContent = v; }
      }
    }
    const {base, paginas} = await pdfDeVista(hoja, {sobre: S, doc: d, urlVerificar: url});
    const doc = {...d, paginas: Array(paginas).fill({w: 612, h: 792})};
    return estampar({original: base, sobre: {...S, campos: []}, doc, imgs, urlVerificar: url});
  } finally { caja.remove(); }
}

/* ───────── mi firma (PNG) ───────── */
E.firmaV = Date.now();
function filaMiFirma() {
  const caja = el('div', {class: 'fila', style: {gap: '8px'}});
  if (E.ajustes?.tiene_firma) caja.append(
    el('img', {src: 'api.php?a=mi_firma&v=' + E.firmaV, alt: 'tu firma', style: {height: '38px', maxWidth: '130px', objectFit: 'contain', background: '#fafaf8', borderRadius: '8px', padding: '2px 6px'}}),
    el('span', {class: 'chico verde'}, 'Firmas al enviar'), el('button', {class: 'enlace chico', onclick: pedirMiFirma}, 'Cambiar'));
  else caja.append(el('button', {class: 'primario', onclick: pedirMiFirma}, 'Subir mi firma (PNG)'));
  return caja;
}
function pedirMiFirma() {
  const archivo = el('input', {type: 'file', accept: 'image/png', class: 'oculto'});
  const vista = el('div', {style: {minHeight: '120px', display: 'grid', placeItems: 'center', background: '#fafaf8', border: '2px dashed var(--linea)', borderRadius: '12px', cursor: 'pointer', padding: '10px', textAlign: 'center'},
    onclick: () => archivo.click()}, E.ajustes?.tiene_firma ? el('img', {src: 'api.php?a=mi_firma&v=' + E.firmaV, style: {maxHeight: '110px', maxWidth: '90%'}}) :
    el('div', {}, el('b', {}, 'Toca para elegir tu firma en PNG'), el('div', {class: 'tenue chico'}, 'De preferencia con fondo transparente.')));
  let dato = null;
  const guardarB = el('button', {class: 'primario', disabled: true}, 'Guardar mi firma');
  archivo.onchange = async () => {
    try { dato = await pngReducido(archivo.files[0]); vista.replaceChildren(el('img', {src: dato, style: {maxHeight: '110px', maxWidth: '90%'}})); guardarB.disabled = false; }
    catch (e) { aviso(e.message, true); }
  };
  const v = dialogo('Tu firma', [
    el('p', {class: 'tenue'}, 'Súbela una vez. Cuando estés entre quienes firman, se pone sola en tus lugares al enviar, sin que tengas que abrir ningún enlace.'),
    vista, archivo,
    el('div', {class: 'fila'}, E.ajustes?.tiene_firma ? el('button', {class: 'enlace peligro', onclick: async () => {
      await api('mi_firma', {datos: {img: ''}}); E.ajustes.tiene_firma = false; E.firmaV = Date.now(); v.remove(); E.repintar?.(); pintarSiHay(); aviso('Firma quitada');
    }}, 'Quitar mi firma') : '', el('span', {class: 'crece'}), guardarB)]);
  guardarB.onclick = async () => {
    try { await api('mi_firma', {datos: {img: dato}}); E.ajustes.tiene_firma = true; E.firmaV = Date.now(); v.remove(); E.repintar?.(); pintarSiHay(); aviso('Firma guardada'); }
    catch (e) { aviso(e.message, true); }
  };
}
function pintarSiHay() { if (E.sobre?.estado === 'borrador') pintarCampos(); }
async function pngReducido(a) {
  if (!a || a.type !== 'image/png') throw new Error('Elige un archivo PNG');
  const bmp = await createImageBitmap(a);
  const k = Math.min(1, 1200 / bmp.width, 600 / bmp.height);
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

/* ───────── ajustes ───────── */
async function verAjustes() {
  const a = E.ajustes = await api('ajustes');
  const campo = (k, et, props = {}, ayuda = '') => {
    const i = el('input', {value: a[k] ?? '', ...props}); i.dataset.k = k;
    return el('label', {}, el('div', {class: 'chico', style: {fontWeight: 600, marginBottom: '6px'}}, et), i, ayuda ? el('div', {class: 'tenue chico', style: {marginTop: '4px'}}, ayuda) : '');
  };
  const activo = el('input', {type: 'checkbox', checked: !!a.correo_activo});
  const correoExtra = el('div', {style: {display: 'grid', gap: '12px'}},
    campo('correo_desde', 'Correo remitente', {type: 'email', placeholder: 'firmas@tudominio.com'}, 'Usa una cuenta de tu mismo dominio para que no caiga en spam.'),
    el('button', {style: {justifySelf: 'start'}, onclick: async () => {
      if (!await guardarA()) return;
      const r = await api('prueba_correo');
      aviso(r.ok ? 'Correo de prueba enviado. Revisa tu bandeja (y el spam).' : 'Tu hosting no aceptó el correo', !r.ok);
    }}, 'Mandarme un correo de prueba'));
  const sync = () => correoExtra.classList.toggle('oculto', !activo.checked);
  activo.onchange = sync; sync();
  const ca = el('input', {type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña actual'});
  const cn = el('input', {type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva'});
  const v = dialogo('Ajustes', [
    campo('mi_nombre', 'Tu nombre', {placeholder: 'Como aparecerá al pedir firmas'}),
    campo('aviso_a', 'Avísame a estos correos', {placeholder: 'tu@correo.com, otra@persona.com'}, 'Cuando alguien firma, cuando firman todos o cuando alguien no quiere firmar. Puedes poner varios, separados por comas: reciben el aviso de todos tus envíos, con el enlace a tu panel.'),
    el('div', {}, el('div', {class: 'chico', style: {fontWeight: 600, marginBottom: '6px'}}, 'Tu firma'),
      el('div', {class: 'fila'}, a.tiene_firma ? el('img', {src: 'api.php?a=mi_firma&v=' + E.firmaV, style: {height: '44px', maxWidth: '160px', objectFit: 'contain'}}) : el('span', {class: 'tenue chico'}, 'Aún no la subes.'),
        el('button', {onclick: () => { v.remove(); pedirMiFirma(); }}, a.tiene_firma ? 'Cambiar' : 'Subir PNG'))),
    el('label', {class: 'casilla'}, activo, el('span', {}, 'Mandar los enlaces por correo automáticamente',
      el('div', {class: 'tenue chico'}, 'Si lo apagas, tú compartes los enlaces (por WhatsApp, por ejemplo).'))),
    correoExtra,
    el('details', {}, el('summary', {}, 'Cambiar contraseña'), el('div', {style: {display: 'grid', gap: '10px', marginTop: '10px'}}, ca, cn)),
    el('details', {}, el('summary', {}, 'Avanzado'), el('div', {style: {display: 'grid', gap: '12px', marginTop: '10px'}},
      campo('correo_nombre', 'Nombre del remitente en los correos'),
      campo('url', 'Dirección pública', {placeholder: a.url_detectada}, 'Déjala vacía para usar: ' + a.url_detectada),
      campo('zona', 'Zona horaria', {placeholder: 'America/Mexico_City'}))),
    el('div', {class: 'fila'}, el('button', {class: 'enlace', onclick: acercaDe}, 'Acerca de Rubrikas ' + E.ses.version), el('span', {class: 'crece'}),
      el('button', {class: 'primario', onclick: async () => { if (await guardarA()) { v.remove(); aviso('Guardado'); } }}, 'Guardar'))]);
  async function guardarA() {
    const d = {correo_activo: activo.checked};
    $$('input[data-k]', v).forEach(i => d[i.dataset.k] = i.value);
    if (cn.value) { d.clave_actual = ca.value; d.clave_nueva = cn.value; }
    try { E.ajustes = await api('ajustes', {datos: d}); E.ses.correo = !!E.ajustes.correo_activo; return true; }
    catch (e) { aviso(e.message, true); return false; }
  }
}

arrancar().catch(e => aviso(e.message, true));
