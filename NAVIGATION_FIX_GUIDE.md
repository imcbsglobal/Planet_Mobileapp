# Navigation Fix Guide

## Problem
The app was using `expo-router` (file-based routing) in screen files, but the actual navigation setup in `App.js` uses `@react-navigation/native` (React Navigation). These are incompatible systems.

## Solution
Replace all `useRouter()` from `expo-router` with `useNavigation()` from `@react-navigation/native`.

## Files Already Fixed ✅
1. ✅ home-new.tsx
2. ✅ punch-redesign.tsx  
3. ✅ request.tsx
4. ✅ profile.tsx
5. ✅ leave-request.tsx

## Files Still Need Fixing ⚠️

### High Priority (User-facing screens):
- late-request.tsx
- early-request.tsx
- view-leave-requests.tsx
- view-late-requests.tsx
- view-early-requests.tsx
- notifications.tsx
- about.tsx

### Medium Priority (Feature screens):
- collection.tsx
- addcollection.tsx
- feeder.tsx
- add-feeder.tsx
- fuel.tsx
- leads.tsx
- target.tsx
- dashboard.tsx

### Low Priority (Alternative screens):
- home.tsx (if still used)
- punch.tsx (if still used)
- punch-new.tsx (if still used)

## Quick Fix Pattern

### 1. Change Import:
```typescript
// OLD
import { useRouter } from 'expo-router';

// NEW
import { useNavigation } from '@react-navigation/native';
```

### 2. Change Hook:
```typescript
// OLD
const router = useRouter();

// NEW
const navigation = useNavigation();
```

### 3. Change Navigation Calls:

| Old (Expo Router) | New (React Navigation) |
|-------------------|------------------------|
| `router.push('/screen-name')` | `navigation.navigate('ScreenName')` |
| `router.replace('/login')` | `navigation.replace('Login')` |
| `router.back()` | `navigation.goBack()` |

### 4. Screen Name Mapping (from App.js):
- `/login` → `Login`
- `/home-new` → `HomeNew`
- `/punch-redesign` → `PunchRedesign`
- `/request` → `Request`
- `/leave-request` → `LeaveRequest`
- `/late-request` → `LateRequest`
- `/early-request` → `EarlyRequest`
- `/view-leave-requests` → `ViewLeaveRequests`
- `/view-late-requests` → `ViewLateRequests`
- `/view-early-requests` → `ViewEarlyRequests`
- `/profile` → `Profile`
- `/notifications` → `Notifications`
- `/about` → `About`
- `/collection` → `Collection`
- `/addcollection` → `AddCollection`
- `/feeder` → `Feeder`
- `/add-feeder` → `AddFeeder`
- `/fuel` → `Fuel`
- `/leads` → `Leads`
- `/target` → `Target`
- `/dashboard` → `Dashboard`

### 5. For screens using `useLocalSearchParams`:
```typescript
// OLD
import { useLocalSearchParams, useRouter } from 'expo-router';
const params = useLocalSearchParams();

// NEW
import { useNavigation, useRoute } from '@react-navigation/native';
const navigation = useNavigation();
const route = useRoute();
const params = route.params || {};
```

## Testing Checklist
After fixing each file, test:
- [ ] Navigation to the screen works
- [ ] Back button works
- [ ] Navigation to other screens from this screen works
- [ ] No "isReady" errors in console

## Note
The root cause was mixing two different navigation systems. Stick with React Navigation since that's what's configured in App.js.
