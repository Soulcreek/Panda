# Simple health check script
$response = Invoke-WebRequest -Uri http://localhost:3000/health -UseBasicParsing
if ($response.StatusCode -eq 200) {
    Write-Host "Health check PASSED. Server is running."
    $response.Content
} else {
    Write-Host "Health check FAILED. Server might be down or unresponsive."
    $response
}
