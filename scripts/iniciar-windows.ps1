# Inicia Cambios JC en Windows con el código que ya está en esta carpeta.
# No usa Git ni GitHub: no descarga ni sube nada del repositorio.
#
# Uso: doble clic en "iniciar-windows.bat" (raíz del proyecto), o en PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\scripts\iniciar-windows.ps1
#
# La primera vez crea el .env y la base de datos (pregunta las claves); las siguientes solo arranca.
# Internet solo hace falta la primera vez, para que npm descargue las dependencias.

$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz

function Paso($texto) { Write-Host ''; Write-Host "==> $texto" -ForegroundColor Cyan }
function Falla($texto) {
  Write-Host ''
  Write-Host "ERROR: $texto" -ForegroundColor Red
  exit 1
}
function Ejecutar($descripcion, [scriptblock]$bloque) {
  & $bloque
  if ($LASTEXITCODE -ne 0) { Falla "$descripcion falló (código $LASTEXITCODE). Copia el mensaje de arriba." }
}
function Escribir($ruta, $texto) {
  [IO.File]::WriteAllText($ruta, $texto, (New-Object Text.UTF8Encoding $false))
}

Write-Host "Cambios JC — carpeta: $Raiz"

# 1. Node.js 26 o superior
Paso 'Revisando Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Falla 'No está instalado Node.js 26 (https://nodejs.org).' }
$versionNode = [int]((node -p 'process.versions.node.split(".")[0]'))
if ($versionNode -lt 26) { Falla "Hace falta Node.js 26 o superior; tienes la $versionNode." }
Write-Host "Node.js $(node -v)"

# 2. PostgreSQL encendido
Paso 'Revisando PostgreSQL'
$servicio = Get-Service 'postgresql*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $servicio) { Falla 'No encuentro el servicio de PostgreSQL. Instala PostgreSQL 18.' }
if ($servicio.Status -ne 'Running') {
  Write-Host "El servicio $($servicio.Name) está detenido; intento encenderlo..." -ForegroundColor Yellow
  try { Start-Service $servicio.Name } catch {
    Falla "No pude encender $($servicio.Name). Abre PowerShell como administrador y ejecuta: Start-Service $($servicio.Name)"
  }
}
Write-Host "$($servicio.Name): encendido"

# 3. Configuración y base de datos (solo la primera vez)
$baseNueva = $false
if (-not (Test-Path '.env')) {
  Paso 'Primera vez: creo el archivo .env y la base de datos'
  $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $psql) { Falla 'No encuentro psql.exe de PostgreSQL.' }

  $existe = Read-Host "¿Ya existe en PostgreSQL el usuario y la base 'cambios_jc'? (s/n)"
  $claveDb = Read-Host 'Clave del usuario de base de datos cambios_jc (mínimo 8: letras, números, punto o guiones)'
  if ($claveDb -notmatch '^[A-Za-z0-9._-]{8,}$') { Falla 'La clave necesita al menos 8 caracteres: letras, números, punto o guiones.' }

  if ($existe -ne 's') {
    $sql = (Get-Content 'scripts\db-preparar.sql' -Raw).Replace('CAMBIA_ESTA_CLAVE', $claveDb)
    $temporal = Join-Path $env:TEMP 'db-preparar-cambios-jc.sql'
    Escribir $temporal $sql
    Write-Host "psql pide ahora la contraseña del usuario 'postgres' (la de la instalación de PostgreSQL)."
    & $psql.FullName -U postgres -f $temporal
    $codigo = $LASTEXITCODE
    Remove-Item $temporal -Force
    if ($codigo -ne 0) { Falla 'No se pudo crear la base de datos.' }
  }

  $claveAdmin = Read-Host 'Contraseña temporal del administrador (mínimo 10 caracteres; la cambias al entrar)'
  if ($claveAdmin.Length -lt 10) { Falla 'La contraseña del administrador necesita al menos 10 caracteres.' }
  $clave2fa = node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

  $config = (Get-Content '.env.example' -Raw).Replace('CAMBIA_ESTA_CLAVE', $claveDb)
  $config = $config -replace '(?m)^ADMIN_CONTRASENA_INICIAL=.*$', ('ADMIN_CONTRASENA_INICIAL=' + $claveAdmin.Replace('$', '$$'))
  $config = $config -replace '(?m)^CLAVE_CIFRADO_2FA=.*$', ('CLAVE_CIFRADO_2FA=' + $clave2fa)
  Escribir (Join-Path $Raiz '.env') $config
  Write-Host '.env creado.'
  $baseNueva = $true
}

# 4. Dependencias (solo si faltan)
if (-not (Test-Path 'node_modules')) {
  Paso 'Instalando dependencias (solo la primera vez)'
  Ejecutar 'npm install' { npm install }
}

# 5. Tablas al día. "migrate deploy" solo aplica migraciones pendientes: nunca borra datos ni pregunta.
Paso 'Aplicando migraciones pendientes'
Push-Location 'apps\api'
try { Ejecutar 'prisma migrate deploy' { npx prisma migrate deploy } } finally { Pop-Location }

if ($baseNueva) {
  Paso 'Creando el administrador inicial y datos de ejemplo'
  Ejecutar 'npm run db:seed' { npm run db:seed }
}

# 6. Compilar solo si el código cambió desde la última compilación
$compilado = 'apps\api\dist\servidor.js'
$recompilar = -not (Test-Path $compilado)
if (-not $recompilar) {
  $fechaCompilado = (Get-Item $compilado).LastWriteTime
  $recompilar = [bool](Get-ChildItem 'apps\api\src', 'packages\shared\src' -Recurse -File |
    Where-Object { $_.LastWriteTime -gt $fechaCompilado } | Select-Object -First 1)
}
if ($recompilar) {
  Paso 'Compilando'
  Ejecutar 'npm run compilar' { npm run compilar }
}

# 7. Arrancar y abrir el navegador cuando la web responda
Paso 'Arrancando. Para detener: Ctrl + C'
Start-Job -ScriptBlock {
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
      Invoke-WebRequest 'http://localhost:5173' -UseBasicParsing -TimeoutSec 2 | Out-Null
      Start-Process 'http://localhost:5173'
      break
    } catch { }
  }
} | Out-Null
npm run iniciar
