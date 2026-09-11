#!/usr/bin/env sh
set -eu

# tauri ios init regenerates src-tauri/gen/apple from its templates, and both
# CI workflows delete that directory before running it. So the launch screen
# and the app icon live outside it, and have to be laid back in after every
# init.

SRC="src-tauri/ios-launch"
DEST="src-tauri/gen/apple"

if [ ! -d "$DEST/Assets.xcassets" ]; then
	echo "apply-ios-launch-screen: $DEST/Assets.xcassets is missing; run tauri ios init first" >&2
	exit 1
fi

cp "$SRC/LaunchScreen.storyboard" "$DEST/LaunchScreen.storyboard"
for name in LaunchLogo.imageset LaunchBackground.colorset; do
	rm -rf "$DEST/Assets.xcassets/$name"
	cp -R "$SRC/$name" "$DEST/Assets.xcassets/$name"
done

# init fills AppIcon.appiconset with Tauri's placeholder logo. These carry the
# same file names as init's own Contents.json, so replacing the images in place
# is enough — the catalog needs no other change.
cp "$SRC"/AppIcon.appiconset/*.png "$DEST/Assets.xcassets/AppIcon.appiconset/"

echo "apply-ios-launch-screen: launch screen and app icon applied to $DEST"
