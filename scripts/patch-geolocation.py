import os
import glob

cargo_dir = os.path.expanduser('~/.cargo/registry/src')
found = False
for file_path in glob.glob(os.path.join(cargo_dir, '**/GeolocationPlugin.swift'), recursive=True):
    print(f"Patching {file_path}")
    found = True
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace authorization requests
    content = content.replace('requestWhenInUseAuthorization()', 'requestAlwaysAuthorization()')
    
    # Replace init method to add background options if not already added
    if 'allowsBackgroundLocationUpdates' not in content:
        content = content.replace(
            'locationManager.delegate = self',
            'locationManager.delegate = self\n    #if os(iOS)\n    locationManager.allowsBackgroundLocationUpdates = true\n    locationManager.showsBackgroundLocationIndicator = false\n    #endif'
        )
        print("Patched initialization options.")
    else:
        print("Background location options already present.")
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

if not found:
    print("No GeolocationPlugin.swift found in cargo cache.")
