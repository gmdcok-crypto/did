@echo off
cd /d "%~dp0"
set CERTS=%~dp0certs
if not exist "%CERTS%\key.pem" (
  echo Creating self-signed certificate...
  python scripts\gen_self_signed_cert.py
  if errorlevel 1 exit /b 1
)
echo Starting HTTPS server on https://localhost:8000 (and https://127.0.0.1:8000)
.\venv\Scripts\uvicorn.exe app.main:app --reload --host :: --port 8000 --ssl-keyfile="%CERTS%\key.pem" --ssl-certfile="%CERTS%\cert.pem"
