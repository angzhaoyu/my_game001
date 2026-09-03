@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PYTHON_EXE=E:\soft\path\anaconda\envs\yolo_v5\python.exe"

echo ==========================================
echo   Starting game server...
echo   API: http://localhost:8000
echo   Python: %PYTHON_EXE%
echo ==========================================

if not exist "%PYTHON_EXE%" (
    echo ERROR: Python executable was not found.
    echo %PYTHON_EXE%
    echo.
    pause
    exit /b 1
)

set PYTHONUNBUFFERED=1
"%PYTHON_EXE%" server.py
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" echo Server failed to start. See the error details above.
echo Press any key to close this window...
pause >nul
exit /b %EXIT_CODE%
