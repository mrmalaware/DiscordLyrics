param(
    [ValidateSet("Auto", "BetterDiscord", "Vencord")]
    [string]$Target = "Auto",
    [string]$SourcePath = "",
    [switch]$SkipBuild
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

function Need-Command($Name, $InstallHint) {
    if (!(Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required. $InstallHint"
    }
}

function Reset-WorkDir {
    if (Test-Path $WorkDir) {
        Remove-Item $WorkDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force $WorkDir | Out-Null
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

function Get-SourceCandidates {
    $Roots = @(
        (Join-Path $env:USERPROFILE "Documents"),
        (Join-Path $env:USERPROFILE "Desktop"),
        $env:USERPROFILE
    ) | Where-Object { $_ -and (Test-Path $_) }

    $Names = @("Vencord", "Equicord", "Dorian")
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
    if ($SourcePath) {
        if (!(Test-Path (Join-Path $SourcePath "package.json"))) {
            throw "SourcePath must point to a Vencord, Equicord, or Dorian source folder with package.json."
        }
        return (Resolve-Path $SourcePath).Path
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
    Need-Command "pnpm" "Install Node.js, then run: npm install -g pnpm"

    $ClientRoot = Select-SourcePath
    $PluginZip = Join-Path $PackageDir "Vencord\vencord-spotifyLyricsStatus.zip"
    $UserPlugins = Join-Path $ClientRoot "src\userplugins"
    $PluginDir = Join-Path $UserPlugins "spotifyLyricsStatus"

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
        pnpm install
        pnpm build

        $PackageJson = Get-Content "package.json" -Raw
        if ($PackageJson -match '"inject"\s*:') {
            Write-Step "Injecting client"
            pnpm inject
        } else {
            Write-Warn "No inject script found. Reinstall or inject this client the normal way."
        }
    } finally {
        Pop-Location
    }
}

Reset-WorkDir
Download-Release

if ($Target -eq "Auto" -or $Target -eq "BetterDiscord") {
    if (Test-Path (Join-Path $env:APPDATA "BetterDiscord")) {
        Write-Step "Installing BetterDiscord"
        Install-BetterDiscord
    } elseif ($Target -eq "BetterDiscord") {
        Install-BetterDiscord
    } else {
        Write-Warn "BetterDiscord folder was not found"
    }
}

if ($Target -eq "Auto" -or $Target -eq "Vencord") {
    Write-Step "Installing source client plugin"
    Install-SourceClient
}

Write-Host ""
Write-Host "DiscordLyrics install complete. Restart Discord, then enable SpotifyLyricsStatus." -ForegroundColor Green
