; SCENSUS Dashboard - Inno Setup Installer Script
; Build with: Inno Setup Compiler (https://jrsoftware.org/isinfo.php)
;
; Prerequisites:
; 1. Run: pyinstaller logtail_dashboard_windows.spec
; 2. Ensure dist/SCENSUS_Dashboard folder exists
; 3. Open this file in Inno Setup Compiler and click Build

#define MyAppName "SCENSUS Dashboard"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "SCENSUS Technologies"
#define MyAppURL "https://scensus.com"
#define MyAppExeName "SCENSUS_Dashboard.exe"
#define MyAppDescription "UAS Test & Evaluation Dashboard for real-time GPS tracker monitoring"

[Setup]
; Application information
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}

; Installation settings
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
DisableProgramGroupPage=yes

; Output settings
OutputDir=installer_output
OutputBaseFilename=SCENSUS_Dashboard_Setup_{#MyAppVersion}
SetupIconFile=scensus_icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}

; Compression
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; Privileges (no admin required for per-user install)
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; Appearance
WizardStyle=modern
WizardSizePercent=100

; Add file associations (optional)
; ChangesAssociations=yes

; Show progress during install
ShowTasksTreeLines=yes

; Restart handling
CloseApplications=yes
RestartApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

[Files]
; Main application files from PyInstaller output
Source: "dist\SCENSUS_Dashboard\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Sample config file (will be created on first run, but include a template)
; Source: "config_template.json"; DestDir: "{app}"; DestName: "config_template.json"; Flags: ignoreversion

[Icons]
; Start menu shortcut
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Comment: "{#MyAppDescription}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; Desktop shortcut (optional based on user choice)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon; Comment: "{#MyAppDescription}"

[Run]
; Launch application after installation
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up config file on uninstall (optional - comment out to keep user settings)
; Type: files; Name: "{app}\config.json"

[Code]
// Optional: Custom installation page for folder selection
// This is commented out because the app handles first-run setup itself

(*
var
  LogFolderPage: TInputDirWizardPage;

procedure InitializeWizard;
begin
  // Create custom page for log folder selection
  LogFolderPage := CreateInputDirPage(wpSelectDir,
    'Select Log Data Folder',
    'Where is your UAS log data stored?',
    'Select the folder where your NMEA logger writes CSV files, then click Next.',
    False, '');
  LogFolderPage.Add('');
  LogFolderPage.Values[0] := 'C:\LogData';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ConfigFile: string;
  ConfigContent: string;
begin
  if CurStep = ssPostInstall then
  begin
    // Create initial config file with user's selected folder
    ConfigFile := ExpandConstant('{app}\config.json');
    ConfigContent := '{' + #13#10 +
      '  "log_root_folder": "' + LogFolderPage.Values[0] + '",' + #13#10 +
      '  "port": 8082,' + #13#10 +
      '  "bind_host": "127.0.0.1",' + #13#10 +
      '  "stale_seconds": 60,' + #13#10 +
      '  "enable_map": true' + #13#10 +
      '}';
    SaveStringToFile(ConfigFile, ConfigContent, False);
  end;
end;
*)
