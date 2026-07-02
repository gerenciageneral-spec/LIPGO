# =====================================================================
# Restaura los archivos ESTRUCTURALES que la copia de v0 sobrescribe y que
# hacen desaparecer los modulos SIG (Panel LIP Inventario, Cuadre de Inventario,
# MEDEVAC, Perfil, etc.) y el arreglo de auth-provider (env vars + guard SSR).
#
# CUANDO: cada vez que copies la carpeta de v0 encima del proyecto.
# QUE HACE: restaura estos 4 archivos a la ultima version buena guardada en git.
#
# OJO: si en v0 modificaste A PROPOSITO alguno de estos 4 archivos, este script
# descarta ese cambio de v0. En ese caso, avisa a Claude para reconciliar a mano.
# El resto de tus cambios de v0 (otros archivos) NO se tocan.
# =====================================================================

Set-Location $PSScriptRoot

$archivos = @(
  "components/main-content.tsx",
  "lib/dashboard-data.ts",
  "lib/permissions-map.ts",
  "components/auth-provider.tsx"
)

git checkout HEAD -- $archivos

if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "OK - Modulos SIG restaurados:" -ForegroundColor Green
  $archivos | ForEach-Object { Write-Host "   - $_" }
  Write-Host ""
  Write-Host "Refresca el navegador (Ctrl+F5). Panel LIP Inventario y Cuadre de Inventario vuelven a aparecer." -ForegroundColor Cyan
} else {
  Write-Host "No se pudo restaurar (revisa que estes dentro del repo git)." -ForegroundColor Red
}
