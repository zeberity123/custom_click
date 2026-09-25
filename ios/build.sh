#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 ios/generate-project.py
mkdir -p ios/build
clang++ -std=c++17 -O2 -Wall -Wextra ios/Tests/RhythmDSPTests.cpp -o ios/build/dsp-tests
ios/build/dsp-tests
xcodebuild -project ios/Click.xcodeproj -scheme Click -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -derivedDataPath ios/build/device CODE_SIGNING_ALLOWED=NO build > ios/build/device.log 2>&1 || { tail -100 ios/build/device.log; exit 1; }
mkdir -p ios/build/package/Payload
ditto ios/build/device/Build/Products/Release-iphoneos/Click.app ios/build/package/Payload/Click.app
version=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' ios/build/package/Payload/Click.app/Info.plist)
(cd ios/build/package && ditto -c -k --keepParent Payload "../Custom-Click-${version}-ios-unsigned.ipa")
shasum -a 256 ios/build/*-ios-unsigned.ipa > ios/build/SHA256SUMS-ios.txt
echo 'IPA compiled for physical iPad/iPhone. Sign it with your sideloading tool before installing.'
