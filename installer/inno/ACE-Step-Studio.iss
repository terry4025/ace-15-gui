; ACE-Step Studio Inno Setup script (scaffold)
; This is a starting point. You must adjust paths to match your build output.
;
; Recommended approach for offline bundle:
; - Install app binaries under {app}
; - Install large model checkpoints under {commonappdata}\ACE-Step\checkpoints
; - Keep user config under %APPDATA%\ACE-Step Studio (handled at runtime)

[Setup]
AppName=ACE-Step Studio
AppVersion=0.1.0
DefaultDirName={autopf}\ACE-Step Studio
DefaultGroupName=ACE-Step Studio
UninstallDisplayIcon={app}\ACE-Step Studio.exe
Compression=lzma
SolidCompression=yes
OutputBaseFilename=ACE-Step-Studio-Setup
ArchitecturesInstallIn64BitMode=x64

[Files]
; Tauri build output (example):
; Source: "..\..\desktop\src-tauri\target\release\ACE-Step Studio.exe"; DestDir: "{app}"; Flags: ignoreversion

; Portable python runtime (copy from ACE-Step portable package):
; Source: "..\..\python_embeded\*"; DestDir: "{app}\python_embeded"; Flags: recursesubdirs createallsubdirs

; Backend sources (if shipping sources in installer):
; Source: "..\..\acestep\*"; DestDir: "{app}\acestep"; Flags: recursesubdirs createallsubdirs

; Frontend dist (optional if bundled into Tauri resources already):
; Source: "..\..\ui\app\dist\*"; DestDir: "{app}\ui\app\dist"; Flags: recursesubdirs createallsubdirs

; Model checkpoints (offline bundle). This can be tens of GB.
; Source: "..\..\checkpoints\*"; DestDir: "{commonappdata}\ACE-Step\checkpoints"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\ACE-Step Studio"; Filename: "{app}\ACE-Step Studio.exe"

[Run]
Filename: "{app}\ACE-Step Studio.exe"; Description: "Launch ACE-Step Studio"; Flags: nowait postinstall skipifsilent

