# Prompt 28 — Update RideOptions schedule modal
read AGENTS.md first and follow it strictly
Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.

In @src/features/customer/components/RideOptions.tsx around lines 63 - 64, Update the Schedule Pressable in RideOptions to open the existing ScheduleRideModal instead of assigning new Date() directly through onScheduleChange. Use the modal’s date/time selection callback to pass the user-chosen future value to onScheduleChange, while preserving the existing toggle behavior for clearing scheduledFor.
