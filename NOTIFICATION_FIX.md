# Notification Fix - Trigger Format Issue

## Problem
The trigger object was missing the required `type` field, causing this error:
```
Failed to schedule test notification: The `trigger` object you provided is invalid. 
It needs to contain a type` or `channelld` entry.
```

## Solution
Added the `type` field to all notification triggers.

### Trigger Types Used:

#### 1. TIME_INTERVAL (for one-time/delayed notifications)
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  seconds: 2,
  repeats: false,
}
```
Used for:
- Welcome notification (2 seconds after login)
- Test notification (2 seconds after button click)

#### 2. DAILY (for recurring daily notifications)
```javascript
trigger: {
  type: Notifications.SchedulableTriggerInputTypes.DAILY,
  hour: 9,
  minute: 30,
  repeats: true,
}
```
Used for:
- 9:30 AM punch in reminder
- 6:00 PM punch out reminder

## Files Fixed:
1. `app/home-new.tsx` - All 3 notifications (welcome, 9:30 AM, 6:00 PM)
2. `app/profile.tsx` - Test notification button

## Testing:
1. **Test Button**: Profile → Test Notification → Minimize app → See notification in 2 seconds
2. **Login Welcome**: Logout → Login → Minimize app → See welcome notification
3. **Daily Reminders**: Wait for 9:30 AM or 6:00 PM to test

## Note:
This is the correct format for expo-notifications v55+. Older versions used simpler trigger objects without the `type` field.
