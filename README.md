# Rubrikas

**Versión 0.7** · Parte de la colección Alchemy of Meaning (Alquimia del Significado) · © 2026 Héctor Cruz Juárez · [hectorcruz.com.mx](https://hectorcruz.com.mx) · GPL-3.0-or-later

*English below.*

## Qué es

Rubrikas es una aplicación para firmar documentos en tu propio servidor, como SignNow, pero sin depender de un servicio externo. Subes un PDF o un Word, marcas dónde firma cada persona y le mandas a cada una su enlace. Todas firman al mismo tiempo, desde la computadora o el teléfono, dibujando su firma o subiendo una imagen. Cuando firma la última persona, recibes el documento con todas las firmas y una hoja de constancia.

- **Varios documentos y varias personas** en un mismo envío. También se puede pedir que firmen en orden.
- **PDF:** las líneas «_____» se detectan solas. Los demás lugares se marcan con un toque y se pueden mover o cambiar de tamaño.
- **Word (.docx):** las firmas se marcan con una línea larga de guiones bajos o con etiquetas como `{firma Vivian}`. El resultado se entrega en Word (con las firmas ancladas a su línea y en solo lectura) y en un PDF de respaldo.
- **Firma ajustable:** se dibuja o se sube como imagen (PNG o JPG). Ya colocada, se mueve, se agranda o se achica con los dedos, y por omisión la base muerde un poco la línea, como una firma hecha a mano.
- **Tu propia firma guardada:** si estás entre quienes firman, tu firma PNG se coloca sola al enviar.
- **Constancia:** cada documento final lleva una hoja con quién firmó, cuándo, desde qué IP y con qué método, más la huella SHA-256 del original y de cada firma.
- **Comprobar:** `verificar.html` dice si un archivo es exactamente el que se firmó. El archivo se revisa en el navegador y no se sube.
- **Avisos por correo** a ti y a quien tú digas (varios correos separados por comas, por envío o para todos), y un código de verificación opcional antes de firmar.

## Validez

Una firma hecha aquí es una **firma electrónica simple**. Su peso como prueba depende de la constancia, de la verificación de quien firma y de la ley aplicable. No sustituye a la e.firma ni a una constancia NOM-151.

## Instalar

1. Sube esta carpeta a tu hosting, por ejemplo a `https://tudominio.com/rubrikas/`. Necesitas PHP 8.0 o más reciente y HTTPS. No hace falta base de datos.
2. Abre esa dirección y crea la contraseña del panel.
3. En **Ajustes**, escribe tu nombre, el correo donde quieres los avisos y, si tu hosting manda correos, el remitente. Luego pulsa «Mandarme un correo de prueba».
4. Comprueba que `https://tudominio.com/rubrikas/data/config.json` **no** se abra: debe dar error 403. La carpeta `data/` se crea sola en el servidor y trae su propio `.htaccess`. En nginx, bloquéala en la configuración del servidor.

**Actualizar:** sube los archivos nuevos encima de los anteriores y no borres `data/`, que es donde viven tus envíos, firmas y contraseña. Los detalles de uso están en `LEEME.txt`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html`, `panel.js` | Panel: envíos, editor y ajustes |
| `firmar.html`, `firmar.js` | Página donde firma cada persona |
| `verificar.html` | Comprobar un documento firmado |
| `comun.js`, `estilo.css`, `docx.js` | Partes compartidas y soporte de Word |
| `api.php`, `comun.php` | Servidor (PHP, datos en JSON) |
| `lib/` | pdf.js (Apache-2.0), pdf-lib (MIT), JSZip (MIT o GPL-3.0), docx-preview (Apache-2.0) y html2canvas (MIT) |

---

## English

**Rubrikas** is a self-hosted document signing app, similar to SignNow. You upload a PDF or a Word file, mark where each person signs, and send each of them a personal link. Everyone signs at the same time, on a computer or a phone, by drawing their signature or uploading an image. When the last person signs, you get the document with every signature plus a certificate page.

- **Several documents and several signers** per envelope, with optional signing order.
- **PDF:** signature lines («_____») are detected automatically. Other spots are placed with a tap and can be moved or resized.
- **Word (.docx):** signature spots are long underscore lines or tags such as `{firma Vivian}`. The output is a Word file (signatures anchored to their line, read-only) plus a backup PDF.
- **Adjustable signature:** drawn or uploaded (PNG or JPG). Once placed, it can be moved and resized with touch gestures, and by default it slightly overlaps the line, like a handwritten signature.
- **Certificate page:** who signed, when, from which IP and how, with SHA-256 fingerprints. `verificar.html` checks a file locally in the browser, without uploading it.
- **Legal note:** this is a simple electronic signature. It does not replace a qualified or advanced electronic signature.

**Install:** upload the folder to a PHP 8 host with HTTPS, open it, and create the panel password. The `data/` folder is created on the server and must not be publicly reachable. The interface is in Spanish.

**Version 0.7** · Part of the Alchemy of Meaning (Alquimia del Significado) collection · © 2026 Héctor Cruz Juárez · Free software under GPL-3.0-or-later.
