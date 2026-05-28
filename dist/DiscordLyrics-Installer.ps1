param(
    [ValidateSet("Auto", "BetterDiscord", "Vencord", "Equicord", "Dorian")]
    [string]$Target = "Auto",
    [string]$SourcePath = "",
    [switch]$SkipBuild,
    [switch]$NoInject
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repo = "MallyDev2/DiscordLyrics"
$WorkDir = Join-Path $env:TEMP "DiscordLyricsInstaller"
$ReleaseZip = Join-Path $WorkDir "DiscordLyrics-release.zip"
$PackageDir = Join-Path $WorkDir "package"

function Write-Step($Text) {
    Write-Host ""
    Write-Host "== $Text" -ForegroundColor Cyan
}

function Write-Ok($Text) {
    Write-Host "   $Text" -ForegroundColor Green
}

function Write-Warn($Text) {
    Write-Host "   $Text" -ForegroundColor Yellow
}

function Reset-WorkDir {
    if (Test-Path $WorkDir) {
        Remove-Item $WorkDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force $WorkDir | Out-Null
}

function Ensure-Pnpm {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Write-Ok "pnpm is ready"
        return
    }

    Write-Warn "pnpm was not found"

    if (Get-Command corepack -ErrorAction SilentlyContinue) {
        Write-Step "Installing pnpm with Corepack"
        corepack enable
        corepack prepare pnpm@latest --activate
        if (Get-Command pnpm -ErrorAction SilentlyContinue) {
            Write-Ok "pnpm installed"
            return
        }
    }

    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Step "Installing pnpm with npm"
        npm install -g pnpm
        if (Get-Command pnpm -ErrorAction SilentlyContinue) {
            Write-Ok "pnpm installed"
            return
        }
    }

    throw "Node.js is required before source clients can be built. Install Node.js from https://nodejs.org, then run this installer again."
}

function Download-Release {
    Write-Step "Downloading DiscordLyrics"
    $Url = "https://github.com/$Repo/releases/latest/download/DiscordLyrics-release.zip"
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $ReleaseZip
    Expand-Archive -Path $ReleaseZip -DestinationPath $WorkDir -Force
    if (!(Test-Path $PackageDir) -and (Test-Path (Join-Path $WorkDir "BetterDiscord"))) {
        $script:PackageDir = $WorkDir
    }
    if (!(Test-Path $PackageDir)) {
        throw "Release package did not contain the expected package folder."
    }
    Write-Ok "Release package ready"
}

function Install-BetterDiscord {
    $PluginSource = Join-Path $PackageDir "BetterDiscord\SpotifyLyricsStatus.plugin.js"
    $PluginDir = Join-Path $env:APPDATA "BetterDiscord\plugins"

    if (!(Test-Path $PluginSource)) {
        throw "BetterDiscord plugin was not found in the release package."
    }

    New-Item -ItemType Directory -Force $PluginDir | Out-Null
    Copy-Item $PluginSource (Join-Path $PluginDir "SpotifyLyricsStatus.plugin.js") -Force
    Write-Ok "Installed BetterDiscord plugin"
}

function Stop-Discord {
    $DiscordProcesses = Get-Process -Name "Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment" -ErrorAction SilentlyContinue
    if (!$DiscordProcesses) {
        return
    }

    Write-Step "Closing Discord"
    $DiscordProcesses | Stop-Process -Force
    Start-Sleep -Seconds 2
}

function Test-DiscordRunning {
    $null -ne (Get-Process -Name "Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment" -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Start-DiscordProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList = @()
    )

    if (!(Test-Path $FilePath)) {
        return $false
    }

    try {
        $WorkingDirectory = Split-Path $FilePath -Parent
        if ($ArgumentList.Count -gt 0) {
            Start-Process -FilePath $FilePath -WorkingDirectory $WorkingDirectory -ArgumentList $ArgumentList | Out-Null
        } else {
            Start-Process -FilePath $FilePath -WorkingDirectory $WorkingDirectory | Out-Null
        }

        Start-Sleep -Seconds 3
        return (Test-DiscordRunning)
    } catch {
        Write-Warn "Launch attempt failed: $($_.Exception.Message)"
        Start-Sleep -Seconds 2
        return (Test-DiscordRunning)
    }
}

