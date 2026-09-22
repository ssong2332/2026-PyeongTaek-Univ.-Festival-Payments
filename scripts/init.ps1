# init.ps1 — 템플릿에서 새 프로젝트 생성 직후 1회 실행 (Windows용, Linux/macOS는 init.sh)
# 사용법: powershell -ExecutionPolicy Bypass -File scripts/init.ps1 -ProjectName "프로젝트명"
# 동작: 모든 치환 결과를 메모리에서 먼저 계산·검증한 뒤 한 번에 기록.
#       검증 실패 시 아무 파일도 바꾸지 않고, 기록 중 오류 시 이미 쓴 파일을 원본으로 되돌린다.

param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ProjectName
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectName)) {
    Write-Host "### 결론: 초기화 실패 — 프로젝트명이 공백뿐이다. 변경된 파일 없음."
    exit 1
}
if ($ProjectName -match '[\p{C}]') {
    Write-Host "### 결론: 초기화 실패 — 프로젝트명에 줄바꿈·제어문자를 넣을 수 없다. 변경된 파일 없음."
    exit 1
}

$root = Split-Path -Parent $PSScriptRoot
$today = Get-Date -Format "yyyy-MM-dd"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$placeholderPattern = "\{\{[A-Z0-9_]+\}\}"

$targets = @(Join-Path $root "README.md")
$targets += Get-ChildItem -Path (Join-Path $root "docs") -Filter "*.md" -Recurse | ForEach-Object { $_.FullName }

# 1단계: 전부 읽고 치환 결과를 메모리에서 계산 (아직 기록하지 않음)
$plan = @()
foreach ($file in $targets) {
    $original = [System.IO.File]::ReadAllText($file)
    $new = $original.Replace("{{PROJECT_NAME}}", $ProjectName).Replace("{{DATE}}", $today)
    $plan += [pscustomobject]@{ File = $file; Original = $original; New = $new; Changed = ($new -ne $original) }
}

# 2단계: 기록 전 검증 — 치환 후에도 남는 플레이스홀더가 있으면 아무것도 쓰지 않고 실패
$leftover = @($plan | Where-Object { $_.New -match $placeholderPattern })
if ($leftover.Count -gt 0) {
    Write-Host "### 결론: 초기화 실패 — 알 수 없는 플레이스홀더 잔존. 변경된 파일 없음."
    foreach ($p in $leftover) {
        $found = ([regex]::Matches($p.New, $placeholderPattern) | ForEach-Object { $_.Value } | Sort-Object -Unique) -join ", "
        Write-Host "  잔존: $($p.File): $found"
    }
    exit 1
}

# 3단계: 일괄 기록 — 중간 실패 시 이미 쓴 파일을 원본으로 복구
$written = @()
try {
    foreach ($p in ($plan | Where-Object { $_.Changed })) {
        [System.IO.File]::WriteAllText($p.File, $p.New, $utf8NoBom)
        $written += $p
    }
}
catch {
    foreach ($w in $written) { [System.IO.File]::WriteAllText($w.File, $w.Original, $utf8NoBom) }
    Write-Host "### 결론: 초기화 실패 — 기록 중 오류로 이미 변경한 $($written.Count)개 파일을 원복했다. 오류: $($_.Exception.Message)"
    exit 1
}

Write-Host "### 결론: 초기화 성공 — 파일 $($written.Count)개 치환, 잔여 플레이스홀더 0건"
foreach ($w in $written) { Write-Host "  변경: $($w.File)" }
Write-Host "다음 단계: 아이디어 인터뷰(파이프라인 0단계) — 도구에 만들고 싶은 것을 말하면 된다. scripts/의 초기화 스크립트는 삭제해도 된다."
