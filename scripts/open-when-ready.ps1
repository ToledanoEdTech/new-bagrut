param(
    [Parameter(Mandatory = $true)]
    [string]$Url
)

for ($i = 0; $i -lt 120; $i++) {
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
            Start-Process $Url
            exit 0
        }
    } catch {
        # Server is not ready yet
    }

    Start-Sleep -Seconds 1
}

exit 1
