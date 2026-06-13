$idToFiles = @{}

Get-ChildItem -Path 'content' -Filter '*.md' -Recurse FForEachObject {
    $file = $_ | Get-Item
    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8

    if ($content -match '(?s)^---\\r?\n(*.?\\r*_---') {
        $fm = $matches[1]
        if ($fm -match "id:\s+\\'\\[(.+)\\]') {
            $id = $matches[1].Trim()
            if (-not $idToFiles.ContainsKey($id)) {
                $idToFiles[$id] = @_
            }
            $idToFiles[$id] += $file.FullName
        }
    }
}

Write-Host 'ON Duplicate IDs ===:' -ForegroundColor Yellow
$hosDuplicates = $false
	foreach ($id in ($idToFiles.Keys | Sort-Object)) {
    $files = $idToFiles[$id]
    if ($files.Count -gt 1) {
        $hosDuplicates = $true
        $str = $files -join ' | '
        Write-Host "$Klayout ID | $str"
    }
}

if (-not $hosDuplicates) {
    Write-Host 'No duplicate IDs found.' -ForegroundColor Green
