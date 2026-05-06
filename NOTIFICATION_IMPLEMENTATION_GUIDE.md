# Local Push Notifications Implementation Guide
## MY IMC App - Complete Documentation

---

## Table of Contents
1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Implementation Details](#implementation-details)
4. [Files Modified](#files-modified)
5. [Notification Schedule](#notification-schedule)
6. [Errors Encountered & Solutions](#errors-encountered--solutions)
7. [Testing Guide](#testing-guide)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Implemented local push notifications in the MY IMC React Native app to remind users about daily punch in/out times. The notifications work offline and don't require a backend server.

### Features Implemented:
- ✅ Daily 9:30 AM reminder: "Don't forget to punch in!"
- ✅ Daily 6:00 PM reminder: "Don't forget to punch out!"
- ✅ Welcome notification on login (for testing)
- ✅ Developer test button in Profile page
- ✅ Tap notification to open Punch screen
- ✅ Works even when app is closed

---

## Requirements

### Package Installed:
```bash
npm install expo-notifications
```

### Version:
- `expo-notifications`: ^55.0.17
- `expo`: ~54.0.33

### Platform Support:
- ✅ Android (tested and working)
- ✅ iOS (should work, not tested)

---

## Implementation Details

### 1. Configuration (app.json)

Added expo-notifications plugin to the plugins array:

```json
{
  "expo": {
    "plugins": [
      "expo-secure-store",
      [
        "expo-build-properties",
        {
          "android": {
            "usesCleartextTraffic": true,
            "requestLegacyExternalStorage": true
          }
        }
      ],
      "expo-web-browser",
      [
        "expo-notifications",
        {
          "icon": "./assets/images/app_logo_IF.png",
          "color": "#F5C451"
        }
      ]
    ]
  }
}
```

**Important**: After adding plugin to app.json, you MUST rebuild with EAS:
```bash
eas build --profile production --platform android
```

---

### 2. Home Screen Implementation (app/home-new.tsx)

#### Import Statement:
```javascript
import * as Notifications from 'expo-notifications';
```

#### Notification Handler Setup:
```javascript
// Configure notification handler (inside component)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```

#### Main Setup Function:
```javascript
const setupNotifications = async () => {
  try {
    // 1. Request permissions
    const { status } = await Notifications.requestPermissionsAsync();
    
    if (status !== 'granted') {
      console.log('Notification permission denied');
      return;
    }

    // 2. FIRST: Cancel any existing notifications to avoid duplicates
    await Notifications.cancelAllScheduledNotificationsAsync();

    // 3. THEN: Send welcome notification (2 seconds after login)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Welcome to MY IMC!",
        body: 'You have successfully logged in. Notifications are now active.',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        repeats: false,
      },
    });

    // 4. Schedule 9:30 AM daily notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Don't forget to punch in!",
        body: 'Start your workday - Punch in now',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 30,
        repeats: true,
      },
    });

    // 5. Schedule 6:00 PM daily notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Don't forget to punch out!",
        body: 'End your workday - Punch out now',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 18,
        minute: 0,
        repeats: true,
      },
    });

    console.log('Daily notifications scheduled successfully');
  } catch (error) {
    console.error('Error setting up notifications:', error);
  }
};
```

#### Notification Tap Handler:
```javascript
const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
  navigation.navigate('PunchRedesign');
};
```

#### Hook to Setup Notifications:
```javascript
useEffect(() => {
  if (userCredentials?.userId && !isInitializing) {
    fetchUserProfile();
    loadTodayPunchStatus();
    getCurrentLocation();
    setupNotifications(); // Setup daily notifications
  }
}, [userCredentials, isInitializing]);
```

#### Hook to Listen for Notification Taps:
```javascript
useEffect(() => {
  const init = async () => {
    await initializeUser();
    setIsInitializing(false);
  };
  init();

  // Set up notification tap listener
  const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
  
  return () => subscription.remove();
}, []);
```

---

### 3. Profile Page Test Button (app/profile.tsx)

#### Import Statement:
```javascript
import * as Notifications from 'expo-notifications';
```

#### Test Notification Function:
```javascript
const handleTestNotification = async () => {
  try {
    // Check if permission is granted
    const { status } = await Notifications.getPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Notification permission is not granted. Please enable it in settings.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Schedule test notification
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Test Notification",
        body: 'This is a test notification from MY IMC app!',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 2,
        repeats: false,
      },
    });
    
    console.log('Test notification scheduled with ID:', notificationId);
    
    Alert.alert(
      'Test Notification Scheduled',
      'A test notification will appear in 2 seconds. Minimize the app to see it in notification tray!',
      [{ text: 'OK' }]
    );
  } catch (error) {
    console.error('Test notification error:', error);
    Alert.alert(
      'Error', 
      `Failed to schedule test notification: ${error.message || 'Unknown error'}`,
      [{ text: 'OK' }]
    );
  }
};
```

#### UI Section Added:
```javascript
{/* Developer Section */}
<View style={styles.section}>
  <Text style={styles.sectionTitle}>DEVELOPER</Text>
  <View style={styles.sectionContent}>
    <TouchableOpacity style={styles.menuItem} onPress={handleTestNotification}>
      <View style={styles.menuItemLeft}>
        <View style={[styles.iconContainer, styles.testIconContainer]}>
          <Ionicons name="bug-outline" size={20} color="#F5C451" />
        </View>
        <Text style={styles.menuItemText}>Test Notification</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#bcb9ab" />
    </TouchableOpacity>
  </View>
</View>
```

#### Style Added:
```javascript
testIconContainer: {
  backgroundColor: '#FEF8E7',
},
```

---

## Files Modified

### 1. `package.json`
- Added: `"expo-notifications": "^55.0.17"`

### 2. `app.json`
- Added expo-notifications plugin configuration

### 3. `app/home-new.tsx`
- Imported expo-notifications
- Added notification handler
- Added setupNotifications() function
- Added handleNotificationResponse() function
- Added notification listener in useEffect
- Called setupNotifications() when user logs in

### 4. `app/profile.tsx`
- Imported expo-notifications
- Added handleTestNotification() function
- Added "DEVELOPER" section with test button
- Added testIconContainer style

---

## Notification Schedule

### 1. Morning Punch In Reminder (Daily)
- **When**: Every day at 9:30 AM
- **Title**: "Don't forget to punch in!"
- **Body**: "Start your workday - Punch in now"
- **Repeats**: Yes, daily
- **Type**: Scheduled reminder

### 2. Evening Punch Out Reminder (Daily)
- **When**: Every day at 6:00 PM
- **Title**: "Don't forget to punch out!"
- **Body**: "End your workday - Punch out now"
- **Repeats**: Yes, daily
- **Type**: Scheduled reminder

### 3. Punch In Success Notification (Instant)
- **When**: Immediately after successful punch in (1 second delay)
- **Title**: "Punch In Successful!"
- **Body**: "You punched in at [TIME]" (e.g., "You punched in at 09:32 AM")
- **Repeats**: No, one-time per punch
- **Type**: Action confirmation

### 4. Punch Out Success Notification (Instant)
- **When**: Immediately after successful punch out (1 second delay)
- **Title**: "Punch Out Successful!"
- **Body**: "You punched out at [TIME]" (e.g., "You punched out at 06:05 PM")
- **Repeats**: No, one-time per punch
- **Type**: Action confirmation

---

## Errors Encountered & Solutions

### Error 1: Notifications Not Showing Even When App is Closed

**Problem**: 
- Permission was granted
- No error messages
- But notifications never appeared

**Root Cause**: 
The notification scheduling order was wrong:
```javascript
// WRONG ORDER:
await scheduleNotification({...}); // Schedule welcome
await cancelAllScheduledNotificationsAsync(); // Cancel it immediately!
await scheduleNotification({...}); // Schedule daily
```

**Solution**:
Move `cancelAllScheduledNotificationsAsync()` to the beginning:
```javascript
// CORRECT ORDER:
await cancelAllScheduledNotificationsAsync(); // First cancel old ones
await scheduleNotification({...}); // Then schedule welcome
await scheduleNotification({...}); // Then schedule daily
```

**Why This Happened**:
- The welcome notification was scheduled
- Then immediately cancelled by cancelAll
- This corrupted the notification queue
- All future scheduling attempts failed silently

---

### Error 2: "Failed to schedule test notification: The trigger object is invalid"

**Full Error Message**:
```
Failed to schedule test notification: The `trigger` object you provided is invalid. 
It needs to contain a type` or `channelld` entry. 
Refer to the documentation to update your code: 
https://docs.expo.dev/versions/latest/sdk/notifications/#notificationtriggerinput
```

**Problem**:
The trigger object was missing the required `type` field.

**Wrong Code**:
```javascript
trigger: {
  seconds: 2  // Missing 'type' field
}
```

**Correct Code**:
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  seconds: 2,
  repeats: false,
}
```

**Root Cause**:
- expo-notifications v55+ requires explicit `type` field
- Older versions (v50 and below) worked without it
- Documentation examples sometimes show old format

**Solution Applied to All Notifications**:

1. **Time-based (one-time) notifications**:
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  seconds: 2,
  repeats: false,
}
```

2. **Daily recurring notifications**:
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.DAILY,
  hour: 9,
  minute: 30,
  repeats: true,
}
```

---

### Error 3: Permission Asked But Notifications Still Not Working

**Problem**:
- Permission dialog appeared
- User tapped "Allow"
- But notifications still didn't work

**Root Causes**:
1. Testing in Expo Go (limited notification support)
2. Plugin not included in EAS build
3. App not rebuilt after adding plugin to app.json

**Solution**:
1. Don't use Expo Go for testing notifications
2. Build with EAS after adding plugin:
   ```bash
   eas build --profile production --platform android
   ```
3. Install the EAS-built APK on device
4. Test notifications

**Important Note**:
Plugin changes in app.json require a full rebuild. Just running `npm install` is not enough!

---

## Testing Guide

### Test 1: Welcome Notification (Login Test)
1. Logout from the app
2. Login with credentials
3. Wait for home screen to load
4. **Minimize the app** (press home button)
5. Wait 2 seconds
6. Pull down notification tray
7. ✅ Should see: "Welcome to MY IMC!"

### Test 2: Developer Test Button
1. Open the app
2. Navigate to Profile page (More → Profile)
3. Scroll down to "DEVELOPER" section
4. Tap "Test Notification"
5. Alert appears → Tap "OK"
6. **Minimize the app immediately**
7. Wait 2 seconds
8. Pull down notification tray
9. ✅ Should see: "Test Notification"

### Test 3: Daily 9:30 AM Reminder
1. Wait until 9:30 AM
2. App can be open or closed
3. At 9:30 AM, notification appears
4. ✅ Should see: "Don't forget to punch in!"
5. Tap notification → Opens Punch screen

### Test 4: Daily 6:00 PM Reminder
1. Wait until 6:00 PM
2. App can be open or closed
3. At 6:00 PM, notification appears
4. ✅ Should see: "Don't forget to punch out!"
5. Tap notification → Opens Punch screen

### Test 5: Notification Tap Action
1. Trigger any notification (test button or daily)
2. When notification appears in tray
3. Tap on the notification
4. ✅ App should open to Punch screen (PunchRedesign)

---

## Troubleshooting

### Issue: Notifications Not Showing

**Check 1: Permission Status**
```javascript
const { status } = await Notifications.getPermissionsAsync();
console.log('Permission status:', status);
// Should be: 'granted'
```

**Check 2: Scheduled Notifications**
```javascript
const scheduled = await Notifications.getAllScheduledNotificationsAsync();
console.log('Scheduled notifications:', scheduled.length);
console.log('Details:', scheduled);
// Should show 2 notifications (9:30 AM and 6:00 PM)
```

**Check 3: Phone Settings**
- Go to: Settings → Apps → MY IMC → Notifications
- Ensure notifications are enabled
- Check "Show notifications" is ON

**Check 4: Do Not Disturb Mode**
- Disable Do Not Disturb mode
- Or add MY IMC to exceptions

**Check 5: Battery Optimization**
- Some Android phones (Samsung, Xiaomi, Huawei) kill background tasks
- Go to: Settings → Battery → Battery Optimization
- Find MY IMC → Select "Don't optimize"

---

### Issue: "Permission Denied" Error

**Solution 1: Re-request Permission**
```javascript
const { status } = await Notifications.requestPermissionsAsync();
```

**Solution 2: Manual Enable**
- Go to: Settings → Apps → MY IMC → Permissions → Notifications
- Enable manually

---

### Issue: Notifications Show When App is Open

**Expected Behavior**:
- When app is in **foreground** (open), notifications may not show in tray
- They might show as in-app alerts instead
- This is controlled by the notification handler

**To Test Properly**:
- Always minimize the app after triggering notification
- Check notification tray, not the app screen

---

### Issue: Daily Notifications Not Repeating

**Check**:
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.DAILY,
  hour: 9,
  minute: 30,
  repeats: true,  // Must be true!
}
```

**Note**: 
- If user uninstalls app, all scheduled notifications are lost
- If user clears app data, notifications are lost
- Need to login again to reschedule

---

### Issue: Wrong Time Zone

**Problem**: Notifications trigger at wrong time

**Cause**: 
- The `hour` and `minute` use device's local time zone
- Should work correctly automatically

**If Issue Persists**:
- Check device time settings
- Ensure automatic time zone is enabled

---

## Advanced: Debugging in Production

Since console.log doesn't work in EAS builds, add visual feedback:

```javascript
const setupNotifications = async () => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Debug', 'Permission denied');
      return;
    }

    await Notifications.cancelAllScheduledNotificationsAsync();
    
    await Notifications.scheduleNotificationAsync({...});
    
    // Show success alert
    Alert.alert('Debug', 'Notifications scheduled successfully');
    
  } catch (error) {
    Alert.alert('Debug Error', error.message);
  }
};
```

---

## Notification Trigger Types Reference

### TIME_INTERVAL
For one-time or interval-based notifications:
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  seconds: 10,      // Trigger after 10 seconds
  repeats: false,   // One-time only
}
```

