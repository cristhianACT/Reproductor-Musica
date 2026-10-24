@echo off
title Compilador de AURA Music Player
echo ===================================================
echo     Compilando nuevo ejecutable de AURA (.exe)
echo ===================================================
echo Por favor espera unos segundos...
call npm run build
echo.
echo Proceso finalizado. El nuevo ejecutable esta listo en tu Escritorio.
pause
