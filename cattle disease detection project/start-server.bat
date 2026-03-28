@echo off
setlocal

set PORT=8000
pushd "%~dp0"

echo Starting local server on http://127.0.0.1:%PORT%
python -m http.server %PORT%

popd
endlocal

