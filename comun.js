/*
 * Rubrikas · funciones compartidas del panel, la firma y la verificación
 * Parte de la colección Alchemy of Meaning (Alquimia del Significado).
 * © 2026 Héctor Cruz Juárez · https://hectorcruz.com.mx
 * Software libre bajo licencia GPL-3.0-or-later.
 */
export const VERSION = '0.7';
export const COLORES = ['#3d8b10', '#1f6fd1', '#d9622b', '#8a4fd1', '#b7791f', '#d6336c', '#138a7a', '#6b6b66'];
export const TIPOS = {firma: 'Firma', iniciales: 'Iniciales', fecha: 'Fecha', nombre: 'Nombre', texto: 'Texto'};
const ALTO_TIPO = {firma: 42, iniciales: 30, fecha: 18, nombre: 18, texto: 18};      // en puntos
const ANCHO_TIPO = {firma: 170, iniciales: 60, fecha: 90, nombre: 160, texto: 160};

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function el(tag, props = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) e.append(h instanceof Node ? h : document.createTextNode(String(h)));
  return e;
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

export const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#3d8b10"/><path d="M6 21c4-9 7-12 9-9s-3 9 1 7 5-9 8-8-1 7 3 5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const iniciales = n => (n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

/* ───── API ───── */
let csrf = '';
export function setCsrf(c) { csrf = c; }
export async function api(accion, {datos, form, metodo, params} = {}) {
  const q = new URLSearchParams({a: accion, ...(params || {})});
  const op = {method: metodo || (datos || form ? 'POST' : 'GET'), headers: {'X-Rubrikas': csrf}, credentials: 'same-origin'};
  if (datos) { op.body = JSON.stringify(datos); op.headers['Content-Type'] = 'application/json'; }
  if (form) op.body = form;
  const r = await fetch('api.php?' + q, op);
  let j = null;
  try { j = await r.json(); } catch { throw new Error('respuesta inesperada del servidor (' + r.status + ')'); }
  if (!r.ok || j?.error) { const e = new Error(j?.error || 'error ' + r.status); e.status = r.status; throw e; }
  return j;
}

/* ───── avisos y diálogos ───── */
let tAviso;
export function aviso(texto, error = false) {
  $('.aviso')?.remove();
  const a = el('div', {class: 'aviso' + (error ? ' error' : ''), role: 'status'}, texto);
  document.body.append(a);
  clearTimeout(tAviso);
  tAviso = setTimeout(() => a.remove(), error ? 6000 : 3000);
}
export function dialogo(titulo, cuerpo, {cerrar = true} = {}) {
  const v = el('div', {class: 'velo'});
  const x = el('button', {class: 'cerrar', onclick: () => v.remove(), 'aria-label': 'cerrar'}, '×');
  const w = el('div', {class: 'ventana', role: 'dialog', 'aria-label': titulo}, el('div', {class: 'titulo'}, el('span', {}, titulo), cerrar ? x : ''), el('div', {class: 'cuerpo'}, cuerpo));
  v.append(w);
  if (cerrar) v.addEventListener('mousedown', e => { if (e.target === v) v.remove(); });
  document.body.append(v);
  return v;
}
export function acercaDe() {
  dialogo('Rubrikas ' + VERSION, el('div', {class: 'acerca'},
    el('p', {}, 'Rubrikas es una herramienta para firmar documentos PDF en tu propio servidor: varios documentos, varios firmantes, con firma dibujada o en imagen y una hoja de constancia con la huella (SHA-256) de cada archivo.'),
    el('p', {}, 'Parte de la colección Alchemy of Meaning (Alquimia del Significado).'),
    el('p', {}, '© 2026 Héctor Cruz Juárez · ', el('a', {href: 'https://hectorcruz.com.mx', target: '_blank', rel: 'noopener'}, 'hectorcruz.com.mx')),
    el('p', {class: 'tenue'}, 'Software libre bajo licencia GPL-3.0-or-later. Usa pdf.js (Apache-2.0) y pdf-lib (MIT).'),
    el('p', {class: 'tenue'}, 'Una firma hecha aquí es una firma electrónica simple. Su peso como prueba depende de la constancia, la verificación del firmante y la ley aplicable. No sustituye a la e.firma ni a una constancia NOM-151.')));
}

