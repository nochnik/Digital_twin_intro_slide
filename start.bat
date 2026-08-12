@echo off
chcp 65001 >nul
title Цифровой двойник · показ
cd /d "%~dp0"

set PORT=8080

echo.
echo   ЦИФРОВОЙ ДВОЙНИК НА БАЗЕ ИС ABAI
echo   Запуск показа...
echo.

where node >nul 2>nul
if %errorlevel%==0 (
    start "" "http://localhost:%PORT%/"
    node server.js %PORT%
    goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" "http://localhost:%PORT%/"
    python -m http.server %PORT% --bind 127.0.0.1
    goto :end
)

where py >nul 2>nul
if %errorlevel%==0 (
    start "" "http://localhost:%PORT%/"
    py -m http.server %PORT% --bind 127.0.0.1
    goto :end
)

echo   [ОШИБКА] На компьютере не найден ни Node.js, ни Python.
echo   Установите Node.js (nodejs.org) — показу нужен локальный сервер.
echo.
pause

:end
