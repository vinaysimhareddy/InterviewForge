Add-Type -AssemblyName System.Speech

$dataDir = "$PSScriptRoot\..\data\stt_eval_answers"
if (-not (Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}

$answers = @(
    @{ id = "ans_01"; text = "To guarantee distributed idempotency across payment services we persist unique request tokens and apply transactional outbox patterns" },
    @{ id = "ans_02"; text = "In React reconciliation compares virtual DOM trees using unique keys to minimize real DOM mutations and layout reflows" },
    @{ id = "ans_03"; text = "Circuit breakers prevent cascading failures in microservices by intercepting failing endpoints and falling back gracefully" },
    @{ id = "ans_04"; text = "The CAP theorem forces distributed databases to choose between strong consistency and high availability during network partitions" },
    @{ id = "ans_05"; text = "B-trees excel at range queries and sequential disk scans whereas hash indexes provide constant time single key lookups" },
    @{ id = "ans_06"; text = "We protect public REST endpoints by validating JWT tokens on incoming requests and throttling traffic via Redis token buckets" },
    @{ id = "ans_07"; text = "Python uses a global interpreter lock to ensure thread safety preventing multiple native threads from executing bytecode in parallel" },
    @{ id = "ans_08"; text = "Kafka achieves high throughput through sequential disk append logs partition parallelism and zero copy kernel page caching" },
    @{ id = "ans_09"; text = "Continuous integration pipelines validate pull requests by executing unit tests and code linters before building container images" },
    @{ id = "ans_10"; text = "To prevent SQL injection attacks developers must always use parameterized queries instead of string concatenation" }
)

$meta = @()

foreach ($item in $answers) {
    $wavPath = "$dataDir\$($item.id).wav"
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $synth.Rate = 0
    $synth.SetOutputToWaveFile($wavPath)
    $synth.Speak($item.text)
    $synth.Dispose()

    $meta += [PSCustomObject]@{
        id = $item.id
        wav_file = "$($item.id).wav"
        reference_text = $item.text
        size_bytes = (Get-Item $wavPath).Length
    }
    Write-Host "Synthesized $($item.id).wav ($((Get-Item $wavPath).Length) bytes)"
}

$meta | ConvertTo-Json -Depth 4 | Set-Content "$dataDir\manifest.json" -Encoding utf8
Write-Host "Manifest written to $dataDir\manifest.json"

