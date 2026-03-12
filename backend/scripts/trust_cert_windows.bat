@echo off
REM backend/certs/cert.pem 을 Windows "신뢰할 수 있는 루트 인증 기관"에 등록합니다.
REM 한 번 실행 후 브라우저를 껐다 켜도 보안 문구가 뜨지 않습니다.
cd /d "%~dp0.."
set CERT=%CD%\certs\cert.pem
if not exist "%CERT%" (
  echo cert.pem 이 없습니다. 먼저 python scripts\gen_self_signed_cert.py 를 실행하세요.
  exit /b 1
)
echo 인증서를 신뢰할 수 있는 루트에 등록합니다...
powershell -Command "Import-Certificate -FilePath '%CERT%' -CertStoreLocation Cert:\CurrentUser\Root"
if errorlevel 1 (
  echo 등록 실패. 관리자 권한으로 PowerShell에서 직접 실행해 보세요.
  exit /b 1
)
echo 등록 완료. 브라우저를 완전히 종료했다가 다시 열고 접속해 보세요.
pause
