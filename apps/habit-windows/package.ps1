param(
    [string]$PackageName = 'ProPig.Habits.Development',
    [string]$Publisher = 'CN=ProPig Development',
    [string]$Version = '1.1.0.0'
)
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'HabitWindows.csproj'
$icon = Join-Path $PSScriptRoot '../../public/icons/justpig-favicon-144.png'
$output = Join-Path $PSScriptRoot 'out'
$staging = Join-Path $output ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null

dotnet publish $project --configuration Release --runtime win-x64 --self-contained true --output $staging
if ($LASTEXITCODE) { exit $LASTEXITCODE }

$manifest = [xml]@'
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap rescap">
  <Identity Name="ProPig.Habits.Development" Publisher="CN=ProPig Development" Version="1.1.0.0" ProcessorArchitecture="x64"/>
  <Properties>
    <DisplayName>ProPig 습관</DisplayName>
    <PublisherDisplayName>ProPig</PublisherDisplayName>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.22000.0" MaxVersionTested="10.0.26100.0"/>
  </Dependencies>
  <Resources><Resource Language="ko-kr"/></Resources>
  <Applications>
    <Application Id="Habits" Executable="ProPig.Habits.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="ProPig 습관" Description="ProPig 습관 트래커와 바탕화면 위젯"
        BackgroundColor="#101821" Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png"/>
    </Application>
  </Applications>
  <Capabilities>
    <Capability Name="internetClient"/>
    <rescap:Capability Name="runFullTrust"/>
  </Capabilities>
</Package>
'@
$identity = $manifest.DocumentElement.SelectSingleNode("*[local-name()='Identity']")
$identity.SetAttribute('Name', $PackageName)
$identity.SetAttribute('Publisher', $Publisher)
$identity.SetAttribute('Version', $Version)
$manifest.Save((Join-Path $staging 'AppxManifest.xml'))

Add-Type -AssemblyName System.Drawing
$assets = New-Item -ItemType Directory -Path (Join-Path $staging 'Assets')
$image = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $icon))
$logos = @{ 'StoreLogo.png' = 50; 'Square150x150Logo.png' = 150; 'Square44x44Logo.png' = 44 }
foreach ($size in 16, 24, 30, 32, 36, 48, 60, 64, 72, 96, 256) {
    $logos["Square44x44Logo.targetsize-${size}_altform-unplated.png"] = $size
    $logos["Square44x44Logo.targetsize-${size}_altform-lightunplated.png"] = $size
}
try {
    foreach ($entry in $logos.GetEnumerator()) {
        $bitmap = [System.Drawing.Bitmap]::new($entry.Value, $entry.Value)
        try {
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                $graphics.DrawImage($image, [System.Drawing.Rectangle]::new(0, 0, $entry.Value, $entry.Value))
            } finally {
                $graphics.Dispose()
            }
            $bitmap.Save((Join-Path $assets.FullName $entry.Key), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $bitmap.Dispose()
        }
    }
} finally {
    $image.Dispose()
}

$kit = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10/bin'
$makeAppx = Get-ChildItem -Path "$kit/*/x64/makeappx.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (-not $makeAppx) { throw 'Windows SDK MakeAppx was not found.' }
& $makeAppx.FullName pack /d $staging /p (Join-Path $output 'ProPig-Habits-x64.msix') /o
if ($LASTEXITCODE) { exit $LASTEXITCODE }
