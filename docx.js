/*
 * Rubrikas · documentos de Word (DOCX)
 * Las firmas van ancladas a su línea («_______» largo) o a una etiqueta escrita en Word:
 *   {firma Nombre}  {iniciales Nombre}  {fecha Nombre}  {nombre Nombre}  {texto Nombre}
 * Así, si Word recorre el texto, la firma se mueve con él.
 * Parte de la colección Alchemy of Meaning (Alquimia del Significado).
 * © 2026 Héctor Cruz Juárez · https://hectorcruz.com.mx
 * Software libre bajo licencia GPL-3.0-or-later.
 */
import {cajaFirma, estampar} from './comun.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS = {
  w: W, r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main', pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture'};
export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const RE_MARCA = () => /_{15,}|\{\s*(firma|iniciales|fecha|nombre|texto)\b([^{}]*)\}/gi;
const EMU = 12700; // por punto
const XMLNS = 'http://www.w3.org/XML/1998/namespace';

/* ───── librerías (solo se cargan si hay un DOCX) ───── */
const scripts = {};
function script(src) {
  return scripts[src] ||= new Promise((ok, mal) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('no se pudo cargar ' + src));
    document.head.append(s);
  });
}
export async function libs({captura = false} = {}) {
  await script('lib/jszip.min.js');
  await script('lib/docx-preview.min.js');
  if (captura) await script('lib/html2canvas.min.js');
}
export const esDocx = nombre => /\.docx$/i.test(nombre || '');

/* ───── párrafos y marcas en el XML ───── */
function parrafos(doc) {
  return [...doc.getElementsByTagNameNS(W, 'p')].filter(p => {
    for (let n = p.parentNode; n; n = n.parentNode) if (n.localName === 'txbxContent' || n.localName === 'Fallback') return false;
    return true;
  });
}
function textos(p) { // los w:t del párrafo, en orden, con su posición en el texto unido
  let pos = 0;
  return [...p.getElementsByTagNameNS(W, 't')].map(t => { const ini = pos; pos += t.textContent.length; return {t, ini, fin: pos}; });
}
function tamanoLetra(t, porOmision) {
  const r = t.parentNode; const sz = r?.getElementsByTagNameNS?.(W, 'sz')[0];
  const v = sz && +sz.getAttributeNS(W, 'val');
  return v ? v / 2 : porOmision;
}
function letraPorOmision(estilos) {
  if (!estilos) return 11;
  const d = estilos.getElementsByTagNameNS(W, 'rPrDefault')[0];
  const sz = d?.getElementsByTagNameNS(W, 'sz')[0];
  const v = sz && +sz.getAttributeNS(W, 'val');
  return v ? v / 2 : 11;
}
/** Marcas del documento, en orden: [{k, p, ini, fin, tipo:'linea'|'etiqueta', etiqueta:{tipo, nombre}, fs, largo}] */
export function marcas(doc, estilos) {
  const fs0 = letraPorOmision(estilos), r = [];
  parrafos(doc).forEach((p, pi) => {
    const ts = textos(p); const s = ts.map(x => x.t.textContent).join('');
    const re = RE_MARCA(); let m;
    while ((m = re.exec(s))) {
      const t = ts.find(x => m.index >= x.ini && m.index < x.fin);
      r.push({k: r.length, p: pi, ini: m.index, fin: m.index + m[0].length, texto: m[0],
        tipo: m[1] ? 'etiqueta' : 'linea', etiqueta: m[1] ? {tipo: m[1].toLowerCase(), nombre: (m[2] || '').trim()} : null,
        fs: t ? tamanoLetra(t.t, fs0) : fs0, largo: m[0].length});
    }
  });
  return r;
}
async function leerZip(bytes) {
  const zip = await window.JSZip.loadAsync(bytes);
  const xml = async n => { const f = zip.file(n); return f ? new DOMParser().parseFromString(await f.async('string'), 'application/xml') : null; };
  return {zip, doc: await xml('word/document.xml'), estilos: await xml('word/styles.xml'), xml};
}
/** Para el panel al subir: lista de marcas del DOCX. */
export async function analizar(bytes) {
  await libs();
  const {doc, estilos} = await leerZip(bytes);
  if (!doc) throw new Error('no parece un documento de Word (.docx)');
  return marcas(doc, estilos).map(({k, tipo, etiqueta, fs, largo, texto}) => ({k, tipo, etiqueta, fs, largo, texto}));
}

