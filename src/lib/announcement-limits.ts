/** Length limits for the dashboard announcement. Kept apart from
 *  src/lib/announcement.ts (which reads the database) so the admin form, a
 *  client component, can import them without pulling server code into the
 *  browser bundle. */
export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_MESSAGE_MAX = 600;