/* ───── pdf.js ───── */
let pdfjs = null;
export async function pdfjsLib() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('./lib/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
export async function abrirPDF(fuente) {
  const lib = await pdfjsLib();
  const datos = fuente instanceof ArrayBuffer || ArrayBuffer.isView(fuente) ? {data: new Uint8Array(fuente).slice()} : {url: fuente, withCredentials: true};
  return lib.getDocument({...datos, isEvalSupported: false}).promise;
}
export async function medidas(pdf) {
  const r = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const v = p.getViewport({scale: 1});
    r.push({w: Math.round(v.width * 100) / 100, h: Math.round(v.height * 100) / 100, rot: p.rotate});
  }
  return r;
}

/**
 * Dibuja todas las páginas en un contenedor. Cada página es un div .pagina (con data-doc y data-p)
 * cuyo tamaño en CSS es proporcional; el canvas se rinde perezosamente al acercarse a la vista.
 */
export function pintarPaginas(contenedor, pdf, doc, ancho) {
  const obs = new IntersectionObserver(async ents => {
    for (const en of ents) {
      if (!en.isIntersecting) continue;
      const div = en.target; obs.unobserve(div);
      const p = await pdf.getPage(+div.dataset.p + 1);
      const v1 = p.getViewport({scale: 1});
      const escala = (div.clientWidth * Math.min(2, devicePixelRatio || 1)) / v1.width;
      const v = p.getViewport({scale: escala});
      const c = div.querySelector('canvas');
      c.width = Math.round(v.width); c.height = Math.round(v.height);
      await p.render({canvasContext: c.getContext('2d'), viewport: v}).promise;
    }
  }, {rootMargin: '800px'});
  const divs = [];
  doc.paginas.forEach((m, i) => {
    const w = Math.min(ancho, m.w * 1.6);
    const div = el('div', {class: 'pagina', 'data-doc': doc.id, 'data-p': i, style: {width: w + 'px', aspectRatio: m.w + ' / ' + m.h}},
      el('canvas'), el('span', {class: 'num'}, `${doc.nombre.replace(/\.pdf$/i, '')} · página ${i + 1} de ${doc.paginas.length}`));
    contenedor.append(div);
    obs.observe(div);
    divs.push(div);
  });
  return divs;
}

/* ───── detectar líneas para firmar ───── */
/** Busca renglones de guiones bajos («_____») y, si se pide, líneas horizontales dibujadas. Devuelve cajas normalizadas. */
export async function detectarLineas(pdf, {dibujadas = false} = {}) {
  const lib = await pdfjsLib();
  const r = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const v = p.getViewport({scale: 1});
    const lineas = [];
    const tc = await p.getTextContent();
    for (const it of tc.items) {
      const s = it.str || '';
      const re = /_{5,}/g; let m;
      while ((m = re.exec(s))) {
        const t = lib.Util.transform(v.transform, it.transform);
        if (Math.abs(t[1]) > 0.01 || Math.abs(t[2]) > 0.01 || t[0] <= 0) continue; // solo renglones derechos, como se ven
        const x0 = t[4], base = t[5];
        const ancho = it.width * v.scale;
        const fx = ancho / Math.max(1, s.length);
        lineas.push({x: x0 + m.index * fx, y: base, w: m[0].length * fx});
      }
    }
    if (dibujadas) {
      const ops = await p.getOperatorList();
      const O = lib.OPS; let ctm = [1, 0, 0, 1, 0, 0]; const pila = [];
      for (let k = 0; k < ops.fnArray.length; k++) {
        const f = ops.fnArray[k], a = ops.argsArray[k];
        if (f === O.save) pila.push(ctm.slice());
        else if (f === O.restore) ctm = pila.pop() || [1, 0, 0, 1, 0, 0];
        else if (f === O.transform) ctm = lib.Util.transform(ctm, a);
        else if (f === O.constructPath) {
          const mm = a[2]; if (!mm || mm.length < 4) continue;
          const a1 = lib.Util.transform(v.transform, ctm);
          const [x1, y1] = lib.Util.applyTransform([mm[0], mm[1]], a1);
          const [x2, y2] = lib.Util.applyTransform([mm[2], mm[3]], a1);
          const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
          if (h <= 2.5 && w >= 70 && w <= v.width * 0.6) lineas.push({x: Math.min(x1, x2), y: Math.max(y1, y2), w});
        }
      }
    }
    // une líneas casi iguales (texto y trazo en el mismo lugar)
    const unicas = [];
    for (const l of lineas) if (!unicas.some(u => Math.abs(u.x - l.x) < 8 && Math.abs(u.y - l.y) < 8)) unicas.push(l);
    for (const l of unicas) {
      const h = Math.min(ALTO_TIPO.firma, l.y - 4);
      if (h < 12) continue;
      r.push({pagina: i - 1, x: l.x / v.width, y: (l.y - h - 1) / v.height, w: l.w / v.width, h: h / v.height});
    }
  }
  return r;
}
export function cajaPorOmision(tipo, pagina) {
  return {w: ANCHO_TIPO[tipo] / pagina.w, h: ALTO_TIPO[tipo] / pagina.h};
}