/* ───── vista previa con marcas localizables ───── */
// Cada marca se señala con caracteres invisibles (U+2060 + bits en U+200B/U+200C) para hallarla en la página tal cual.
const sello = k => '⁠' + k.toString(2).replace(/0/g, '​').replace(/1/g, '‌') + '⁠';
const RE_SELLO = /⁠([​‌]+)⁠/g;

/** Dibuja el DOCX en `hoja` (div) y devuelve las cajas de sus marcas en píxeles, relativas a la hoja. */
export async function pintarDocx(hoja, bytes) {
  await libs();
  const {zip, doc, estilos} = await leerZip(bytes);
  const ms = marcas(doc, estilos);
  const ps = parrafos(doc);
  for (const m of [...ms].reverse()) { // sellar (de atrás hacia adelante para no mover posiciones)
    const ts = textos(ps[m.p]);
    const t = ts.find(x => m.ini >= x.ini && m.ini < x.fin);
    const i = m.ini - t.ini;
    let txt = t.t.textContent;
    if (m.tipo === 'etiqueta') { // la etiqueta no se ve: se cambia por espacios, igual que en el archivo final
      let resta = m.fin - m.ini;
      for (const x of ts.filter(x => x.fin > m.ini && x.ini < m.fin)) {
        const a = Math.max(m.ini, x.ini) - x.ini, b = Math.min(m.fin, x.fin) - x.ini, s = x.t.textContent;
        const cuantos = b - a; resta -= cuantos;
        x.t.textContent = s.slice(0, a) + ' '.repeat(cuantos) + s.slice(b);
        x.t.setAttributeNS(XMLNS, 'xml:space', 'preserve');
      }
      txt = t.t.textContent;
    }
    t.t.textContent = txt.slice(0, i) + sello(m.k) + txt.slice(i);
    t.t.setAttributeNS(XMLNS, 'xml:space', 'preserve');
  }
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  const sellado = await zip.generateAsync({type: 'arraybuffer'});
  hoja.replaceChildren();
  hoja.classList.add('docx-hoja');
  await window.docx.renderAsync(sellado, hoja, null, {
    className: 'dx', inWrapper: false, ignoreLastRenderedPageBreak: true, breakPages: true,
    renderHeaders: true, renderFooters: true, renderFootnotes: false, renderEndnotes: false, useBase64URL: true, experimental: false});
  // buscar los sellos en el texto pintado
  const cajas = {};
  const base = hoja.getBoundingClientRect();
  const nodos = []; const w = document.createTreeWalker(hoja, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) if (n.nodeValue.includes('⁠')) nodos.push(n);
  for (const n of nodos) {
    let mm; RE_SELLO.lastIndex = 0;
    const v = n.nodeValue; const quitar = [];
    while ((mm = RE_SELLO.exec(v))) quitar.push([mm.index, mm[0].length, parseInt(mm[1].replace(/​/g, '0').replace(/‌/g, '1'), 2)]);
    for (const [idx, len, k] of quitar.reverse()) {
      n.nodeValue = n.nodeValue.slice(0, idx) + n.nodeValue.slice(idx + len);
      const m = ms[k]; if (!m) continue;
      // rango: desde el sello hasta cubrir el largo de la marca (puede cruzar nodos)
      const r = document.createRange(); r.setStart(n, idx);
      let falta = m.largo, nodo = n, off = idx;
      while (nodo && falta > 0) {
        const libre = nodo.nodeValue.length - off;
        if (libre >= falta) { off += falta; falta = 0; break; }
        falta -= libre;
        const sig = siguienteTexto(nodo, hoja); if (!sig) { off = nodo.nodeValue.length; break; }
        nodo = sig; off = 0;
      }
      r.setEnd(nodo, Math.min(off, nodo.nodeValue.length));
      const rect = [...r.getClientRects()].filter(x => x.width > 0)[0] || r.getBoundingClientRect();
      const fsPx = parseFloat(getComputedStyle(n.parentElement).fontSize) || 16;
      cajas[k] = {k, tipo: m.tipo, etiqueta: m.etiqueta, fsPx,
        x: rect.left - base.left, w: Math.max(rect.width, m.tipo === 'etiqueta' ? fsPx * 9 : 40),
        base: rect.bottom - base.top - fsPx * 0.22};
    }
  }
  return {marcas: ms, cajas};
}
function siguienteTexto(n, raiz) {
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT); w.currentNode = n; return w.nextNode();
}
/** Recuadro de un campo sobre su marca (px). Firma e iniciales: arriba de la línea. Textos: en la línea. */
export function cajaCampo(caja, tipo) {
  const firma = tipo === 'firma' || tipo === 'iniciales';
  const h = caja.fsPx * (firma ? 3 : 1.5);
  return {x: caja.x, y: caja.base - h + (firma ? 0 : caja.fsPx * .35), w: tipo === 'iniciales' ? Math.min(caja.w, caja.fsPx * 5) : caja.w, h};
}

