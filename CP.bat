@echo off
:: Configura o Node portátil
set PATH=%~dp0node;%PATH%
cd /d "%~dp0"

echo Iniciando servidor local para paginas HTML...
:: O npx ativa o servidor em segundo plano na porta 3000 apontando para a pasta atual
start /b npx http-server . -p 3000

:: Aguarda 3 segundos para o servidor subir
timeout /t 3 > nul

:: Abre a sua pagina inicial no navegador
start http://localhost:3000/index.html
exit