function Start-Discord {
    if (Test-DiscordRunning) {
        Write-Ok "Discord is already open"
        return
    }

    $ExeCandidates = @(
        (Get-ChildItem (Join-Path $env:LOCALAPPDATA "Discord\app-*") -Filter "Discord.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName),
        (Get-ChildItem (Join-Path $env:LOCALAPPDATA "DiscordCanary\app-*") -Filter "DiscordCanary.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName),
        (Get-ChildItem (Join-Path $env:LOCALAPPDATA "DiscordPTB\app-*") -Filter "DiscordPTB.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName),
        (Get-ChildItem (Join-Path $env:LOCALAPPDATA "DiscordDevelopment\app-*") -Filter "DiscordDevelopment.exe" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName)
    ) | Where-Object { $_ -and (Test-Path $_) }

    if ($ExeCandidates.Count -gt 0) {
        Write-Step "Opening Discord"
        foreach ($Candidate in $ExeCandidates) {
            if (Start-DiscordProcess -FilePath $Candidate) {
                Write-Ok "Discord opened"
                return
            }
        }
    }

    $UpdateCandidates = @(
        (Join-Path $env:LOCALAPPDATA "Discord\Update.exe"),
        (Join-Path $env:LOCALAPPDATA "DiscordCanary\Update.exe"),
        (Join-Path $env:LOCALAPPDATA "DiscordPTB\Update.exe"),
        (Join-Path $env:LOCALAPPDATA "DiscordDevelopment\Update.exe")
    ) | Where-Object { Test-Path $_ }

    if ($UpdateCandidates.Count -gt 0) {
        Write-Step "Opening Discord"
        foreach ($Candidate in $UpdateCandidates) {
            if (Start-DiscordProcess -FilePath $Candidate -ArgumentList @("--processStart", "Discord.exe")) {
                Write-Ok "Discord opened"
                return
            }
        }
    }

    Write-Warn "Discord was installed, but it could not be opened automatically. Open Discord manually."
}

function Select-InstallTarget {
    Write-Host ""
    Write-Host "Install mode:" -ForegroundColor Cyan
    Write-Host "[1] Auto-detect installed client"
    Write-Host "[2] Choose manually"
    Write-Host ""

    $ModeChoice = Read-Host "Enter 1 or 2"
    switch ($ModeChoice.Trim()) {
        "1" {
            $Detected = Get-AutoDetectedClient
            if ($Detected) {
                Write-Ok "Auto-detected $($Detected.Name)"
                return $Detected.Name
            }

            Write-Warn "Auto-detect did not find one clear source client."
            return Select-ManualInstallTarget
        }
        "2" { return Select-ManualInstallTarget }
        default { throw "Invalid install mode. Run the installer again and choose 1 or 2." }
    }
}

function Select-ManualInstallTarget {
    Write-Host ""
    Write-Host "Choose your Discord client:" -ForegroundColor Cyan
    Write-Host "[1] Vencord"
    Write-Host "[2] Equicord"
    Write-Host "[3] Dorian"
    Write-Host "[4] BetterDiscord"
    Write-Host ""

    $Choice = Read-Host "Enter 1, 2, 3, or 4"
    switch ($Choice.Trim()) {
        "1" { return "Vencord" }
        "2" { return "Equicord" }
        "3" { return "Dorian" }
        "4" { return "BetterDiscord" }
        default { throw "Invalid client selection. Run the installer again and choose 1, 2, 3, or 4." }
    }
}

function Get-InstalledClientInfo {
    param([string]$ClientName)

    $DataDir = Get-ClientDataDir -ClientName $ClientName
    $SettingsFile = Join-Path $DataDir "settings\settings.json"
    $DistDir = Join-Path $DataDir "dist"
    $AsarFile = Join-Path $DataDir "$($ClientName.ToLowerInvariant()).asar"

    if ((Test-Path $SettingsFile) -or (Test-Path $DistDir) -or (Test-Path $AsarFile)) {
        $Newest = @($SettingsFile, $DistDir, $AsarFile) |
            Where-Object { Test-Path $_ } |
            ForEach-Object { Get-Item $_ } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1

        return [pscustomobject]@{
            Name = $ClientName
            DataDir = $DataDir
            LastWriteTime = $Newest.LastWriteTime
        }
    }

    $null
}

function Get-AutoDetectedClient {
    $Names = @("Vencord", "Equicord", "Dorian")
    $Matches = New-Object System.Collections.Generic.List[object]

    foreach ($Name in $Names) {
        $Installed = Get-InstalledClientInfo -ClientName $Name
        $Sources = @(Get-SourceCandidates -ClientName $Name)

        if ($Installed -and $Sources.Count -eq 1) {
            $Matches.Add([pscustomobject]@{
                Name = $Name
                SourcePath = $Sources[0]
                LastWriteTime = $Installed.LastWriteTime
            })
        }
    }

    if ($Matches.Count -eq 1) {
        return $Matches[0]
    }

    if ($Matches.Count -gt 1) {
        Write-Warn "Auto-detect found multiple possible clients."
        $Matches |
            Sort-Object LastWriteTime -Descending |
            ForEach-Object { Write-Warn "$($_.Name): $($_.SourcePath)" }
    }

    $null
}

function Get-ClientDataDir {
    param([string]$ClientName)

    Join-Path $env:APPDATA $ClientName
}

function Get-SourceCandidates {
    param([string]$ClientName = "")

    $Roots = @(
        (Join-Path $env:USERPROFILE "Documents"),
        (Join-Path $env:USERPROFILE "Desktop"),
        $env:USERPROFILE
    ) | Where-Object { $_ -and (Test-Path $_) }

    $Names = if ($ClientName) { @($ClientName) } else { @("Vencord", "Equicord", "Dorian") }
    $Candidates = New-Object System.Collections.Generic.List[string]

    foreach ($Root in $Roots) {
        foreach ($Name in $Names) {
            $Direct = Join-Path $Root $Name
            if (Test-Path (Join-Path $Direct "package.json")) {
                $Candidates.Add($Direct)
            }
        }
    }

    $Candidates | Select-Object -Unique
}

function Select-SourcePath {
    param([string]$ClientName)

    if ($SourcePath) {
        if (!(Test-Path (Join-Path $SourcePath "package.json"))) {
            throw "SourcePath must point to a Vencord, Equicord, or Dorian source folder with package.json."
        }
        return (Resolve-Path $SourcePath).Path
    }

    if ($ClientName) {
        Write-Ok "Selected Discord mod: $ClientName"
        $MatchingCandidates = @(Get-SourceCandidates -ClientName $ClientName)

        if ($MatchingCandidates.Count -eq 1) {
            Write-Ok "Using matching source client: $($MatchingCandidates[0])"
            return $MatchingCandidates[0]
        }

        if ($MatchingCandidates.Count -gt 1) {
            Write-Host ""
            Write-Host "Detected matching $ClientName source folders:" -ForegroundColor Cyan
            for ($i = 0; $i -lt $MatchingCandidates.Count; $i++) {
                Write-Host "[$($i + 1)] $($MatchingCandidates[$i])"
            }
            $Choice = Read-Host "Choose the source folder for $ClientName"
            $Index = [int]$Choice - 1
            if ($Index -ge 0 -and $Index -lt $MatchingCandidates.Count) {
                return $MatchingCandidates[$Index]
            }
        }

        Write-Warn "No matching $ClientName source folder was found automatically."
    }

    $Candidates = @(Get-SourceCandidates)
    if ($Candidates.Count -eq 1) {
        return $Candidates[0]
    }

    if ($Candidates.Count -gt 1) {
        Write-Host ""
        Write-Host "Detected source clients:" -ForegroundColor Cyan
        for ($i = 0; $i -lt $Candidates.Count; $i++) {
            Write-Host "[$($i + 1)] $($Candidates[$i])"
        }
        $Choice = Read-Host "Choose a client number"
        $Index = [int]$Choice - 1
        if ($Index -ge 0 -and $Index -lt $Candidates.Count) {
            return $Candidates[$Index]
        }
    }

    $Manual = Read-Host "Paste your Vencord, Equicord, or Dorian source folder path"
    if (!(Test-Path (Join-Path $Manual "package.json"))) {
        throw "That folder does not look like a source client."
    }

    (Resolve-Path $Manual).Path
}

function Install-SourceClient {
    param([string]$ClientName)

    Ensure-Pnpm

    $ClientRoot = Select-SourcePath -ClientName $ClientName
    $PluginZip = Join-Path $PackageDir "Vencord\vencord-spotifyLyricsStatus.zip"
    $UserPlugins = Join-Path $ClientRoot "src\userplugins"
    $PluginDir = Join-Path $UserPlugins "spotifyLyricsStatus"
    $ClientDataDir = Get-ClientDataDir -ClientName $ClientName

    if (!(Test-Path $PluginZip)) {
        throw "Vencord userplugin zip was not found in the release package."
    }

    New-Item -ItemType Directory -Force $UserPlugins | Out-Null
    if (Test-Path $PluginDir) {
        Remove-Item $PluginDir -Recurse -Force
    }

    Expand-Archive -Path $PluginZip -DestinationPath $UserPlugins -Force

    if (!(Test-Path (Join-Path $PluginDir "index.ts"))) {
        $Nested = Get-ChildItem $UserPlugins -Directory |
            Where-Object { Test-Path (Join-Path $_.FullName "spotifyLyricsStatus\index.ts") } |
            Select-Object -First 1

        if ($Nested) {
            Move-Item (Join-Path $Nested.FullName "spotifyLyricsStatus") $PluginDir -Force
        }
    }

    if (!(Test-Path (Join-Path $PluginDir "index.ts"))) {
        throw "Plugin folder was not installed correctly."
    }

    Write-Ok "Installed userplugin into $PluginDir"

    if ($SkipBuild) {
        Write-Warn "Skipped build"
        return
    }

    Push-Location $ClientRoot
    try {
        Write-Step "Building client"
        if (!(Test-Path (Join-Path $ClientRoot "node_modules"))) {
            Write-Step "Installing client dependencies"
            pnpm install --frozen-lockfile
        } else {
            Write-Ok "Client dependencies already installed"
        }

        pnpm build

        if (Test-Path (Join-Path $ClientRoot "dist")) {
            $ActiveDist = Join-Path $ClientDataDir "dist"
            New-Item -ItemType Directory -Force $ActiveDist | Out-Null
            Copy-Item (Join-Path $ClientRoot "dist\*") $ActiveDist -Recurse -Force
            Write-Ok "Updated $ClientName build at $ActiveDist"
        } else {
            Write-Warn "Client build completed, but no dist folder was found to copy into $ClientDataDir."
        }

        $PackageJson = Get-Content "package.json" -Raw
        $CanInject = $PackageJson -match '"inject"\s*:'
        if (!$NoInject -and $CanInject) {
            Stop-Discord
            Write-Step "Reinstalling client into Discord"
            pnpm inject
            Write-Ok "Client was rebuilt and injected"
        } elseif ($NoInject -and $CanInject) {
            Write-Warn "Build complete. Injection skipped because -NoInject was used."
        } else {
            Write-Warn "No inject script found. Reinstall or inject this client the normal way."
        }
    } finally {
        Pop-Location
    }
}

Reset-WorkDir
Download-Release

$SelectedTarget = if ($Target -eq "Auto") { Select-InstallTarget } else { $Target }

if ($SelectedTarget -eq "BetterDiscord") {
    Stop-Discord
    Write-Step "Installing BetterDiscord"
    Install-BetterDiscord
}

if ($SelectedTarget -in @("Vencord", "Equicord", "Dorian")) {
    Write-Step "Installing $SelectedTarget source plugin"
    Install-SourceClient -ClientName $SelectedTarget
}

Start-Discord

Write-Host ""
Write-Host "DiscordLyrics install complete. Enable SpotifyLyricsStatus if it is not already enabled." -ForegroundColor Green
