@echo off

REM �o�̓t�@�C����
set OUTPUT_FILE=merged.txt

REM �����o�͐悪���ɑ��݂��Ă�����폜����
if exist %OUTPUT_FILE% del %OUTPUT_FILE%

echo HTML�t�@�C���̌���������...

for %%f in ("..\\*.html") do (
    echo %%~nxf >> %OUTPUT_FILE%
    type "%%f" >> %OUTPUT_FILE%
    echo --- >> %OUTPUT_FILE%
)

echo CSS�t�@�C���̌���������...

for %%f in ("..\\*.css") do (
    echo %%~nxf >> %OUTPUT_FILE%
    type "%%f" >> %OUTPUT_FILE%
    echo --- >> %OUTPUT_FILE%
)

echo JS�t�@�C���̌���������...

for %%f in ("..\\js\\*.js") do (
    echo %%~nxf >> %OUTPUT_FILE%
    type "%%f" >> %OUTPUT_FILE%
    echo --- >> %OUTPUT_FILE%
)

echo ���ׂẴt�@�C�����������܂����I
pause
