param(
    [Parameter(Mandatory = $true)]
    [string]$Url
)

$uri = [Uri]$Url
$port = if ($uri.IsDefaultPort) { 80 } else { $uri.Port }

function Test-PortOpen([int]$PortNumber) {
    foreach ($hostName in @("127.0.0.1", "localhost")) {
        $client = $null
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $task = $client.ConnectAsync($hostName, $PortNumber)
            if ($task.Wait(700) -and $client.Connected) {
                return $true
            }
        } catch {
        } finally {
            if ($client) {
                $client.Dispose()
            }
        }
    }
    return $false
}

$deadline = (Get-Date).AddMinutes(3)
while ((Get-Date) -lt $deadline) {
    if (Test-PortOpen $port) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 120 -MaximumRedirection 5 | Out-Null
        } catch {
            # The server is up. Open the browser even if the first page returned an error.
        }
        Start-Process $Url
        exit 0
    }
    Start-Sleep -Milliseconds 400
}

exit 1
