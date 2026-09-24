@echo off
cd /d "%~dp0"
if exist "release\Click-win32-x64\Click.exe" (
  start "" "release\Click-win32-x64\Click.exe"
) else if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
) else (
  echo Run npm install in this folder first, then try again.
  pause
)