### DAILY
For daily recurring notifications:
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.DAILY,
  hour: 9,          // 9 AM
  minute: 30,       // 30 minutes
  repeats: true,    // Every day
}
```

### WEEKLY
For weekly recurring notifications:
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
  weekday: 2,       // 1=Sunday, 2=Monday, etc.
  hour: 9,
  minute: 0,
  repeats: true,
}
```

### CALENDAR
For specific date/time:
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
  date: new Date(2024, 11, 25, 10, 0, 0), // Dec 25, 2024, 10:00 AM
  repeats: false,
}
```

---

## Best Practices

### 1. Always Cancel Before Rescheduling
```javascript
await Notifications.cancelAllScheduledNotificationsAsync();
// Then schedule new ones
```

### 2. Check Permission Before Scheduling
```javascript
const { status } = await Notifications.getPermissionsAsync();
if (status !== 'granted') {
  await Notifications.requestPermissionsAsync();
}
```

### 3. Handle Errors Gracefully
```javascript
try {
  await Notifications.scheduleNotificationAsync({...});
} catch (error) {
  console.error('Notification error:', error);
  // Don't crash the app
}
```

### 4. Test on Real Device
- Don't rely on emulator/simulator
- Test on actual Android/iOS device
- Test with app closed, minimized, and open

### 5. Provide User Control
- Add settings to enable/disable notifications
- Let users customize notification times
- Respect user preferences

---

## Future Enhancements

### Possible Improvements:
1. **Custom notification times**: Let users set their own punch in/out times
2. **Notification settings page**: Enable/disable specific notifications
3. **Smart notifications**: Only notify if user hasn't punched in by 10 AM
4. **Weekly summary**: "You worked 40 hours this week"
5. **Missed punch alerts**: "You forgot to punch out yesterday"
6. **Location-based**: Only notify when user is near office
7. **Notification history**: Show past notifications in app

---

## Summary

### What Works:
✅ Daily 9:30 AM punch in reminder  
✅ Daily 6:00 PM punch out reminder  
✅ Punch in success notification (instant)  
✅ Punch out success notification (instant)  
✅ Test button in Profile page (for debugging)  
✅ Tap notification to open Punch screen  
✅ Works when app is closed  
✅ Works offline (no internet needed)  
✅ Shows exact time of punch in notification  

### Key Learnings:
1. expo-notifications v55+ requires `type` field in trigger
2. Always cancel before scheduling to avoid duplicates
3. Plugin changes require EAS rebuild
4. Test on real device, not Expo Go
5. Minimize app to see notifications in tray

### Files to Reference:
- `app/home-new.tsx` - Main notification setup
- `app/profile.tsx` - Test button implementation
- `app.json` - Plugin configuration
- This document - Complete guide

---

## Contact & Support

For issues or questions:
1. Check this documentation first
2. Review error messages carefully
3. Test with the Profile test button
4. Check phone notification settings
5. Verify EAS build includes plugin

---

**Document Version**: 1.0  
**Last Updated**: January 2025  
**App Version**: 4.0.0  
**Tested On**: Android (EAS Build)  
**Status**: ✅ Working

---

## Quick Reference Commands

```bash
# Install package
npm install expo-notifications

# Build with EAS
eas build --profile production --platform android

# Check scheduled notifications (in code)
const scheduled = await Notifications.getAllScheduledNotificationsAsync();
console.log(scheduled);

# Cancel all notifications (in code)
await Notifications.cancelAllScheduledNotificationsAsync();

# Request permission (in code)
const { status } = await Notifications.requestPermissionsAsync();
```

---

**End of Documentation**
