<?php
/*
 * Rubrikas · API
 * © 2026 Héctor Cruz Juárez · GPL-3.0-or-later
 */
declare(strict_types=1);
require __DIR__ . '/comun.php';

cfg();
asegurar_data();
session_name('rubrikas');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
session_start();

$a = (string)($_GET['a'] ?? '');
$post = $_SERVER['REQUEST_METHOD'] === 'POST';

/* ───────────── acciones públicas y de firmante ───────────── */

switch ($a) {
case 'estado':
  $c = cfg();
  if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
  salir_json(['configurado' => !empty($c['clave']), 'dentro' => !empty($_SESSION['dentro']), 'csrf' => $_SESSION['csrf'],
    'version' => RUBRIKAS_VERSION, 'correo' => !empty($c['correo_activo'])]);

case 'configurar':
  if (!$post) error_json('método');
  $c = cfg();
  if (!empty($c['clave'])) error_json('ya está configurado', 403);
  $e = entrada();
  $clave = (string)($e['clave'] ?? '');
  if (mb_strlen($clave) < 8) error_json('la contraseña necesita al menos 8 caracteres');
  $c = ['clave' => password_hash($clave, PASSWORD_DEFAULT), 'zona' => 'America/Mexico_City', 'url' => '',
    'correo_activo' => false, 'correo_desde' => '', 'correo_nombre' => 'Rubrikas', 'aviso_a' => '', 'creado' => ahora()];
  cfg_guardar($c);
  session_regenerate_id(true);
  $_SESSION['dentro'] = true;
  salir_json(['ok' => true]);

case 'entrar':
  if (!$post) error_json('método');
  $c = cfg();
  $intentos = json_decode((string)@file_get_contents(DATA . '/intentos.json'), true) ?: [];
  $k = hash('sha256', ip());
  $mio = array_filter($intentos[$k] ?? [], fn($t) => $t > time() - 900);
  if (count($mio) >= 8) error_json('demasiados intentos; espera 15 minutos', 429);
  usleep(400000);
  if (empty($c['clave']) || !password_verify((string)(entrada()['clave'] ?? ''), $c['clave'])) {
    $mio[] = time(); $intentos[$k] = array_values($mio);
    file_put_contents(DATA . '/intentos.json', json_encode($intentos), LOCK_EX);
    error_json('contraseña incorrecta', 403);
  }
  unset($intentos[$k]);
  file_put_contents(DATA . '/intentos.json', json_encode($intentos), LOCK_EX);
  session_regenerate_id(true);
  $_SESSION['dentro'] = true;
  $_SESSION['csrf'] = bin2hex(random_bytes(16));
  salir_json(['ok' => true, 'csrf' => $_SESSION['csrf']]);

case 'verificar': // público: ¿este hash corresponde a un documento firmado aquí?
  $h = strtolower((string)($_GET['h'] ?? ''));
  if (!preg_match('/^[a-f0-9]{64}$/', $h)) error_json('hash inválido');
  foreach (lista_sobres() as $s) {
    foreach ($s['final'] ?? [] as $fd) {
      if (hash_equals($fd['sha256'], $h) || (!empty($fd['pdf']) && hash_equals($fd['pdf']['sha256'], $h))) {
        $doc = null; foreach ($s['docs'] as $d) if ($d['id'] === $fd['doc']) $doc = $d;
        salir_json(['ok' => true, 'tipo' => 'final', 'sobre' => $s['id'], 'titulo' => $s['titulo'], 'documento' => $doc['nombre'] ?? '',
          'completado' => $s['completado'] ?? null,
          'firmantes' => array_map(fn($f) => ['nombre' => $f['nombre'], 'firmado' => $f['firmado'] ?? null], $s['firmantes'])]);
      }
    }
    foreach ($s['docs'] as $d) {
      if (hash_equals($d['sha256'], $h)) salir_json(['ok' => true, 'tipo' => 'original', 'titulo' => $s['titulo'], 'documento' => $d['nombre'], 'estado' => $s['estado']]);
    }
  }
  salir_json(['ok' => false]);

case 'f_sobre': // el firmante abre su enlace
  [$s, $i] = por_token((string)($_GET['t'] ?? ''));
  if ($s['estado'] === 'anulado') error_json('este sobre fue anulado', 410);
  $f = $s['firmantes'][$i];
  if (empty($f['abierto'])) {
    $s = sobre_mod($s['id'], function (&$s) use ($i) {
      $s['firmantes'][$i]['abierto'] = ahora();
      if ($s['firmantes'][$i]['estado'] === 'pendiente') $s['firmantes'][$i]['estado'] = 'abierto';
      evento($s, $s['firmantes'][$i]['nombre'], 'abrió el enlace');
    });
    $f = $s['firmantes'][$i];
  }
  salir_json([
    'sobre' => ['id' => $s['id'], 'titulo' => $s['titulo'], 'mensaje' => $s['mensaje'] ?? '', 'estado' => $s['estado'], 'orden' => !empty($s['orden']),
      'codigo' => !empty($s['codigo']), 'final' => !empty($s['final'])],
    'yo' => ['id' => $f['id'], 'nombre' => $f['nombre'], 'correo' => $f['correo'], 'estado' => $f['estado'], 'firmado' => $f['firmado'] ?? null,
      'rechazo' => $f['rechazo'] ?? null, 'verificado' => !empty($f['verificado'])],
    'toca' => le_toca($s, $i),
    'docs' => array_map(fn($d) => ['id' => $d['id'], 'nombre' => $d['nombre'], 'paginas' => $d['paginas'], 'tipo' => $d['tipo'] ?? 'pdf'], $s['docs']),
    'campos' => array_values(array_map(fn($c) => $c + ['mio' => $c['firmante'] === $f['id']], $s['campos'])),
    'firmantes' => array_map('firmante_publico', $s['firmantes']),
    'emisor' => (cfg()['mi_nombre'] ?? '') ?: (cfg()['correo_nombre'] ?? 'Rubrikas'),
  ]);

case 'f_doc': // PDF original (o el firmado, si ya está completo)
  [$s, $i] = por_token((string)($_GET['t'] ?? ''));
  if ($s['estado'] === 'anulado') error_json('anulado', 410);
  $d = (string)($_GET['d'] ?? '');
  foreach ($s['docs'] as $doc) {
    if ($doc['id'] !== $d) continue;
    $dir = ruta_sobre($s['id']);
    if (!empty($_GET['final'])) {
      foreach ($s['final'] ?? [] as $fd) if ($fd['doc'] === $d) {
        if (($_GET['formato'] ?? '') === 'pdf' && !empty($fd['pdf'])) servir_pdf("$dir/final/{$fd['pdf']['archivo']}", firmado_nombre($doc['nombre'], 'pdf'), true);
        servir_pdf("$dir/final/{$fd['archivo']}", firmado_nombre($doc['nombre']), true);
      }
      error_json('aún no está el documento firmado', 404);
    }
    servir_pdf("$dir/docs/{$doc['archivo']}", $doc['nombre']);
  }
  error_json('documento no encontrado', 404);

case 'f_img': // firma de otra persona del mismo sobre que ya firmó
  [$s, $i] = por_token((string)($_GET['t'] ?? ''));
  $n = basename((string)($_GET['n'] ?? ''));
  foreach ($s['firmantes'] as $f) {
    if ($f['estado'] !== 'firmado') continue;
    foreach ($f['imagenes'] ?? [] as $im) if ($im['archivo'] === $n) {
      $r = ruta_sobre($s['id']) . "/firmas/$n";
      if (!is_file($r)) break 2;
      header('Content-Type: ' . (str_ends_with($n, '.png') ? 'image/png' : 'image/jpeg'));
      header('Cache-Control: private, no-store');
      readfile($r); exit;
    }
  }
  error_json('no encontrada', 404);

case 'f_codigo': // manda un código de verificación al correo del firmante
  if (!$post) error_json('método');
  [$s, $i] = por_token((string)(entrada()['t'] ?? ''));
  $f = $s['firmantes'][$i];
  if (!empty($f['codigo_t']) && strtotime($f['codigo_t']) > time() - 60) error_json('espera un minuto para pedir otro código', 429);
  $cod = (string)random_int(100000, 999999);
  sobre_mod($s['id'], function (&$s) use ($i, $cod) {
    $s['firmantes'][$i]['codigo_h'] = password_hash($cod, PASSWORD_DEFAULT);
    $s['firmantes'][$i]['codigo_t'] = ahora();
    $s['firmantes'][$i]['codigo_n'] = 0;
    evento($s, $s['firmantes'][$i]['nombre'], 'pidió código de verificación');
  });
  $ok = correo($f['correo'], "Tu código para firmar: $cod",
    "Hola, {$f['nombre']}.\n\nTu código para firmar «{$s['titulo']}» es:\n\n    $cod\n\nVence en 20 minutos. Si no lo pediste, ignora este correo.\n");
  if (!$ok) error_json('no se pudo enviar el correo; avisa a quien te mandó el enlace', 500);
  salir_json(['ok' => true]);

case 'f_verificar':
  if (!$post) error_json('método');
  $e = entrada();
  [$s, $i] = por_token((string)($e['t'] ?? ''));
  $cod = preg_replace('/\D/', '', (string)($e['codigo'] ?? ''));
  $f = $s['firmantes'][$i];
  if (empty($f['codigo_h']) || strtotime($f['codigo_t']) < time() - 1200) error_json('pide un código nuevo');
  if (($f['codigo_n'] ?? 0) >= 5) error_json('demasiados intentos; pide un código nuevo', 429);
  $bien = password_verify($cod, $f['codigo_h']);
  sobre_mod($s['id'], function (&$s) use ($i, $bien) {
    $f = &$s['firmantes'][$i];
    if ($bien) { $f['verificado'] = ahora(); unset($f['codigo_h']); evento($s, $f['nombre'], 'verificó su correo con código'); }
    else $f['codigo_n'] = ($f['codigo_n'] ?? 0) + 1;
  });
  if (!$bien) error_json('código incorrecto', 403);
  salir_json(['ok' => true]);

case 'f_firmar':
  if (!$post) error_json('método');
  $e = entrada();
  [$s, $i] = por_token((string)($e['t'] ?? ''));
  if ($s['estado'] !== 'enviado') error_json('este sobre no está abierto para firmar', 409);
  $f = $s['firmantes'][$i];
  if ($f['estado'] === 'firmado') error_json('ya firmaste este sobre', 409);
  if ($f['estado'] === 'rechazado') error_json('rechazaste este sobre', 409);
  if (!le_toca($s, $i)) error_json('todavía no es tu turno', 409);
  if (!empty($s['codigo']) && empty($f['verificado'])) error_json('primero verifica tu correo con el código', 403);
  if (empty($e['acepto'])) error_json('falta aceptar la firma electrónica');

  $mios = array_values(array_filter($s['campos'], fn($c) => $c['firmante'] === $f['id']));
  $tipos = array_unique(array_column($mios, 'tipo'));
  $dir = ruta_sobre($s['id']) . '/firmas';
  if (!is_dir($dir)) mkdir($dir, 0750, true);
  $imgs = []; $ajustes = [];
  foreach (['firma', 'iniciales'] as $tipo) {
    if (!in_array($tipo, $tipos, true)) continue;
    $bin = imagen_de_dataurl((string)($e[$tipo] ?? ''));
    if ($bin === null) error_json($tipo === 'firma' ? 'falta tu firma (o la imagen no es válida)' : 'faltan tus iniciales (o la imagen no es válida)');
    $nombre = $f['id'] . '-' . $tipo . (str_starts_with($bin, "\x89PNG") ? '.png' : '.jpg');
    file_put_contents("$dir/$nombre", $bin);
    $ajustes[$tipo] = ajuste_limpio($e['ajustes'][$tipo] ?? null);
    $imgs[$tipo] = ['archivo' => $nombre, 'sha256' => hash('sha256', $bin), 'metodo' => in_array($e[$tipo . '_metodo'] ?? '', ['dibujada', 'imagen', 'escrita'], true) ? $e[$tipo . '_metodo'] : 'dibujada'];
  }
  $textos = [];
  foreach ($mios as $c) {
    if ($c['tipo'] === 'texto') {
      $v = trim(mb_substr((string)($e['textos'][$c['id']] ?? ''), 0, 200));
      if ($v === '' && !empty($c['requerido'])) error_json('falta llenar un campo de texto');
      $textos[$c['id']] = $v;
    }
  }
  $fecha = date('d/m/Y');
  $s = sobre_mod($s['id'], function (&$s) use ($i, $imgs, $ajustes, $textos, $fecha) {
    if ($s['firmantes'][$i]['estado'] === 'firmado') return false;
    $f = &$s['firmantes'][$i];
    $f['estado'] = 'firmado';
    $f['firmado'] = ahora();
    $f['ip'] = ip();
    $f['ua'] = ua();
    $f['imagenes'] = $imgs;
    $f['ajustes'] = $ajustes;
    $f['textos'] = $textos;
    $f['fecha_texto'] = $fecha;
    $f['acepto'] = 'Acepto firmar electrónicamente estos documentos y que mi firma tenga el mismo valor que mi firma autógrafa.';
    evento($s, $f['nombre'], 'firmó (' . implode(', ', array_map(fn($k, $v) => $k . ($v['metodo'] === 'imagen' ? ' desde imagen' : ($k === 'iniciales' ? ' dibujadas' : ' dibujada')), array_keys($imgs), $imgs)) . ')');
    $todos = !array_filter($s['firmantes'], fn($x) => $x['estado'] !== 'firmado');
    if ($todos) { $s['estado'] = 'firmado'; evento($s, 'sistema', 'todas las firmas completas; falta generar el PDF final'); }
  });
  avisar_siguiente($s);
  $c = cfg();
  if (!empty($c['aviso_a'])) {
    $n = count(array_filter($s['firmantes'], fn($x) => $x['estado'] === 'firmado')); $t = count($s['firmantes']);
    $panel = url_base() . '/#' . $s['id'];
    if ($s['estado'] === 'firmado') correo($c['aviso_a'], "Ya firmaron todos · {$s['titulo']}",
      "¡Listo! Las $t personas firmaron «{$s['titulo']}».\n\nAbre Rubrikas para descargar los documentos firmados (al abrirlo se preparan y se avisa a cada persona que ya puede bajar su copia):\n$panel\n");
    else correo($c['aviso_a'], "Firmó {$f['nombre']} ($n de $t) · {$s['titulo']}", "{$f['nombre']} firmó «{$s['titulo']}». Van $n de $t firmas.\n\n$panel\n");
  }
  salir_json(['ok' => true, 'completo' => $s['estado'] === 'firmado']);

case 'f_rechazar':
  if (!$post) error_json('método');
  $e = entrada();
  [$s, $i] = por_token((string)($e['t'] ?? ''));
  if ($s['estado'] !== 'enviado') error_json('este sobre no está abierto', 409);
  $motivo = trim(mb_substr((string)($e['motivo'] ?? ''), 0, 500));
  $s = sobre_mod($s['id'], function (&$s) use ($i, $motivo) {
    $f = &$s['firmantes'][$i];
    if ($f['estado'] === 'firmado') return false;
    $f['estado'] = 'rechazado';
    $f['rechazo'] = ['t' => ahora(), 'motivo' => $motivo];
    $s['estado'] = 'rechazado';
    evento($s, $f['nombre'], 'rechazó firmar' . ($motivo ? ": $motivo" : ''));
  });
  $c = cfg();
  if (!empty($c['aviso_a'])) correo($c['aviso_a'], "Rechazado · {$s['titulo']}", "{$s['firmantes'][$i]['nombre']} rechazó firmar «{$s['titulo']}».\n\nMotivo: $motivo\n");
  salir_json(['ok' => true]);
}

