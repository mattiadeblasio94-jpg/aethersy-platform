<#
.SYNOPSIS
  Copia fuori sede (off-site) dei backup del VPS aethersy sul PC.

.DESCRIPTION
  Ultimo anello della Fase 9: un backup che vive solo sul server non e' un
  backup. Questo script viene eseguito dal PC (Windows), non dal VPS, e copia
  i dump piu' recenti prodotti da `scripts/backup.sh` in una cartella locale.

  Perche' il pull e non il push: il VPS non ha credenziali verso il PC, e non
  serve aprirne di nuove. Il PC ha gia' la chiave SSH (`aethersy-vps` in
  `~/.ssh/config`) usata per il deploy.

  Cosa fa, per ogni file remoto (daily/ e weekly/):
    1. confronta dimensione + sha256 con la copia locale;
    2. se manca o differisce, lo scarica con scp;
    3. verifica l'hash dopo il download e, se non combacia, elimina la copia;
    4. scrive/aggiorna un manifest locale (sha256 + dimensione + data).

  Rotazione locale: mantiene gli ultimi N file per tipo e cartella
  (`-KeepDaily`, `-KeepWeekly`), indipendente dalla rotazione del VPS: cosi'
  il PC conserva copie anche quando il server ha gia' ruotato.

.PARAMETER Remote
  Alias SSH del VPS. Default: `aethersy-vps`.

.PARAMETER RemoteRoot
  Cartella `aethersy` sul VPS. Default: `~/aethersy`.

.PARAMETER Destination
  Cartella locale di destinazione. Default: `C:\Users\PC\aethersy-offsite`.

.PARAMETER KeepDaily
  Quanti file per tipo conservare in `daily/`. Default: 14.

.PARAMETER KeepWeekly
  Quanti file per tipo conservare in `weekly/`. Default: 8.

.PARAMETER DryRun
  Mostra cosa sarebbe copiato, senza scrivere nulla.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\offsite-pull.ps1

.EXAMPLE
  .\offsite-pull.ps1 -DryRun -Destination D:\backup-aethersy

.NOTES
  Prerequisiti: OpenSSH client (ssh/scp) nel PATH e chiave SSH gia' funzionante
  (`ssh aethersy-vps true`). Nessun segreto viene letto o scritto: gli archivi
  sono gia' prodotti dal VPS e vengono trasferiti cosi' come sono.
#>
[CmdletBinding()]
param(
    [string]$Remote = "aethersy-vps",
    [string]$RemoteRoot = "~/aethersy",
    [string]$Destination = "C:\Users\PC\aethersy-offsite",
    [int]$KeepDaily = 14,
    [int]$KeepWeekly = 8,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$script:logLines = @()
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[{0}] {1,-5} {2}" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"), $Level, $Message
    $script:logLines += $line
    Write-Host $line
}

function Invoke-Remote {
    param([string]$Command)
    $out = & ssh -o BatchMode=yes -o ConnectTimeout=15 $Remote $Command 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "ssh fallito ($LASTEXITCODE): $Command`n$out"
    }
    return $out
}

function Get-RemoteFiles {
    param([string]$Subdir)
    # `find -printf` evita di parsare `ls` e restituisce name<TAB>size.
    # `2>/dev/null` perche' la cartella puo' non esistere prima del primo backup.
    $raw = Invoke-Remote "find $RemoteRoot/backups/$Subdir -maxdepth 1 -type f \( -name '*postgres*' -o -name '*redis*' \) -printf '%f\t%s\n' 2>/dev/null | sort"
    $files = @()
    foreach ($line in @($raw)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = $line -split "`t"
        if ($parts.Count -ne 2) { continue }
        $files += [pscustomobject]@{ Name = $parts[0]; Size = [long]$parts[1] }
    }
    # `return` di un array vuoto verrebbe srotolato a $null: la virgola lo preserva.
    return ,$files
}

function Get-RemoteSha256 {
    param([string]$RelativePath)
    $out = @(Invoke-Remote "sha256sum $RemoteRoot/backups/$RelativePath 2>/dev/null | cut -d' ' -f1")
    $hash = ($out | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($hash)) { return $null }
    return $hash.Trim()
}

function Read-Manifest {
    param([string]$Path)
    $map = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $map }
    foreach ($line in Get-Content -LiteralPath $Path) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = $line -split "`t"
        if ($parts.Count -lt 4) { continue }
        $map[$parts[0]] = [pscustomobject]@{ Sha256 = $parts[1]; Size = [long]$parts[2]; PulledAt = $parts[3] }
    }
    return $map
}

function Write-Manifest {
    param([string]$Path, [hashtable]$Entries)
    $lines = $Entries.GetEnumerator() |
        Sort-Object Key |
        ForEach-Object { "{0}`t{1}`t{2}`t{3}" -f $_.Key, $_.Value.Sha256, $_.Value.Size, $_.Value.PulledAt }
    Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}

