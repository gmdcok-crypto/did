@echo off
REM Backend(port 8000) 프로세스 종료
echo Port 8000 사용 중인 프로세스 확인 중...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":8000 "') do (
  echo PID %%a 종료...
  taskkill /F /PID %%a 2>nul
)
echo 완료.
pause
