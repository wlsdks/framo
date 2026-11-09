@echo off
chcp 65001 >nul
rem 더블클릭하면 Framo를 켜고 크롬(없으면 엣지)으로 엽니다. 이 PC 안에서만 열려요.
rem 첫 줄 다음에 바로 chcp를 둔다. 그 전에 한글이 있으면 윈도우가 이 파일을 잘못 읽을 수 있다.
rem 서버가 아니라 시작 프로그램(dist-node\launch.mjs)을 켠다. 받아서 풀어 둔 새 버전(versions\)이 있으면 그 버전이 켜진다.
cd /d "%~dp0"
title Framo

rem 함께 들어 있는 node.exe를 먼저 쓰고, 없으면 이 PC에 설치된 Node.js를 쓴다
set "NODE=%~dp0node\node.exe"
if not exist "%NODE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo.
    echo   Node.js를 찾지 못했어요. 받은 zip 파일을 통째로 다시 풀어 주세요.
    echo   node 폴더가 없는 판이라면 https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
    echo.
    pause
    exit /b 1
  )
  set "NODE=node"
)

if not exist "dist-node\launch.mjs" (
  echo.
  echo   화면 파일이 없어요. zip 파일 안에서 바로 실행하지 말고,
  echo   먼저 "압축 풀기"를 한 다음 풀린 폴더에서 다시 실행해 주세요.
  echo.
  pause
  exit /b 1
)

where curl >nul 2>nul
if errorlevel 1 goto foreground

rem 서버는 작게 내린 창에서 돌리고, 켜진 것을 확인하면 이 창은 닫는다
echo.
echo   Framo를 켜고 있어요. 잠시 뒤 브라우저가 열려요.
start "Framo - 이 창을 닫으면 꺼져요" /min "%NODE%" dist-node\launch.mjs
for /l %%i in (1,1,15) do (
  timeout /t 1 /nobreak >nul
  curl -s -f -o nul http://127.0.0.1:41580/__html-maker && exit /b 0
)
echo.
echo   Framo를 켜지 못했어요.
echo   작업 표시줄의 "Framo" 창이 있으면 열어서 이유를 확인해 주세요.
echo.
pause
exit /b 1

:foreground
echo.
echo   Framo를 켜고 있어요. 발표를 만드는 동안 이 창은 닫지 말고 내려 두세요.
echo.
"%NODE%" dist-node\launch.mjs
pause
