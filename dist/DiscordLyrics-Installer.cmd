@echo off
setlocal
title DiscordLyrics Installer
set "INSTALLER_URL=https://github.com/MallyDev2/DiscordLyrics/releases/latest/download/DiscordLyrics-Installer.ps1"
set "INSTALLER_PATH=%TEMP%\DiscordLyrics-Installer.ps1"

echo.
echo DiscordLyrics Installer
echo -----------------------
echo Checking pnpm...
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
    where npm >nul 2>nul
    if errorlevel 1 (
        echo Node.js/npm is required for Vencord, Equicord, and Dorian source builds.
        echo Install Node.js from https://nodejs.org, then run this installer again.
        goto failed
    )

    echo pnpm was not found. Installing pnpm...
    call npm install -g pnpm
    if errorlevel 1 goto failed
)

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