/* ───── estampar: el DOCX firmado ───── */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
function fragmento(doc, xml) { // XML suelto con todos los espacios de nombres → nodo importado
  const d = new DOMParser().parseFromString(`<x xmlns:w="${NS.w}" xmlns:r="${NS.r}" xmlns:wp="${NS.wp}" xmlns:a="${NS.a}" xmlns:pic="${NS.pic}">${xml}</x>`, 'application/xml');
  return [...d.documentElement.childNodes].map(n => doc.importNode(n, true));
}
/** Parte el párrafo para que haya un corte de run exactamente en `pos` (posición en el texto unido). */
function cortar(p, pos) {
  for (const {t, ini, fin} of textos(p)) {
    if (pos <= ini || pos >= fin) continue;
    const run = t.parentNode, nuevo = run.cloneNode(true);
    // en `run` queda todo hasta el corte; en `nuevo`, lo que sigue
    const hijos = [...run.childNodes], hijosN = [...nuevo.childNodes];
    const i = hijos.indexOf(t), off = pos - ini;
    hijos.forEach((h, j) => { if (j > i && h.localName !== 'rPr') run.removeChild(h); });
    hijosN.forEach((h, j) => { if (j < i && h.localName !== 'rPr') nuevo.removeChild(h); });
    const tn = hijosN[i];
    tn.textContent = t.textContent.slice(off); t.textContent = t.textContent.slice(0, off);
    t.setAttributeNS(XMLNS, 'xml:space', 'preserve'); tn.setAttributeNS(XMLNS, 'xml:space', 'preserve');
    run.parentNode.insertBefore(nuevo, run.nextSibling);
    return;
  }
}
function runsDe(p, ini, fin) {
  return [...new Set(textos(p).filter(x => x.ini >= ini && x.fin <= fin && x.fin > x.ini).map(x => x.t.parentNode))];
}
function dibujo({rid, id, cx, cy, flotante, x = 0, y = 0}) {
  const graf = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="firma${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>`;
  return flotante
    ? `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${251660000 + id}" behindDoc="0" locked="1" layoutInCell="0" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="character"><wp:posOffset>${Math.round(x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="line"><wp:posOffset>${Math.round(y)}</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="Firma ${id}"/><wp:cNvGraphicFramePr/>${graf}</wp:anchor></w:drawing></w:r>`
    : `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="Firma ${id}"/><wp:cNvGraphicFramePr/>${graf}</wp:inline></w:drawing></w:r>`;
}
const fechaLarga = iso => iso ? new Date(iso).toLocaleString('es-MX', {dateStyle: 'long', timeStyle: 'medium'}) : '—';

/**
 * Inserta firmas y textos en el DOCX, agrega la constancia y lo deja de solo lectura.
 * imgs: { 'fid-firma': {bytes, tipo:'png'|'jpg', ancho, alto} }
 */
