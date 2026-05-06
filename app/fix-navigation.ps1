# Batch Fix Script for Navigation
# Run this in PowerShell from the app directory

$files = @(
    "view-early-requests.tsx",
    "notifications.tsx",
    "about.tsx"
)

foreach ($file in $files) {
    Write-Host "Fixing $file..." -ForegroundColor Yellow
    
    # Read file content
    $content = Get-Content $file -Raw
    
    # Fix imports
    $content = $content -replace "import \{ useLocalSearchParams, useRouter \} from 'expo-router';", "import { useNavigation, useRoute } from '@react-navigation/native';"
    $content = $content -replace "import \{ useRouter \} from 'expo-router';", "import { useNavigation } from '@react-navigation/native';"
    $content = $content -replace "import \{ useFocusEffect, useRouter \} from 'expo-router';", "import { useNavigation } from '@react-navigation/native';"
    
    # Fix hook declarations
    $content = $content -replace "const router = useRouter\(\);`r?`n  const params = useLocalSearchParams\(\);", "const navigation = useNavigation();`n  const route = useRoute();`n  const params = route.params || {};"
    $content = $content -replace "const router = useRouter\(\);", "const navigation = useNavigation();"
    
    # Fix navigation calls
    $content = $content -replace "router\.back\(\)", "navigation.goBack()"
    $content = $content -replace "router\.replace\('/login'\)", "navigation.replace('Login')"
    $content = $content -replace "router\.push\('/leave-request'\)", "navigation.navigate('LeaveRequest')"
    $content = $content -replace "router\.push\('/late-request'\)", "navigation.navigate('LateRequest')"
    $content = $content -replace "router\.push\('/early-request'\)", "navigation.navigate('EarlyRequest')"
    $content = $content -replace "router\.push\('/notifications'\)", "navigation.navigate('Notifications')"
    $content = $content -replace "router\.push\('/about'\)", "navigation.navigate('About')"
    $content = $content -replace "router\.push\('/profile'\)", "navigation.navigate('Profile')"
    $content = $content -replace "router\.push\('/home-new'\)", "navigation.navigate('HomeNew')"
    $content = $content -replace "router\.push\('/punch-redesign'\)", "navigation.navigate('PunchRedesign')"
    $content = $content -replace "router\.push\('/request'\)", "navigation.navigate('Request')"
    
    # Fix dependency arrays
    $content = $content -replace ", router\]", "]"
    
    # Write back
    Set-Content $file $content -NoNewline
    
    Write-Host "✓ Fixed $file" -ForegroundColor Green
}

Write-Host "`nAll files fixed!" -ForegroundColor Cyan
