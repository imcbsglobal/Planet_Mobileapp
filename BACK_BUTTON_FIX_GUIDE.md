# Quick Fix Script for All Remaining Files

## Files Fixed ✅
1. home-new.tsx
2. punch-redesign.tsx
3. request.tsx
4. profile.tsx
5. leave-request.tsx
6. late-request.tsx
7. early-request.tsx

## Files Still Need Fixing - Apply These Changes:

### For ALL remaining files, make these 3 changes:

#### Change 1: Import Statement
Find:
```typescript
import { useRouter } from 'expo-router';
// OR
import { useLocalSearchParams, useRouter } from 'expo-router';
```

Replace with:
```typescript
import { useNavigation } from '@react-navigation/native';
// OR (if using params)
import { useNavigation, useRoute } from '@react-navigation/native';
```

#### Change 2: Hook Declaration
Find:
```typescript
const router = useRouter();
const params = useLocalSearchParams();
```

Replace with:
```typescript
const navigation = useNavigation();
// If using params:
const route = useRoute();
const params = route.params || {};
```

#### Change 3: All Navigation Calls
Find and Replace:
- `router.back()` → `navigation.goBack()`
- `router.replace('/login')` → `navigation.replace('Login')`
- `router.push('/screen-name')` → `navigation.navigate('ScreenName')`

## Remaining Files to Fix:

### High Priority:
1. **view-leave-requests.tsx**
   - router.back() → navigation.goBack()
   - router.replace('/login') → navigation.replace('Login')
   - router.push('/leave-request') → navigation.navigate('LeaveRequest')

2. **view-late-requests.tsx**
   - router.back() → navigation.goBack()
   - router.replace('/login') → navigation.replace('Login')
   - router.push('/late-request') → navigation.navigate('LateRequest')

3. **view-early-requests.tsx**
   - router.back() → navigation.goBack()
   - router.replace('/login') → navigation.replace('Login')
   - router.push('/early-request') → navigation.navigate('EarlyRequest')

4. **notifications.tsx**
   - router.back() → navigation.goBack()

5. **about.tsx**
   - router.back() → navigation.goBack()

### Medium Priority:
6. **collection.tsx**
   - router.back() → navigation.goBack()
   - router.replace('/login') → navigation.replace('Login')
   - router.push({ pathname: '/addcollection', params: {...} }) → navigation.navigate('AddCollection', {...})

7. **addcollection.tsx**
   - router.back() → navigation.goBack()
   - router.replace('/login') → navigation.replace('Login')

8. **feeder.tsx**
   - router.back() → navigation.goBack()
   - router.push(`/${route}`) → navigation.navigate(routeMap[route])

9. **add-feeder.tsx**
   - router.back() → navigation.goBack()

10. **fuel.tsx**
    - router.back() → navigation.goBack()

11. **leads.tsx**
    - router.back() → navigation.goBack()

12. **target.tsx**
    - router.back() → navigation.goBack()

13. **dashboard.tsx**
    - router.back() → navigation.goBack()
    - router.push(`/${route}`) → navigation.navigate(routeMap[route])

### Low Priority (Alternative screens):
14. **home.tsx** (if still used)
15. **punch.tsx** (if still used)
16. **punch-new.tsx** (if still used)

## Testing After Each Fix:
1. Navigate to the screen
2. Test back button
3. Test any navigation to other screens
4. Check console for errors

## Common Screen Name Mappings:
- /login → Login
- /home-new → HomeNew
- /punch-redesign → PunchRedesign
- /request → Request
- /leave-request → LeaveRequest
- /late-request → LateRequest
- /early-request → EarlyRequest
- /view-leave-requests → ViewLeaveRequests
- /view-late-requests → ViewLateRequests
- /view-early-requests → ViewEarlyRequests
- /profile → Profile
- /notifications → Notifications
- /about → About
- /collection → Collection
- /addcollection → AddCollection
- /feeder → Feeder
- /add-feeder → AddFeeder
- /fuel → Fuel
- /leads → Leads
- /target → Target
- /dashboard → Dashboard