/* ───────────── de aquí en adelante, solo con sesión ───────────── */

if (empty($_SESSION['dentro'])) error_json('inicia sesión', 401);
if ($post && !hash_equals($_SESSION['csrf'] ?? '', (string)($_SERVER['HTTP_X_RUBRIKAS'] ?? ''))) error_json('sesión vencida; recarga la página', 403);

switch ($a) {
case 'salir':
  $_SESSION = [];
  session_destroy();
  salir_json(['ok' => true]);

case 'ajustes':
  $c = cfg();
  if ($post) {
    $e = entrada();
    foreach (['url', 'correo_desde', 'correo_nombre', 'aviso_a', 'zona', 'mi_nombre'] as $k) if (isset($e[$k])) $c[$k] = trim((string)$e[$k]);
    if (isset($e['correo_activo'])) $c['correo_activo'] = (bool)$e['correo_activo'];
    if (!empty($e['clave_nueva'])) {
      if (!password_verify((string)($e['clave_actual'] ?? ''), $c['clave'])) error_json('la contraseña actual no coincide', 403);
      if (mb_strlen((string)$e['clave_nueva']) < 8) error_json('la contraseña nueva necesita al menos 8 caracteres');
      $c['clave'] = password_hash((string)$e['clave_nueva'], PASSWORD_DEFAULT);
    }
    if ($c['zona'] && !in_array($c['zona'], timezone_identifiers_list(), true)) error_json('zona horaria desconocida');
    cfg_guardar($c);
  }
  unset($c['clave']);
  $c['url_detectada'] = url_base();
  $c['tiene_firma'] = is_file(DATA . '/mi-firma.png');
  salir_json($c);

case 'mi_firma': // la firma en imagen del dueño del panel, para firmar sus envíos sin enlace
  $r = DATA . '/mi-firma.png';
  if ($post) {
    $d = (string)(entrada()['img'] ?? '');
    if ($d === '') { @unlink($r); salir_json(['ok' => true, 'tiene' => false]); }
    $bin = imagen_de_dataurl($d);
    if ($bin === null || !str_starts_with($bin, "\x89PNG")) error_json('usa una imagen PNG de menos de 1.5 MB');
    file_put_contents($r, $bin);
    salir_json(['ok' => true, 'tiene' => true]);
  }
  if (!is_file($r)) error_json('no hay firma guardada', 404);
  header('Content-Type: image/png'); header('Cache-Control: private, no-store');
  readfile($r); exit;

case 'prueba_correo':
  $c = cfg();
  $ok = correo($c['aviso_a'] ?: $c['correo_desde'], 'Prueba de Rubrikas', "Si lees esto, el correo del hosting funciona.\n");
  salir_json(['ok' => $ok]);

case 'lista':
  salir_json(array_map(fn($s) => ['id' => $s['id'], 'titulo' => $s['titulo'], 'estado' => $s['estado'], 'creado' => $s['creado'],
    'docs' => count($s['docs']), 'firmantes' => array_map(fn($f) => ['nombre' => $f['nombre'], 'estado' => $f['estado']], $s['firmantes'])], lista_sobres()));

case 'sobre':
  $s = sobre_leer((string)($_GET['id'] ?? ''));
  foreach ($s['firmantes'] as &$f) {
    if (!empty($f['token']) && $s['estado'] !== 'anulado') $f['url'] = url_base() . '/firmar.html#' . $f['token'];
    unset($f['token'], $f['token_h'], $f['codigo_h']);
  }
  unset($f);
  salir_json($s);

case 'crear':
  if (!$post) error_json('método');
  $id = 'S' . date('ymd') . '-' . bin2hex(random_bytes(3));
  $dir = DATA . "/sobres/$id";
  mkdir("$dir/docs", 0750, true);
  $titulo = trim(mb_substr((string)(entrada()['titulo'] ?? ''), 0, 160)) ?: 'Sobre sin título';
  $s = ['id' => $id, 'titulo' => $titulo, 'mensaje' => '', 'estado' => 'borrador', 'creado' => ahora(), 'orden' => false, 'codigo' => false,
    'docs' => [], 'firmantes' => [], 'campos' => [], 'eventos' => [], 'final' => []];
  evento($s, 'tú', 'creó el sobre');
  file_put_contents("$dir/sobre.json", json_encode($s, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
  salir_json(['id' => $id]);

case 'subir': // un PDF o un DOCX a la vez; las medidas o las marcas las manda el navegador
  if (!$post) error_json('método');
  $id = (string)($_POST['id'] ?? '');
  $dir = ruta_sobre($id);
  $up = $_FILES['pdf'] ?? $_FILES['archivo'] ?? null;
  if (!$up || $up['error'] !== UPLOAD_ERR_OK) error_json('no llegó el archivo (¿supera el límite del hosting?)');
  if ($up['size'] > MAX_PDF) error_json('el archivo supera 25 MB');
  $bin = file_get_contents($up['tmp_name']);
  $nombre = trim(mb_substr(basename((string)$up['name']), 0, 160)) ?: 'documento';
  $did = 'd' . bin2hex(random_bytes(4));
  if (es_docx($bin)) {
    $marcas = (int)($_POST['marcas'] ?? 0);
    if ($marcas < 0 || $marcas > 500) error_json('demasiadas marcas');
    if (!preg_match('/\.docx$/i', $nombre)) $nombre .= '.docx';
    $doc = ['id' => $did, 'nombre' => $nombre, 'tipo' => 'docx', 'archivo' => "$did.docx", 'sha256' => hash('sha256', $bin), 'bytes' => strlen($bin), 'paginas' => [], 'marcas' => $marcas];
  } else {
    if (!str_starts_with(ltrim(substr($bin, 0, 1024)), '%PDF')) error_json('usa un PDF o un documento de Word (.docx)');
    $pags = json_decode((string)($_POST['paginas'] ?? '[]'), true);
    if (!is_array($pags) || !$pags || count($pags) > 500) error_json('faltan las medidas de las páginas');
    $pags = array_map(fn($p) => ['w' => (float)$p['w'], 'h' => (float)$p['h'], 'rot' => (int)($p['rot'] ?? 0)], $pags);
    $doc = ['id' => $did, 'nombre' => $nombre, 'archivo' => "$did.pdf", 'sha256' => hash('sha256', $bin), 'bytes' => strlen($bin), 'paginas' => $pags];
  }
  $s = sobre_mod($id, function (&$s) use ($doc, $bin, $dir) {
    if ($s['estado'] !== 'borrador') error_json('el sobre ya se envió', 409);
    file_put_contents("$dir/docs/{$doc['archivo']}", $bin);
    $s['docs'][] = $doc;
    evento($s, 'tú', "agregó {$doc['nombre']}");
  });
  salir_json(['ok' => true, 'doc' => end($s['docs'])]);

case 'quitar_doc':
  if (!$post) error_json('método');
  $e = entrada();
  $id = (string)($e['id'] ?? ''); $did = (string)($e['doc'] ?? '');
  $dir = ruta_sobre($id);
  sobre_mod($id, function (&$s) use ($did, $dir) {
    if ($s['estado'] !== 'borrador') error_json('el sobre ya se envió', 409);
    $s['docs'] = array_values(array_filter($s['docs'], function ($d) use ($did, $dir) {
      if ($d['id'] === $did) { @unlink("$dir/docs/{$d['archivo']}"); return false; }
      return true;
    }));
    $s['campos'] = array_values(array_filter($s['campos'], fn($c) => $c['doc'] !== $did));
  });
  salir_json(['ok' => true]);

case 'guardar': // título, mensaje, firmantes y campos (solo en borrador)
  if (!$post) error_json('método');
  $e = entrada();
  $id = (string)($e['id'] ?? '');
  $s = sobre_mod($id, function (&$s) use ($e) {
    if ($s['estado'] !== 'borrador') error_json('el sobre ya se envió', 409);
    $s['titulo'] = trim(mb_substr((string)($e['titulo'] ?? $s['titulo']), 0, 160)) ?: 'Sobre sin título';
    $s['mensaje'] = trim(mb_substr((string)($e['mensaje'] ?? ''), 0, 2000));
    $s['orden'] = !empty($e['orden']);
    $s['codigo'] = !empty($e['codigo']);
    $fs = [];
    foreach ((array)($e['firmantes'] ?? []) as $k => $f) {
      $fid = preg_match('/^f[a-z0-9]{1,12}$/', (string)($f['id'] ?? '')) ? $f['id'] : 'f' . bin2hex(random_bytes(3));
      $fs[] = ['id' => $fid, 'nombre' => trim(mb_substr((string)($f['nombre'] ?? ''), 0, 120)), 'correo' => trim(mb_substr((string)($f['correo'] ?? ''), 0, 160)),
        'orden' => $k + 1, 'estado' => 'pendiente', 'yo' => !empty($f['yo'])]
        + (!empty($f['yo']) && !empty($f['ajustes']) ? ['ajustes' => array_map('ajuste_limpio', array_intersect_key((array)$f['ajustes'], ['firma' => 1, 'iniciales' => 1]))] : []);
    }
    $s['firmantes'] = $fs;
    $ids = array_column($fs, 'id');
    $docs = array_column($s['docs'], null, 'id');
    $cs = [];
    foreach ((array)($e['campos'] ?? []) as $c) {
      if (!in_array($c['firmante'] ?? '', $ids, true) || !isset($docs[$c['doc'] ?? ''])) continue;
      if (!in_array($c['tipo'] ?? '', ['firma', 'iniciales', 'fecha', 'nombre', 'texto'], true)) continue;
      $n = fn($v) => max(0, min(1, (float)$v));
      if (($docs[$c['doc']]['tipo'] ?? '') === 'docx') {
        $mk = (int)($c['marca'] ?? -1);
        if ($mk < 0 || $mk >= ($docs[$c['doc']]['marcas'] ?? 0)) continue;
        $cs[] = ['id' => preg_match('/^c[a-z0-9]{1,12}$/', (string)($c['id'] ?? '')) ? $c['id'] : 'c' . bin2hex(random_bytes(3)),
          'doc' => $c['doc'], 'marca' => $mk, 'pagina' => 0, 'tipo' => $c['tipo'], 'firmante' => $c['firmante'], 'x' => 0, 'y' => 0, 'w' => 0, 'h' => 0,
          'etiqueta' => mb_substr((string)($c['etiqueta'] ?? ''), 0, 60), 'requerido' => !isset($c['requerido']) || $c['requerido'], 'auto' => !empty($c['auto'])];
        continue;
      }
      $p = (int)($c['pagina'] ?? 0);
      if ($p < 0 || $p >= count($docs[$c['doc']]['paginas'])) continue;
      $cs[] = ['id' => preg_match('/^c[a-z0-9]{1,12}$/', (string)($c['id'] ?? '')) ? $c['id'] : 'c' . bin2hex(random_bytes(3)),
        'doc' => $c['doc'], 'pagina' => $p, 'tipo' => $c['tipo'], 'firmante' => $c['firmante'],
        'x' => $n($c['x']), 'y' => $n($c['y']), 'w' => $n($c['w']), 'h' => $n($c['h']),
        'etiqueta' => mb_substr((string)($c['etiqueta'] ?? ''), 0, 60), 'requerido' => !isset($c['requerido']) || $c['requerido'], 'auto' => !empty($c['auto'])];
    }
    $s['campos'] = $cs;
  });
  salir_json(['ok' => true]);

case 'enviar':
  if (!$post) error_json('método');
  $e = entrada();
  $id = (string)($e['id'] ?? '');
  $s = sobre_leer($id);
  if ($s['estado'] !== 'borrador') error_json('el sobre ya se envió', 409);
  if (!$s['docs']) error_json('agrega al menos un PDF');
  if (!$s['firmantes']) error_json('agrega al menos un firmante');
  foreach ($s['firmantes'] as $f) {
    if ($f['nombre'] === '') error_json('cada firmante necesita nombre');
    if (!empty($s['codigo']) && !filter_var($f['correo'], FILTER_VALIDATE_EMAIL)) error_json("{$f['nombre']} necesita un correo válido para el código de verificación");
    if (!array_filter($s['campos'], fn($c) => $c['firmante'] === $f['id'] && in_array($c['tipo'], ['firma', 'iniciales'], true)))
      error_json("{$f['nombre']} no tiene ningún campo de firma");
  }
  $tokens = [];
  $s = sobre_mod($id, function (&$s) use (&$tokens) {
    foreach ($s['firmantes'] as &$f) {
      $t = bin2hex(random_bytes(20));
      $f['token_h'] = hash('sha256', $t);
      $f['token'] = $t; // la carpeta data/ está cerrada al público; así el panel puede volver a mostrar el enlace
      $f['enviado'] = ahora();
      $tokens[$f['id']] = $t;
      token_registrar($t, $s['id']);
    }
    unset($f);
    $s['estado'] = 'enviado';
    $s['enviado'] = ahora();
    evento($s, 'tú', 'envió el sobre');
    firmar_como_yo($s);
  });
  $enlaces = [];
  $mandar = !empty($e['correo']);
  foreach ($s['firmantes'] as $i => $f) {
    $url = url_base() . '/firmar.html#' . $tokens[$f['id']];
    $enviado = false;
    if ($mandar && $f['estado'] !== 'firmado' && le_toca($s, $i)) $enviado = correo_invitacion($s, $f, $url);
    $enlaces[] = ['id' => $f['id'], 'nombre' => $f['nombre'], 'correo' => $f['correo'], 'url' => $url, 'correo_enviado' => $enviado, 'firmado' => $f['estado'] === 'firmado'];
  }
  salir_json(['ok' => true, 'enlaces' => $enlaces]);

case 'enlace_nuevo': // regenera el enlace de un firmante (el anterior deja de servir)
  if (!$post) error_json('método');
  $e = entrada();
  $id = (string)($e['id'] ?? ''); $fid = (string)($e['firmante'] ?? '');
  $t = bin2hex(random_bytes(20));
  $s = sobre_mod($id, function (&$s) use ($fid, $t) {
    if (!in_array($s['estado'], ['enviado', 'firmado', 'completo'], true)) error_json('el sobre no está enviado', 409);
    foreach ($s['firmantes'] as &$f) if ($f['id'] === $fid) {
      if (!empty($f['token_h'])) token_quitar($f['token_h']);
      $f['token_h'] = hash('sha256', $t);
      $f['token'] = $t;
      token_registrar($t, $s['id']);
      evento($s, 'tú', "generó un enlace nuevo para {$f['nombre']}");
      return;
    }
    error_json('firmante no encontrado', 404);
  });
  $url = url_base() . '/firmar.html#' . $t;
  $enviado = false;
  if (!empty($e['correo'])) foreach ($s['firmantes'] as $f) if ($f['id'] === $fid) $enviado = correo_invitacion($s, $f, $url);
  salir_json(['ok' => true, 'url' => $url, 'correo_enviado' => $enviado]);

case 'anular':
  if (!$post) error_json('método');
  $id = (string)(entrada()['id'] ?? '');
  sobre_mod($id, function (&$s) {
    foreach ($s['firmantes'] as $f) if (!empty($f['token_h'])) token_quitar($f['token_h']);
    $s['estado'] = 'anulado';
    evento($s, 'tú', 'anuló el sobre');
  });
  salir_json(['ok' => true]);

case 'borrar':
  if (!$post) error_json('método');
  $id = (string)(entrada()['id'] ?? '');
  $s = sobre_leer($id);
  if (!in_array($s['estado'], ['borrador', 'anulado'], true)) error_json('solo se borran borradores o sobres anulados; los firmados se conservan', 409);
  foreach ($s['firmantes'] as $f) if (!empty($f['token_h'])) token_quitar($f['token_h']);
  borrar_dir(ruta_sobre($id));
  salir_json(['ok' => true]);

case 'pdf': // original o final, para el panel
  $s = sobre_leer((string)($_GET['id'] ?? ''));
  $d = (string)($_GET['doc'] ?? '');
  $dir = ruta_sobre($s['id']);
  foreach ($s['docs'] as $doc) {
    if ($doc['id'] !== $d) continue;
    if (!empty($_GET['final'])) {
      foreach ($s['final'] ?? [] as $fd) if ($fd['doc'] === $d) {
        if (($_GET['formato'] ?? '') === 'pdf' && !empty($fd['pdf'])) servir_pdf("$dir/final/{$fd['pdf']['archivo']}", firmado_nombre($doc['nombre'], 'pdf'), !empty($_GET['bajar']));
        servir_pdf("$dir/final/{$fd['archivo']}", firmado_nombre($doc['nombre']), !empty($_GET['bajar']));
      }
      error_json('sin documento final', 404);
    }
    servir_pdf("$dir/docs/{$doc['archivo']}", $doc['nombre'], !empty($_GET['bajar']));
  }
  error_json('documento no encontrado', 404);

case 'img': // imagen de firma, para estampar el PDF final
  $s = sobre_leer((string)($_GET['id'] ?? ''));
  $n = basename((string)($_GET['n'] ?? ''));
  if (!preg_match('/^f[a-z0-9]+-(firma|iniciales)\.(png|jpg)$/', $n)) error_json('nombre inválido');
  $r = ruta_sobre($s['id']) . "/firmas/$n";
  if (!is_file($r)) error_json('no existe', 404);
  header('Content-Type: ' . (str_ends_with($n, '.png') ? 'image/png' : 'image/jpeg'));
  header('Cache-Control: private, no-store');
  readfile($r);
  exit;

case 'final': // el panel sube los PDF ya estampados
  if (!$post) error_json('método');
  $id = (string)($_POST['id'] ?? '');
  $s = sobre_leer($id);
  if (!in_array($s['estado'], ['firmado', 'completo'], true)) error_json('aún faltan firmas', 409);
  $dir = ruta_sobre($id) . '/final';
  if (!is_dir($dir)) mkdir($dir, 0750, true);
  $finales = [];
  foreach ($s['docs'] as $doc) {
    $up = $_FILES['f_' . $doc['id']] ?? null;
    if (!$up || $up['error'] !== UPLOAD_ERR_OK) error_json("falta el archivo final de {$doc['nombre']}");
    $bin = file_get_contents($up['tmp_name']);
    $docx = ($doc['tipo'] ?? '') === 'docx';
    if ($docx ? !es_docx($bin) : !str_starts_with($bin, '%PDF')) error_json('archivo final inválido');
    $arch = $doc['id'] . '-firmado.' . ($docx ? 'docx' : 'pdf');
    file_put_contents("$dir/$arch", $bin);
    $fin = ['doc' => $doc['id'], 'archivo' => $arch, 'sha256' => hash('sha256', $bin), 'bytes' => strlen($bin)];
    if ($docx) { // PDF de respaldo
      $up2 = $_FILES['f_' . $doc['id'] . '_pdf'] ?? null;
      if ($up2 && $up2['error'] === UPLOAD_ERR_OK) {
        $b2 = file_get_contents($up2['tmp_name']);
        if (!str_starts_with($b2, '%PDF')) error_json('PDF de respaldo inválido');
        file_put_contents("$dir/{$doc['id']}-firmado.pdf", $b2);
        $fin['pdf'] = ['archivo' => "{$doc['id']}-firmado.pdf", 'sha256' => hash('sha256', $b2), 'bytes' => strlen($b2)];
      }
    }
    $finales[] = $fin;
  }
  $s = sobre_mod($id, function (&$s) use ($finales) {
    $s['final'] = $finales;
    $nuevo = $s['estado'] !== 'completo';
    $s['estado'] = 'completo';
    $s['completado'] = $s['completado'] ?? ahora();
    evento($s, 'tú', $nuevo ? 'generó los PDF finales' : 'volvió a generar los PDF finales');
  });
  $avisar = !empty($_POST['avisar']);
  if ($avisar) foreach ($s['firmantes'] as $f) {
    correo($f['correo'], "Firmado · {$s['titulo']}", "Hola, {$f['nombre']}.\n\nYa firmaron todos «{$s['titulo']}». Puedes descargar tu copia desde el mismo enlace con el que firmaste.\n\nPara comprobar que un PDF es el original firmado: " . url_base() . "/verificar.html\n");
  }
  salir_json(['ok' => true, 'final' => $finales]);

case 'zip':
  $s = sobre_leer((string)($_GET['id'] ?? ''));
  if (!class_exists('ZipArchive')) error_json('el hosting no tiene ZipArchive; descarga los PDF uno por uno');
  $dir = ruta_sobre($s['id']);
  $tmp = tempnam(sys_get_temp_dir(), 'rub');
  $z = new ZipArchive();
  $z->open($tmp, ZipArchive::OVERWRITE);
  $docs = array_column($s['docs'], null, 'id');
  $final = !empty($s['final']);
  foreach ($final ? $s['final'] : $s['docs'] as $x) {
    $doc = $docs[$final ? $x['doc'] : $x['id']];
    $z->addFile($final ? "$dir/final/{$x['archivo']}" : "$dir/docs/{$x['archivo']}", $final ? firmado_nombre($doc['nombre']) : $doc['nombre']);
    if ($final && !empty($x['pdf'])) $z->addFile("$dir/final/{$x['pdf']['archivo']}", firmado_nombre($doc['nombre'], 'pdf'));
  }
  $z->close();
  $n = preg_replace('/[^\w\-]+/u', '-', $s['titulo']) . ($final ? '-firmado' : '') . '.zip';
  header('Content-Type: application/zip');
  header('Content-Length: ' . filesize($tmp));
  header("Content-Disposition: attachment; filename=\"$n\"");
  readfile($tmp);
  unlink($tmp);
  exit;
}

error_json('acción desconocida', 404);

/* ───────────── auxiliares ───────────── */


function correo_invitacion(array $s, array $f, string $url): bool {
  $de = cfg()['correo_nombre'] ?? 'Rubrikas';
  $txt = "Hola, {$f['nombre']}.\n\n$de te pide firmar «{$s['titulo']}» (" . count($s['docs']) . " documento" . (count($s['docs']) === 1 ? '' : 's') . ").\n\n"
    . ($s['mensaje'] ? $s['mensaje'] . "\n\n" : '') . "Abre este enlace para revisar y firmar:\n$url\n\nEl enlace es personal; no lo reenvíes.\n";
  return correo($f['correo'], "Firma pendiente · {$s['titulo']}", $txt);
}

/** Con orden de firma, avisa por correo a quien le toca ahora. */
function avisar_siguiente(array $s): void {
  if (empty($s['orden']) || $s['estado'] !== 'enviado' || empty(cfg()['correo_activo'])) return;
  foreach ($s['firmantes'] as $i => $f) {
    if ($f['estado'] === 'firmado' || !le_toca($s, $i) || !empty($f['avisado_turno']) || empty($f['token'])) continue;
    sobre_mod($s['id'], function (&$s) use ($i) {
      $s['firmantes'][$i]['avisado_turno'] = ahora();
      evento($s, 'sistema', "avisó a {$s['firmantes'][$i]['nombre']} que es su turno");
    });
    correo_invitacion($s, $f, url_base() . '/firmar.html#' . $f['token']);
  }
}

/** Si el dueño del panel está entre quienes firman y tiene su firma guardada, firma al enviar. */
function firmar_como_yo(array &$s): void {
  $png = DATA . '/mi-firma.png';
  if (!is_file($png)) return;
  foreach ($s['firmantes'] as $i => &$f) {
    if (empty($f['yo']) || !le_toca($s, $i)) continue;
    $tipos = array_unique(array_column(array_filter($s['campos'], fn($c) => $c['firmante'] === $f['id']), 'tipo'));
    if (array_diff($tipos, ['firma', 'iniciales', 'fecha', 'nombre'])) continue; // con campos de texto, firma por su enlace
    $dir = ruta_sobre($s['id']) . '/firmas';
    if (!is_dir($dir)) mkdir($dir, 0750, true);
    $bin = file_get_contents($png);
    $imgs = [];
    foreach (['firma', 'iniciales'] as $t) if (in_array($t, $tipos, true)) {
      file_put_contents("$dir/{$f['id']}-$t.png", $bin);
      $imgs[$t] = ['archivo' => "{$f['id']}-$t.png", 'sha256' => hash('sha256', $bin), 'metodo' => 'imagen'];
      $f['ajustes'][$t] = ajuste_limpio($f['ajustes'][$t] ?? null);
    }
    $f['estado'] = 'firmado'; $f['firmado'] = ahora(); $f['abierto'] = $f['abierto'] ?? ahora();
    $f['ip'] = ip(); $f['ua'] = ua(); $f['imagenes'] = $imgs; $f['textos'] = []; $f['fecha_texto'] = date('d/m/Y');
    $f['verificado'] = ahora(); $f['via'] = 'panel';
    $f['acepto'] = 'Firmó desde su panel, con su contraseña, al enviar el sobre.';
    evento($s, $f['nombre'], 'firmó desde el panel con su firma guardada');
  }
  unset($f);
  if (!array_filter($s['firmantes'], fn($x) => $x['estado'] !== 'firmado')) { $s['estado'] = 'firmado'; evento($s, 'sistema', 'todas las firmas completas'); }
}

function borrar_dir(string $d): void {
  foreach (array_diff(scandir($d) ?: [], ['.', '..']) as $x) is_dir("$d/$x") ? borrar_dir("$d/$x") : unlink("$d/$x");
  rmdir($d);
}