/* ───── tamaño y posición de la firma dentro de su lugar ───── */
/** escala sobre «cabe en el recuadro»; dx en anchos del recuadro; dy = cuánto baja la base bajo la línea, en altos del recuadro. */
export const AJUSTE0 = {escala: 1, dx: 0, dy: 0.18};
export const ajusteLimpio = a => ({
  escala: Math.max(.3, Math.min(3, +a?.escala || 1)),
  dx: Math.max(-1.5, Math.min(1.5, +a?.dx || 0)),
  dy: Math.max(-1.5, Math.min(1.5, a?.dy === undefined ? AJUSTE0.dy : +a.dy || 0))});
/** Rectángulo de la firma (x, y desde arriba a la izquierda del recuadro), en las mismas unidades que bw y bh. */
export function cajaFirma(bw, bh, iw, ih, aj) {
  const a = ajusteLimpio(aj);
  const k = Math.min(bw / iw, bh * 1.35 / ih) * a.escala; // una firma puede ser un poco más alta que su renglón
  const w = iw * k, h = ih * k;
  return {w, h, x: bw / 2 + a.dx * bw - w / 2, y: bh + a.dy * bh - h};
}
/** Pone la imagen de la firma dentro de un recuadro de la página (puede salirse de él). */
export function colocarFirma(cd, src, aj, alt = 'firma') {
  let img = cd.querySelector('img.firma-aj');
  if (!img) { img = el('img', {class: 'firma-aj', alt, draggable: 'false'}); cd.append(img); }
  const poner = () => {
    if (!img.naturalWidth || !cd.clientWidth) return;
    const r = cajaFirma(cd.clientWidth, cd.clientHeight, img.naturalWidth, img.naturalHeight, aj);
    Object.assign(img.style, {left: r.x / cd.clientWidth * 100 + '%', top: r.y / cd.clientHeight * 100 + '%',
      width: r.w / cd.clientWidth * 100 + '%', height: r.h / cd.clientHeight * 100 + '%'});
  };
  if (img.getAttribute('src') !== src) { img.onload = poner; img.src = src; } else poner();
  return img;
}

