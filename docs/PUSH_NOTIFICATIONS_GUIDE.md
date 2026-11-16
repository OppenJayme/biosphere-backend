# Push notifications: setup and limits

Design and decisions: [spec 0004](./specs/0004-web-push-notifications.md).
Status on 2026-11-16: implemented behind a flag on
`feat/web-push-notifications-20261116` (backend and frontend). Migration not
applied, flag off, no real device tested yet. This is not acceptance.

## What it does

A curator turns on **Alerts on this device** in the bell panel. After that,
a new General Inquiry, a new Visit Request or an imported visitor reply sends
an empty push to every device of every active Curator. The service worker
then:

1. tells open BioSphere tabs to refresh the bell at once;
2. if no BioSphere tab is in front, reads the curator's own feed through
   `/api/notifications` and shows `BioSphere: <alert title> · Ref <code>`;
3. opens the record when the notification is clicked.

No visitor name, email or message ever goes through a push service. Signed
out or offline, the device shows a generic "New activity" alert.

## Turning it on (development or live)

1. Merge with the flag off.
2. Apply `prisma/migrations/20261116020000_add_push_subscription` through the
   approved process, then verify RLS is forced and only the backend role has
   access, as for `user_notification_state`:

   ```powershell
   npx prisma db execute --file prisma/migrations/20261116020000_add_push_subscription/migration.sql
   npx prisma migrate resolve --applied 20261116020000_add_push_subscription
   ```

3. Generate keys once per environment and keep them only in the server `.env`
   (never Git, chat or docs). See [Rotating the keys](#rotating-the-keys)
   before ever changing them.

   ```powershell
   npm run push:vapid-keys
   ```

   ```
   PUSH_NOTIFICATIONS_ENABLED=true
   VAPID_PUBLIC_KEY=<from the command>
   VAPID_PRIVATE_KEY=<from the command>
   VAPID_SUBJECT=mailto:<museum contact address>
   ```

4. Restart the backend. A warning in the log means the keys or subject are
   invalid and push stays off.
5. Run the frontend as a production build (`npm run build` then `npm start`).
   The service worker is not registered in `npm run dev`, so push cannot work
   there.

## Browser notes

- Chrome, Edge and Firefox on desktop and Android: works from the site.
- iPhone and iPad (iOS 16.4+): only from BioSphere added to the Home Screen.
- The site must be served over https (localhost is allowed for testing).
- If a curator blocked notifications, the bell says so; they must allow them
  in the browser's site settings.

## Limits

- Only the three alert types above push. Everything else stays in the bell.
- Reply pushes follow Gmail sync, so they arrive up to
  `GMAIL_SYNC_INTERVAL_SECONDS` after the visitor sends.
- A system notification stays on a device after another curator handles the
  record; the bell is correct.
- Signing out does not unregister the device. The next curator to sign in on
  that browser takes it over; until then it shows only the generic alert.
- No retention job. A device is removed when a push service reports it gone
  (404/410) or after 5 failed pushes in a row; any success resets the count.

## Rotating the keys

Every browser subscription is tied to the VAPID public key it was made with,
so new keys invalidate all of them. Rotate only if the private key leaked:

1. Generate new keys, replace both `VAPID_*` values and restart the backend.
2. Each curator opens BioSphere on each device. The page notices the
   subscription uses the old key and re-subscribes with the new one by itself
   (permission is already granted). A device nobody opens stops receiving
   pushes; its old registration fails and is removed after 5 attempts.
3. If a device still shows no alerts, turn alerts off and on again in the bell.

## Turning it off

Set `PUSH_NOTIFICATIONS_ENABLED=false` and restart. Stored devices stay and
nothing is sent; the bell hides the device control.
