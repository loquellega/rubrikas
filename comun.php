<?php
/*
 * Rubrikas · firma de documentos en tu propio servidor
 * Parte de la colección Alchemy of Meaning (Alquimia del Significado).
 * © 2026 Héctor Cruz Juárez · https://hectorcruz.com.mx
 * Software libre bajo licencia GPL-3.0-or-later.
 */
declare(strict_types=1);

const RUBRIKAS_VERSION = '0.6';
const MAX_PDF = 25 * 1024 * 1024;     // 25 MB por documento
const MAX_IMG = 1536 * 1024;          // 1.5 MB por imagen de firma
const DATA = __DIR__ . '/data';

function cfg(): array {
  static $c = null;
  if ($c !== null) return $c;
  $f = DATA . '/config.json';
  $c = is_file($f) ? (json_decode((string)file_get_contents($f), true) ?: []) : [];
  date_default_timezone_set($c['zona'] ?? 'America/Mexico_City');
  return $c;
}

function cfg_guardar(array $c): void {
  asegurar_data();
  file_put_contents(DATA . '/config.json', json_encode($c, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function asegurar_data(): void {
  if (!is_dir(DATA)) mkdir(DATA, 0750, true);
  if (!is_dir(DATA . '/sobres')) mkdir(DATA . '/sobres', 0750, true);
  $h = DATA . '/.htaccess';
  if (!is_file($h)) file_put_contents($h, "Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
  if (!is_file(DATA . '/index.html')) file_put_contents(DATA . '/index.html', '');
}

function salir_json($d, int $codigo = 200): void {
  http_response_code($codigo);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function error_json(string $msg, int $codigo = 400): void { salir_json(['error' => $msg], $codigo); }

function entrada(): array {
  static $e = null;
  if ($e !== null) return $e;
  $ct = $_SERVER['CONTENT_TYPE'] ?? '';
  if (stripos($ct, 'application/json') !== false) {
    $e = json_decode((string)file_get_contents('php://input'), true) ?: [];
  } else {
    $e = $_POST;
  }
  return $e;
}

function ip(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64); }
function ua(): string { return substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 300); }
function ahora(): string { return date('c'); }

function id_valido(string $id): bool { return (bool)preg_match('/^S\d{6}-[a-f0-9]{6}$/', $id); }
function ruta_sobre(string $id): string {
  if (!id_valido($id)) error_json('sobre inválido', 404);
  return DATA . '/sobres/' . $id;
}

function sobre_leer(string $id): array {
  $f = ruta_sobre($id) . '/sobre.json';
  if (!is_file($f)) error_json('no existe el sobre', 404);
  return json_decode((string)file_get_contents($f), true) ?: [];
}

/** Lee, modifica y guarda un sobre con candado, para que dos firmantes simultáneos no se pisen. */
function sobre_mod(string $id, callable $fn): array {
  $dir = ruta_sobre($id);
  $lock = fopen($dir . '/.lock', 'c');
  flock($lock, LOCK_EX);
  try {
    $s = json_decode((string)file_get_contents($dir . '/sobre.json'), true) ?: [];
    $r = $fn($s);
    if ($r !== false) {
      $tmp = $dir . '/sobre.json.tmp';
      file_put_contents($tmp, json_encode($s, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
      rename($tmp, $dir . '/sobre.json');
    }
    return $s;
  } finally {
    flock($lock, LOCK_UN);
    fclose($lock);
  }
}

function lista_sobres(): array {
  $r = [];
  foreach (glob(DATA . '/sobres/S*', GLOB_ONLYDIR) ?: [] as $d) {
    $f = $d . '/sobre.json';
    if (is_file($f)) $r[] = json_decode((string)file_get_contents($f), true);
  }
  usort($r, fn($a, $b) => strcmp($b['creado'] ?? '', $a['creado'] ?? ''));
  return array_values(array_filter($r));
}

/** Busca el firmante por su token. Devuelve [sobre, índice] o termina con error. */
function por_token(string $t): array {
  if (!preg_match('/^[a-f0-9]{40}$/', $t)) error_json('enlace inválido', 404);
  $idx = json_decode((string)@file_get_contents(DATA . '/tokens.json'), true) ?: [];
  $id = $idx[hash('sha256', $t)] ?? null;
  if (!$id) error_json('enlace inválido o vencido', 404);
  $s = sobre_leer($id);
  foreach ($s['firmantes'] as $i => $f) {
    if (isset($f['token_h']) && hash_equals($f['token_h'], hash('sha256', $t))) return [$s, $i];
  }
  error_json('enlace inválido', 404);
}

function token_registrar(string $t, string $id): void {
  $f = DATA . '/tokens.json';
  $fp = fopen($f, 'c+');
  flock($fp, LOCK_EX);
  $idx = json_decode((string)stream_get_contents($fp), true) ?: [];
  $idx[hash('sha256', $t)] = $id;
  ftruncate($fp, 0); rewind($fp);
  fwrite($fp, json_encode($idx));
  flock($fp, LOCK_UN); fclose($fp);
}

function token_quitar(string $token_h): void {
  $f = DATA . '/tokens.json';
  if (!is_file($f)) return;
  $fp = fopen($f, 'c+');
  flock($fp, LOCK_EX);
  $idx = json_decode((string)stream_get_contents($fp), true) ?: [];
  unset($idx[$token_h]);
  ftruncate($fp, 0); rewind($fp);
  fwrite($fp, json_encode($idx));
  flock($fp, LOCK_UN); fclose($fp);
}

function evento(array &$s, string $quien, string $que): void {
  $s['eventos'][] = ['t' => ahora(), 'quien' => $quien, 'que' => $que, 'ip' => ip()];
}

function url_base(): string {
  $c = cfg();
  if (!empty($c['url'])) return rtrim($c['url'], '/');
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
  $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
  return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $dir;
}

/** Correo simple con mail() del hosting. Devuelve true si el hosting lo aceptó. */
function correo(string $para, string $asunto, string $texto): bool {
  $c = cfg();
  if (empty($c['correo_activo']) || !filter_var($para, FILTER_VALIDATE_EMAIL)) return false;
  $desde = $c['correo_desde'] ?? '';
  if (!filter_var($desde, FILTER_VALIDATE_EMAIL)) return false;
  $nombre = $c['correo_nombre'] ?? 'Rubrikas';
  $h = "From: =?UTF-8?B?" . base64_encode($nombre) . "?= <$desde>\r\n"
     . "Reply-To: $desde\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n";
  if (getenv('RUBRIKAS_CORREO_PRUEBA')) { // en pruebas, se escribe a un archivo en lugar de enviar
    file_put_contents(DATA . '/correos.log', "PARA: $para\nASUNTO: $asunto\n$texto\n----\n", FILE_APPEND);
    return true;
  }
  return @mail($para, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $texto, $h, '-f' . $desde);
}

/** Firmante público: lo que sí puede ver cualquiera del sobre (sin tokens ni correos ajenos). */
function firmante_publico(array $f): array {
  $r = ['id' => $f['id'], 'nombre' => $f['nombre'], 'orden' => $f['orden'], 'estado' => $f['estado'], 'firmado' => $f['firmado'] ?? null];
  if (($f['estado'] ?? '') === 'firmado') { // lo ya firmado se ve en el documento, como en papel
    $r['imagenes'] = array_map(fn($i) => ['archivo' => $i['archivo']], $f['imagenes'] ?? []);
    $r['fecha_texto'] = $f['fecha_texto'] ?? ''; $r['textos'] = $f['textos'] ?? [];
    if (!empty($f['ajustes'])) $r['ajustes'] = $f['ajustes'];
  }
  return $r;
}

/** En orden de firma, ¿le toca a este firmante? */
function le_toca(array $s, int $i): bool {
  if (empty($s['orden'])) return true;
  foreach ($s['firmantes'] as $j => $f) {
    if ($f['orden'] < $s['firmantes'][$i]['orden'] && $f['estado'] !== 'firmado') return false;
  }
  return true;
}

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function servir_pdf(string $ruta, string $nombre, bool $descarga = false): void {
  if (!is_file($ruta)) error_json('archivo no encontrado', 404);
  header('Content-Type: ' . (str_ends_with(strtolower($ruta), '.docx') ? MIME_DOCX : 'application/pdf'));
  header('Content-Length: ' . filesize($ruta));
  header('Cache-Control: private, no-store');
  header('X-Content-Type-Options: nosniff');
  $n = preg_replace('/[^\w\-. áéíóúñÁÉÍÓÚÑ]/u', '_', $nombre);
  header('Content-Disposition: ' . ($descarga ? 'attachment' : 'inline') . "; filename=\"" . addslashes($n) . "\"; filename*=UTF-8''" . rawurlencode($nombre));
  readfile($ruta);
  exit;
}

/** ¿Es un DOCX de verdad? (zip con word/document.xml) */
function es_docx(string $bin): bool {
  if (!str_starts_with($bin, "PK\x03\x04")) return false;
  if (class_exists('ZipArchive')) {
    $tmp = tempnam(sys_get_temp_dir(), 'rbk'); file_put_contents($tmp, $bin);
    $z = new ZipArchive(); $ok = $z->open($tmp) === true && $z->locateName('word/document.xml') !== false;
    if ($ok) $z->close(); unlink($tmp);
    return $ok;
  }
  return str_contains($bin, 'word/document.xml');
}
/** Nombre de la copia firmada: «contrato (firmado).docx» o «.pdf». */
function firmado_nombre(string $n, string $ext = ''): string {
  $ext = $ext ?: (preg_match('/\.docx$/i', $n) ? 'docx' : 'pdf');
  return preg_replace('/\.(pdf|docx)$/i', '', $n) . " (firmado).$ext";
}

/** Tamaño y posición de una firma en su lugar (ver cajaFirma en comun.js). */
function ajuste_limpio($a): array {
  $a = is_array($a) ? $a : [];
  $c = fn($v, $min, $max, $d) => is_numeric($v) ? max($min, min($max, (float)$v)) : $d;
  return ['escala' => $c($a['escala'] ?? null, .3, 3, 1.0), 'dx' => $c($a['dx'] ?? null, -1.5, 1.5, 0.0), 'dy' => $c($a['dy'] ?? null, -1.5, 1.5, 0.18)];
}

/** Decodifica un dataURL PNG o JPEG y comprueba que sea una imagen real. */
function imagen_de_dataurl(string $d): ?string {
  if (!preg_match('#^data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)$#', $d, $m)) return null;
  $bin = base64_decode($m[2], true);
  if ($bin === false || strlen($bin) > MAX_IMG) return null;
  $info = @getimagesizefromstring($bin);
  if (!$info || !in_array($info[2], [IMAGETYPE_PNG, IMAGETYPE_JPEG], true)) return null;
  if ($info[0] > 3000 || $info[1] > 3000) return null;
  return $bin;
}
