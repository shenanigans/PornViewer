"%wix%bin\heat.exe" dir "node_modules" -gg -ke -cg NodeModules -dr INSTALLDIR -template Product -out "node_modules.wxs" -sw5150
REM "%wix%bin\candle.exe" *.wxs -ext WixUtilExtension -arch x64 -dPlatform=x64 -out build\x64\
"%wix%bin\candle.exe" *.wxs -ext WixUtilExtension -arch x86 -dPlatform=x86 -out build\x86\
REM "%wix%bin\light.exe" -ext WixUIExtension -ext WixUtilExtension build\x64\*.wixobj -out build\PornViewer_x64.msi -sw1076 -b node_modules
"%wix%bin\light.exe" -ext WixUIExtension -ext WixUtilExtension build\x86\*.wixobj -out build\PornViewer_x86.msi -sw1076 -b node_modules
