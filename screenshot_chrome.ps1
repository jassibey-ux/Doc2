Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Try to bring Chrome to foreground
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$chrome = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($chrome) {
    [Win32]::SetForegroundWindow($chrome.MainWindowHandle)
    Start-Sleep -Milliseconds 500
}

# Take screenshot
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen(0, 0, 0, 0, $screen.Size)
$bitmap.Save("C:\Users\jassi\OneDrive\Desktop\Desktop\logtail-dashboard\dashboard_screenshot.png")
$graphics.Dispose()
$bitmap.Dispose()
Write-Host "Screenshot saved"
