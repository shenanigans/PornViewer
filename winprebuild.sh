#!/bin/bash
# lol no run this shit in mingw
# BEFORE running winbuild.bat

npm update
cd src
npm update
cd node_modules/lwip
nw-gyp clean
nw-gyp configure --msvs_version=2013 --target=0.12.3
nw-gyp build
cd ../../../
gulp once
cat resources/x64/nw.exe package.zip > build/x64/nw.exe
cd src/node_modules/lwip
nw-gyp clean
nw-gyp configure --msvs_version=2013 --target=0.12.3 --arch=ia32
nw-gyp build --arch=ia32
cd ../../../
gulp once
cat resources/x86/nw.exe package.zip > build/x86/nw.exe