export async function estamparDocx({original, sobre, doc: d, imgs, urlVerificar}) {
  await libs();
  const {zip, doc, estilos, xml} = await leerZip(original);
  const ms = marcas(doc, estilos), ps = parrafos(doc);
  const firmantes = Object.fromEntries(sobre.firmantes.map(f => [f.id, f]));
  const campos = sobre.campos.filter(c => c.doc === d.id && Number.isInteger(c.marca)).sort((a, b) => b.marca - a.marca);

  // imágenes en el paquete
  const rels = await xml('word/_rels/document.xml.rels');
  const tipos = await xml('[Content_Types].xml');
  const rid = {}; let n = 0;
  const relDe = (clave) => {
    if (rid[clave]) return rid[clave];
    const im = imgs[clave]; const ext = im.tipo === 'png' ? 'png' : 'jpeg';
    const nombre = `rubrikas-${clave}.${ext}`;
    zip.file('word/media/' + nombre, im.bytes);
    const id = 'rIdRbk' + (++n);
    const rel = rels.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship');
    rel.setAttribute('Id', id); rel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'); rel.setAttribute('Target', 'media/' + nombre);
    rels.documentElement.append(rel);
    if (![...tipos.documentElement.children].some(e => e.localName === 'Default' && e.getAttribute('Extension')?.toLowerCase() === ext)) {
      const df = tipos.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types', 'Default');
      df.setAttribute('Extension', ext); df.setAttribute('ContentType', ext === 'png' ? 'image/png' : 'image/jpeg');
      tipos.documentElement.prepend(df);
    }
    return rid[clave] = id;
  };
  let idDib = 7300;

  for (const c of campos) {
    const m = ms[c.marca], f = firmantes[c.firmante];
    if (!m || !f || f.estado !== 'firmado') continue;
    const p = ps[m.p];
    cortar(p, m.fin); cortar(p, m.ini);
    const runs = runsDe(p, m.ini, m.fin);
    if (!runs.length) continue;
    const primero = runs[0], primerT = primero.getElementsByTagNameNS(W, 't')[0];
    const vaciar = () => runs.slice(1).forEach(r => [...r.getElementsByTagNameNS(W, 't')].forEach(t => t.textContent = ''));
    if (c.tipo === 'firma' || c.tipo === 'iniciales') {
      const clave = f.id + '-' + c.tipo, im = imgs[clave]; if (!im) continue;
      const bw = m.tipo === 'linea' ? m.largo * m.fs * .5 : m.fs * 9;
      const bwI = c.tipo === 'iniciales' ? Math.min(bw, m.fs * 5) : bw;
      const bh = m.fs * 3;
      const aj = f.ajustes?.[c.tipo] || {escala: 1, dx: 0, dy: 0};
      const r = cajaFirma(bwI, bh, im.ancho, im.alto, aj);
      // posición: horizontal desde el inicio de la marca; vertical desde el tope del párrafo (la línea de firma suele ser su primer renglón; la base del texto queda ~1.05 fs abajo)
      const nodo = fragmento(doc, dibujo({rid: relDe(clave), id: ++idDib, cx: Math.round(r.w * EMU), cy: Math.round(r.h * EMU), flotante: true,
        x: r.x * EMU, y: (m.fs * 1.05 - bh + r.y) * EMU}))[0];
      primero.parentNode.insertBefore(nodo, primero);
      if (m.tipo === 'etiqueta') { primerT.textContent = ' '.repeat(m.largo); vaciar(); }
    } else {
      const valor = c.tipo === 'fecha' ? f.fecha_texto : c.tipo === 'nombre' ? f.nombre : (f.textos?.[c.id] ?? '');
      if (!valor) continue;
      primerT.textContent = valor; primerT.setAttributeNS(XMLNS, 'xml:space', 'preserve'); vaciar();
      if (m.tipo === 'linea') { // en una línea, el texto queda subrayado como si se hubiera llenado a mano
        let rPr = primero.getElementsByTagNameNS(W, 'rPr')[0];
        if (!rPr) { rPr = doc.createElementNS(W, 'w:rPr'); primero.prepend(rPr); }
        if (!rPr.getElementsByTagNameNS(W, 'u').length) { const u = doc.createElementNS(W, 'w:u'); u.setAttributeNS(W, 'w:val', 'single'); rPr.append(u); }
      }
    }
  }

  /* constancia al final */
  const cuerpo = doc.getElementsByTagNameNS(W, 'body')[0];
  const sect = [...cuerpo.children].filter(e => e.localName === 'sectPr').pop();
  const par = (txt, {b = false, sz = 20, color = '' , antes = 0} = {}) => `<w:p><w:pPr><w:spacing w:before="${antes}" w:after="60"/></w:pPr><w:r><w:rPr>${b ? '<w:b/>' : ''}<w:sz w:val="${sz}"/>${color ? `<w:color w:val="${color}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(txt)}</w:t></w:r></w:p>`;
  const linea = (et, val) => `<w:p><w:pPr><w:spacing w:after="20"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">${esc(et)}: </w:t></w:r><w:r><w:rPr><w:sz w:val="17"/></w:rPr><w:t xml:space="preserve">${esc(val)}</w:t></w:r></w:p>`;
  let x = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` + par('Constancia de firma electrónica', {b: true, sz: 32}) +
    par('Esta hoja forma parte del documento y registra quién lo firmó, cuándo y cómo.', {color: '666666', sz: 18}) +
    linea('Sobre', `${sobre.titulo} (${sobre.id})`) + linea('Documento', d.nombre) + linea('Huella del original (SHA-256)', d.sha256) +
    linea('Enviado', fechaLarga(sobre.enviado)) + linea('Orden de firma', sobre.orden ? 'sí, uno tras otro' : 'no, en cualquier orden');
  for (const f of sobre.firmantes) {
    x += par(f.nombre, {b: true, sz: 24, antes: 240});
    const clave = f.id + '-firma', im = imgs[clave] || imgs[f.id + '-iniciales'];
    if (im) {
      const k = Math.min(150 / im.ancho, 50 / im.alto);
      x += `<w:p>${dibujo({rid: relDe(imgs[clave] ? clave : f.id + '-iniciales'), id: ++idDib, cx: Math.round(im.ancho * k * EMU), cy: Math.round(im.alto * k * EMU), flotante: false})}</w:p>`;
    }
    if (f.correo) x += linea('Correo', f.correo);
    x += linea('Verificación', f.via === 'panel' ? 'firmó desde el panel de quien envía, con su contraseña' : f.verificado ? 'código enviado a su correo, confirmado el ' + fechaLarga(f.verificado) : 'enlace personal enviado a su nombre');
    x += linea('Firmó', fechaLarga(f.firmado)) + linea('IP', f.ip || '—');
    for (const [k, v] of Object.entries(f.imagenes || {})) x += linea(k === 'iniciales' ? 'Huella de las iniciales' : 'Huella de la firma', v.sha256);
    x += linea('Declaración aceptada', f.acepto || '—');
  }
  x += par('Bitácora', {b: true, sz: 22, antes: 240});
  for (const e of sobre.eventos || []) x += par(`${fechaLarga(e.t)} · ${e.quien} · ${e.que}${e.ip ? ' · IP ' + e.ip : ''}`, {sz: 15});
  x += par('Cómo verificar', {b: true, sz: 22, antes: 240}) +
    par(`La huella SHA-256 de este archivo queda registrada en el servidor. Para comprobar que nadie lo modificó después de firmarse, arrástralo a ${urlVerificar}. Cualquier cambio, aunque sea guardarlo de nuevo en Word, cambia su huella.`, {sz: 17}) +
    par('Firma electrónica simple. Su valor como prueba depende de esta constancia, de la verificación de cada firmante y de la ley aplicable.', {sz: 15, color: '666666'});
  for (const nodo of fragmento(doc, x)) cuerpo.insertBefore(nodo, sect || null);

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  zip.file('word/_rels/document.xml.rels', new XMLSerializer().serializeToString(rels));
  zip.file('[Content_Types].xml', new XMLSerializer().serializeToString(tipos));

  // solo lectura (Word la puede quitar, pero avisa que el documento está cerrado)
  const ajustes = await xml('word/settings.xml');
  if (ajustes) {
    const raiz = ajustes.documentElement;
    [...raiz.children].filter(e => e.localName === 'documentProtection').forEach(e => e.remove());
    const despues = ['autoFormatOverride', 'styleLockTheme', 'styleLockQFSet', 'defaultTabStop', 'autoHyphenation', 'consecutiveHyphenLimit',
      'hyphenationZone', 'doNotHyphenateCaps', 'showEnvelope', 'summaryLength', 'clickAndTypeStyle', 'defaultTableStyle', 'evenAndOddHeaders',
      'bookFoldRevPrinting', 'bookFoldPrinting', 'bookFoldPrintingSheets', 'drawingGridHorizontalSpacing', 'drawingGridVerticalSpacing',
      'displayHorizontalDrawingGridEvery', 'displayVerticalDrawingGridEvery', 'doNotUseMarginsForDrawingGridOrigin', 'drawingGridHorizontalOrigin',
      'drawingGridVerticalOrigin', 'doNotShadeFormData', 'noPunctuationKerning', 'characterSpacingControl', 'compat', 'rsids'];
    const ref = [...raiz.children].find(e => despues.includes(e.localName));
    if (ref) {
      const prot = ajustes.createElementNS(W, 'w:documentProtection');
      prot.setAttributeNS(W, 'w:edit', 'readOnly'); prot.setAttributeNS(W, 'w:enforcement', '1');
      raiz.insertBefore(prot, ref);
      zip.file('word/settings.xml', new XMLSerializer().serializeToString(ajustes));
    }
  }
  const core = await xml('docProps/core.xml');
  if (core) {
    const kw = [...core.documentElement.children].find(e => e.localName === 'keywords');
    if (kw) kw.textContent = 'firmado ' + sobre.id;
    zip.file('docProps/core.xml', new XMLSerializer().serializeToString(core));
  }
  return zip.generateAsync({type: 'uint8array', compression: 'DEFLATE', mimeType: MIME_DOCX});
}

/* ───── PDF de respaldo: la vista previa con las firmas, en hojas tamaño carta ───── */
/** `hoja` ya tiene el DOCX pintado y las firmas puestas encima. */
export async function pdfDeVista(hoja, {sobre, doc, urlVerificar}) {
  await libs({captura: true});
  const {PDFDocument} = window.PDFLib;
  const pdf = await PDFDocument.create();
  const secciones = [...hoja.querySelectorAll('section.dx')];
  // se captura la hoja completa (páginas + firmas encima) y luego se recorta cada página
  const rh = hoja.getBoundingClientRect();
  const lienzo = await window.html2canvas(hoja, {scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false});
  const k = lienzo.width / rh.width;
  for (const sec of secciones) {
    const r = sec.getBoundingClientRect();
    const x0 = r.left - rh.left, y0 = r.top - rh.top;
    const anchoPt = r.width * .75; // 96 px = 72 pt
    let altoPag = r.width * 11 / 8.5;
    if (sec.style.minHeight) { const t = document.createElement('div'); t.style.height = sec.style.minHeight; sec.append(t); altoPag = t.offsetHeight || altoPag; t.remove(); }
    // cortes entre bloques para no partir renglones
    const bordes = [...sec.querySelectorAll('p, tr, img')].map(e => e.getBoundingClientRect().bottom - r.top).sort((a, b) => a - b);
    let ini = 0;
    while (ini < r.height - 2) {
      let fin = Math.min(r.height, ini + altoPag);
      if (fin < r.height) { const b = bordes.filter(x => x > ini + altoPag * .5 && x <= fin).pop(); if (b) fin = b; }
      const c = document.createElement('canvas'); c.width = Math.round(r.width * k); c.height = Math.round(altoPag * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      const arriba = ini > 0 ? Math.min(60, altoPag * .07) * k : 0; // margen superior en hojas siguientes
      x.drawImage(lienzo, Math.round(x0 * k), Math.round((y0 + ini) * k), c.width, Math.round((fin - ini) * k), 0, arriba, c.width, Math.round((fin - ini) * k));
      const jpg = await pdf.embedJpg(await new Promise(ok => c.toBlob(b => b.arrayBuffer().then(ok), 'image/jpeg', .9)));
      const pg = pdf.addPage([anchoPt, altoPag * .75]);
      pg.drawImage(jpg, {x: 0, y: 0, width: anchoPt, height: altoPag * .75});
      ini = fin;
    }
  }
  const base = await pdf.save();
  return {base, paginas: pdf.getPageCount()};
}

/** Pinta el DOCX dentro de `contenedor`, escalado al ancho disponible. Las cajas quedan en px sin escalar, relativas a la hoja. */
export async function montarDocx(contenedor, bytes, doc, anchoMax) {
  const marco = document.createElement('div'); marco.className = 'docx-marco';
  const hoja = document.createElement('div'); hoja.dataset.doc = doc.id;
  const titulo = document.createElement('div'); titulo.className = 'docx-titulo'; titulo.textContent = doc.nombre.replace(/\.docx$/i, '') + ' · Word';
  marco.append(titulo, hoja); contenedor.append(marco);
  const {cajas} = await pintarDocx(hoja, bytes);
  const ancho = Math.max(...[...hoja.querySelectorAll('section.dx')].map(s => s.offsetWidth), 300);
  const k = Math.min(1, anchoMax / ancho);
  hoja.style.width = ancho + 'px';
  hoja.style.transformOrigin = '0 0';
  hoja.style.transform = k < 1 ? `scale(${k})` : '';
  marco.style.width = ancho * k + 'px';
  marco.style.height = hoja.offsetHeight * k + 28 + 'px';
  return {hoja, cajas, escala: k};
}
