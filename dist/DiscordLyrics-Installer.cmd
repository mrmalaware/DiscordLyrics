@echo off
setlocal
title DiscordLyrics Installer
set "INSTALLER_URL=https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.ps1"
set "INSTALLER_PATH=%TEMP%\DiscordLyrics-Installer.ps1"

echo.
echo DiscordLyrics Installer
echo -----------------------
echo Downloading installer...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%INSTALLER_URL%' -OutFile '%INSTALLER_PATH%' } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }"
if errorlevel 1 goto failed

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER_PATH%" %*
if errorlevel 1 goto failed

echo.
echo Install finished. You can close this window.
pause
exit /b 0

:failed
echo.
echo Install failed. Leave this window open and copy the error above.
pause
exit /b 1
