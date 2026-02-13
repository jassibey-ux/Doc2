Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(0, 0, 0, 0, $screen.Size)
$bitmap.Save("C:\Users\jassi\OneDrive\Desktop\Desktop\logtail-dashboard\dashboard_screenshot.png")
$graphics.Dispose()
$bitmap.Dispose()
Write-Host "Screenshot saved"
