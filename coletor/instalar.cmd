@echo off
rem Instala o coletor em uma pasta curta e fixa, fora do projeto.
rem O repositorio de coleta fica preso a uma versao revisada: atualize so depois de revisar.
setlocal
set "DESTINO=%USERPROFILE%\DiagnosticoColetor"
set "REPO=https://github.com/omkarcloud/instagram-scraper"
set "VERSAO=4324561"

if not exist "%DESTINO%" mkdir "%DESTINO%"
copy /Y "%~dp0coletor.py" "%DESTINO%\coletor.py" >nul

if not exist "%DESTINO%\.venv\Scripts\python.exe" python -m venv "%DESTINO%\.venv" || exit /b 1
"%DESTINO%\.venv\Scripts\python.exe" -m pip install --quiet --disable-pip-version-check curl_cffi==0.17.0 || exit /b 1

if not exist "%DESTINO%\vendor\instagram-scraper\.git" git clone --quiet "%REPO%" "%DESTINO%\vendor\instagram-scraper" || exit /b 1
git -C "%DESTINO%\vendor\instagram-scraper" fetch --quiet origin || exit /b 1
git -C "%DESTINO%\vendor\instagram-scraper" checkout --quiet "%VERSAO%" || exit /b 1

(
  echo @echo off
  echo title Coletor do diagnostico
  echo cd /d "%DESTINO%"
  echo set PYTHONIOENCODING=utf-8
  echo ".venv\Scripts\python.exe" coletor.py
  echo pause
) > "%DESTINO%\iniciar.cmd"

echo Coletor instalado em %DESTINO%