/* ───── estampar el PDF final con pdf-lib ───── */
export async function sha256hex(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function limpio(font, s) { // Helvetica solo tiene Windows-1252: cambia lo que no se puede escribir
  let r = '';
  for (const ch of String(s ?? '').replace(/[→⇒]/g, '·').replace(/\s+/g, ' ')) {
    try { font.widthOfTextAtSize(ch, 10); r += ch; } catch { r += '?'; }
  }
  return r;
}
function cortar(font, texto, tam, ancho) {
  const palabras = texto.split(' '), lineas = []; let l = '';
  for (const p of palabras) {
    const prueba = l ? l + ' ' + p : p;
    if (font.widthOfTextAtSize(prueba, tam) <= ancho) l = prueba;
    else {
      if (l) lineas.push(l);
      l = p;
      while (font.widthOfTextAtSize(l, tam) > ancho && l.length > 1) { // palabra larguísima (hash): parte a la fuerza
        let k = l.length; while (k > 1 && font.widthOfTextAtSize(l.slice(0, k), tam) > ancho) k--;
        lineas.push(l.slice(0, k)); l = l.slice(k);
      }
    }
  }
  if (l) lineas.push(l);
  return lineas;
}
const fechaLarga = iso => iso ? new Date(iso).toLocaleString('es-MX', {dateStyle: 'long', timeStyle: 'medium'}) + ' (' + iso.slice(19) + ')' : '—';
const navegador = ua => {
  if (!ua) return '—';
  const so = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'otro sistema';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${nav} en ${so}`;
};

/**
 * Estampa las firmas de un documento y agrega la hoja de constancia.
 * imgs: { 'fid-firma': {bytes, tipo:'png'|'jpg'} }
 */
export async function estampar({original, sobre, doc, imgs, urlVerificar}) {
  const {PDFDocument, StandardFonts, rgb, degrees} = window.PDFLib;
  const pdf = await PDFDocument.load(original, {ignoreEncryption: false, updateMetadata: false});
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cache = {};
  const imagen = async k => {
    if (cache[k]) return cache[k];
    const im = imgs[k]; if (!im) return null;
    return cache[k] = im.tipo === 'png' ? await pdf.embedPng(im.bytes) : await pdf.embedJpg(im.bytes);
  };
  const firmantes = Object.fromEntries(sobre.firmantes.map(f => [f.id, f]));
  const paginas = pdf.getPages();

  for (const c of sobre.campos.filter(c => c.doc === doc.id)) {
    const pg = paginas[c.pagina]; if (!pg) continue;
    const f = firmantes[c.firmante]; if (!f || f.estado !== 'firmado') continue;
    const caja = pg.getCropBox();
    const rot = ((pg.getRotation().angle % 360) + 360) % 360;
    const W = caja.width, H = caja.height;
    const DW = rot % 180 ? H : W, DH = rot % 180 ? W : H; // tamaño tal como se ve
    // punto visto (u,v desde arriba a la izquierda, 0–1) → coordenadas de la página sin rotar
    const mapa = (u, v) => {
      if (rot === 90) return [caja.x + v * W, caja.y + u * H];
      if (rot === 180) return [caja.x + (1 - u) * W, caja.y + v * H];
      if (rot === 270) return [caja.x + (1 - v) * W, caja.y + (1 - u) * H];
      return [caja.x + u * W, caja.y + (1 - v) * H];
    };
    const cw = c.w * DW, ch = c.h * DH;
    if (c.tipo === 'firma' || c.tipo === 'iniciales') {
      const im = await imagen(f.id + '-' + c.tipo); if (!im) continue;
      const aj = f.ajustes?.[c.tipo];
      let u, v, iw, ih;
      if (aj) { // tamaño y posición que eligió quien firma; la base puede morder la línea
        const r = cajaFirma(cw, ch, im.width, im.height, aj);
        iw = r.w; ih = r.h; u = c.x + r.x / DW; v = c.y + (r.y + r.h) / DH;
      } else { // firmas anteriores a 0.5: centrada dentro del recuadro
        const k = Math.min(cw / im.width, ch / im.height);
        iw = im.width * k; ih = im.height * k;
        u = c.x + (cw - iw) / 2 / DW; v = c.y + c.h - (ch - ih) / 2 / DH;
      }
      const [x, y] = mapa(u, v);
      pg.drawImage(im, {x, y, width: iw, height: ih, rotate: degrees(rot)});
    } else {
      const texto = limpio(fuente, c.tipo === 'fecha' ? f.fecha_texto : c.tipo === 'nombre' ? f.nombre : (f.textos?.[c.id] ?? ''));
      if (!texto) continue;
      let tam = Math.min(11, ch * 0.72);
      while (tam > 5 && fuente.widthOfTextAtSize(texto, tam) > cw - 4) tam -= 0.5;
      const [x, y] = mapa(c.x + 2 / DW, c.y + c.h - (ch - tam * 0.72) / 2 / DH);
      pg.drawText(texto, {x, y, size: tam, font: fuente, color: rgb(0, 0, 0), rotate: degrees(rot)});
    }
  }

  /* hoja de constancia */
  const M = 50, AN = 612, AL = 792, ancho = AN - 2 * M;
  let pg = pdf.addPage([AN, AL]), y = AL - M;
  const gris = rgb(.38, .38, .38), negro = rgb(0, 0, 0);
  const nueva = () => { pie(); pg = pdf.addPage([AN, AL]); y = AL - M; };
  const pie = () => {
    const t = limpio(fuente, `Rubrikas ${VERSION} · Alchemy of Meaning (Alquimia del Significado) · constancia del sobre ${sobre.id}`);
    pg.drawText(t, {x: M, y: 28, size: 7, font: fuente, color: gris});
  };
  const texto = (t, {tam = 9, f = fuente, color = negro, sangria = 0, despues = 3} = {}) => {
    for (const l of cortar(f, limpio(f, t), tam, ancho - sangria)) {
      if (y < M + 20) nueva();
      pg.drawText(l, {x: M + sangria, y: y - tam, size: tam, font: f, color});
      y -= tam * 1.35;
    }
    y -= despues;
  };
  let der = 0; // espacio reservado a la derecha (miniatura de la firma)
  const par = (et, val, sangria = 0) => {
    const e = limpio(negrita, et + ': ');
    const ew = negrita.widthOfTextAtSize(e, 8.5);
    const lin = cortar(fuente, limpio(fuente, val), 8.5, ancho - sangria - ew - der);
    lin.forEach((l, i) => {
      if (y < M + 20) nueva();
      if (i === 0) pg.drawText(e, {x: M + sangria, y: y - 8.5, size: 8.5, font: negrita, color: negro});
      pg.drawText(l, {x: M + sangria + ew, y: y - 8.5, size: 8.5, font: fuente, color: negro});
      y -= 11.5;
    });
  };
  const raya = () => { if (y < M + 30) nueva(); pg.drawLine({start: {x: M, y}, end: {x: AN - M, y}, thickness: .6, color: gris}); y -= 10; };

  texto('Constancia de firma electrónica', {tam: 16, f: negrita, despues: 2});
  texto('Esta hoja forma parte del documento y registra quién lo firmó, cuándo y cómo.', {tam: 9, color: gris, despues: 8});
  raya();
  par('Sobre', `${sobre.titulo} (${sobre.id})`);
  par('Documento', `${doc.nombre} · ${doc.paginas.length} página${doc.paginas.length === 1 ? '' : 's'} sin contar esta constancia`);
  par('Huella del original (SHA-256)', doc.sha256);
  par('Enviado', fechaLarga(sobre.enviado));
  const ult = sobre.firmantes.map(f => f.firmado).filter(Boolean).sort().pop();
  par('Última firma', fechaLarga(ult));
  par('Orden de firma', sobre.orden ? 'sí, uno tras otro' : 'no, en cualquier orden');
  y -= 6; raya();

  for (const f of sobre.firmantes) {
    if (y < M + 150) nueva();
    texto(f.nombre, {tam: 11, f: negrita, despues: 1});
    const im = await imagen(f.id + '-firma') || await imagen(f.id + '-iniciales');
    const y0 = y;
    const s = 16;
    der = im ? 160 : 0;
    if (f.correo) par('Correo', f.correo, s);
    par('Verificación', f.via === 'panel' ? 'firmó desde el panel de quien envía, con su contraseña' : f.verificado ? `código enviado a su correo, confirmado el ${fechaLarga(f.verificado)}` : 'enlace personal enviado a su nombre', s);
    const met = Object.entries(f.imagenes || {}).map(([k, v]) => `${k} ${v.metodo === 'imagen' ? 'desde una imagen' : k === 'iniciales' ? 'dibujadas' : 'dibujada'}`).join(', ');
    par('Forma de firma', met || '—', s);
    if (f.via !== 'panel') par('Abrió el enlace', fechaLarga(f.abierto), s);
    par('Firmó', fechaLarga(f.firmado), s);
    par('IP', f.ip || '—', s);
    par('Navegador', navegador(f.ua), s);
    for (const [k, v] of Object.entries(f.imagenes || {})) par(k === 'iniciales' ? 'Huella de las iniciales' : 'Huella de la firma', v.sha256, s);
    par('Declaración aceptada', f.acepto || '—', s);
    if (im) { // miniatura de la firma, a la derecha
      const k = Math.min(140 / im.width, 46 / im.height);
      pg.drawRectangle({x: AN - M - 150, y: y0 - 56, width: 150, height: 54, borderColor: gris, borderWidth: .5});
      pg.drawImage(im, {x: AN - M - 75 - im.width * k / 2, y: y0 - 29 - im.height * k / 2, width: im.width * k, height: im.height * k});
    }
    der = 0;
    y -= 6; raya();
  }

  texto('Bitácora', {tam: 11, f: negrita, despues: 2});
  for (const e of sobre.eventos || []) texto(`${fechaLarga(e.t)} · ${e.quien} · ${e.que}${e.ip ? ' · IP ' + e.ip : ''}`, {tam: 7.5, despues: 0});
  y -= 8;
  texto('Cómo verificar', {tam: 11, f: negrita, despues: 2});
  texto(`La huella SHA-256 de este archivo final queda registrada en el servidor. Para comprobar que nadie lo modificó después de firmarse, arrástralo a ${urlVerificar}. El archivo se revisa en tu navegador y no se sube.`, {tam: 8.5});
  texto('Firma electrónica simple. Su valor como prueba depende de esta constancia, de la verificación de cada firmante y de la ley aplicable.', {tam: 7.5, color: gris});
  pie();

  pdf.setProducer(`Rubrikas ${VERSION} · Alchemy of Meaning (Alquimia del Significado)`);
  pdf.setModificationDate(new Date());
  pdf.setKeywords(['firmado', sobre.id]);
  return pdf.save({useObjectStreams: true});
}