function Remove-OldFiles {
    param([string]$Dir, [string]$Pattern, [int]$Keep)
    if (-not (Test-Path -LiteralPath $Dir)) { return }
    $old = Get-ChildItem -LiteralPath $Dir -Filter $Pattern -File |
        Sort-Object Name -Descending |
        Select-Object -Skip $Keep
    foreach ($f in $old) {
        if ($DryRun) {
            Write-Log "[dry-run] rimuoverei $($f.FullName)" "PRUNE"
        } else {
            Remove-Item -LiteralPath $f.FullName -Force
            Write-Log "rimosso $($f.Name)" "PRUNE"
        }
    }
}

# --- avvio -------------------------------------------------------------------

Write-Log "off-site pull da $Remote`:$RemoteRoot/backups verso $Destination"
if ($DryRun) { Write-Log "modalita' dry-run: nessuna scrittura" "WARN" }

# Verifica preliminare: SSH raggiungibile. Fallisce presto e chiaro.
Invoke-Remote "test -d $RemoteRoot/backups && echo ok" | Out-Null

$dailyDir = Join-Path $Destination "daily"
$weeklyDir = Join-Path $Destination "weekly"
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $dailyDir, $weeklyDir | Out-Null
}

$manifestPath = Join-Path $Destination "manifest.tsv"
$manifest = Read-Manifest -Path $manifestPath

$copied = 0
$skipped = 0
$failed = 0

foreach ($subdir in @("daily", "weekly")) {
    $localDir = if ($subdir -eq "daily") { $dailyDir } else { $weeklyDir }
    $remoteFiles = Get-RemoteFiles -Subdir $subdir
    Write-Log "$subdir : $($remoteFiles.Count) file remoti"

    foreach ($file in $remoteFiles) {
        $relative = "$subdir/$($file.Name)"
        $localPath = Join-Path $localDir $file.Name

        $needsCopy = $true
        if (Test-Path -LiteralPath $localPath) {
            $localSize = (Get-Item -LiteralPath $localPath).Length
            $known = $manifest[$relative]
            if ($known -and $localSize -eq $file.Size -and $known.Size -eq $file.Size) {
                $needsCopy = $false
                $skipped++
            } elseif ($localSize -eq $file.Size) {
                # Stessa dimensione ma nessun manifest (o manifest riferito a
                # un'altra copia): verifica crittografica prima di riscaricare.
                $remoteHash = Get-RemoteSha256 -RelativePath $relative
                $localHash = (Get-FileHash -LiteralPath $localPath -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($remoteHash -and $remoteHash -eq $localHash) {
                    $manifest[$relative] = [pscustomobject]@{
                        Sha256 = $localHash; Size = $file.Size
                        PulledAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
                    }
                    $needsCopy = $false
                    $skipped++
                }
            }
        }

        if (-not $needsCopy) { continue }

        if ($DryRun) {
            Write-Log "[dry-run] scaricherei $relative ($($file.Size) byte)" "PULL"
            continue
        }

        $remoteHash = Get-RemoteSha256 -RelativePath $relative
        if (-not $remoteHash) {
            Write-Log "hash remoto non disponibile per $relative, salto" "WARN"
            $failed++
            continue
        }

        $tmpPath = "$localPath.part"
        try {
            & scp -q -o BatchMode=yes -o ConnectTimeout=15 "${Remote}:$RemoteRoot/backups/$relative" $tmpPath
            if ($LASTEXITCODE -ne 0) { throw "scp uscito con $LASTEXITCODE" }

            $localHash = (Get-FileHash -LiteralPath $tmpPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($localHash -ne $remoteHash) {
                throw "sha256 non combacia (remoto $remoteHash, locale $localHash)"
            }

            Move-Item -LiteralPath $tmpPath -Destination $localPath -Force
            $manifest[$relative] = [pscustomobject]@{
                Sha256 = $localHash; Size = $file.Size
                PulledAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
            }
            $copied++
            Write-Log "copiato $relative ($([math]::Round($file.Size / 1MB, 1)) MB)" "PULL"
        } catch {
            $failed++
            Write-Log "errore su ${relative}: $($_.Exception.Message)" "ERROR"
            if (Test-Path -LiteralPath $tmpPath) { Remove-Item -LiteralPath $tmpPath -Force }
        }
    }
}

if (-not $DryRun) {
    Write-Manifest -Path $manifestPath -Entries $manifest
}

# Rotazione locale: il PC conserva piu' storia del VPS.
Remove-OldFiles -Dir $dailyDir -Pattern "*postgres*" -Keep $KeepDaily
Remove-OldFiles -Dir $dailyDir -Pattern "*redis*" -Keep $KeepDaily
Remove-OldFiles -Dir $weeklyDir -Pattern "*postgres*" -Keep $KeepWeekly
Remove-OldFiles -Dir $weeklyDir -Pattern "*redis*" -Keep $KeepWeekly

# Log su file: una riga per esecuzione, utile per l'attivita' pianificata.
if (-not $DryRun) {
    $logDir = Join-Path $Destination "logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    Add-Content -LiteralPath (Join-Path $logDir "offsite-pull.log") -Value ($script:logLines -join [Environment]::NewLine) -Encoding UTF8
}

Write-Log "esito: $copied copiati, $skipped invariati, $failed errori"
if ($failed -gt 0) { exit 1 }
exit 0
