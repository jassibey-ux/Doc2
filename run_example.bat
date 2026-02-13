@echo off
REM Quick start script for running with example data

echo Starting SCENSUS Dashboard with example data...
echo.
echo Press Ctrl+C to stop
echo.

python -m logtail_dashboard --log-root "examples" --event "event_2024_01" --port 8082

pause
