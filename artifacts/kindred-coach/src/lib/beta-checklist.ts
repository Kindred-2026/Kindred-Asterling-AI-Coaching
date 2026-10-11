// The beta tester test plan, as a checklist testers tick off in the app.
// Item ids are stored on each tester's account, so never rename or reuse an
// id: add a new one instead and the old tick simply stops counting.

export interface BetaChecklistItem {
  id: string;
  label: string;
}

export interface BetaChecklistGroup {
  id: string;
  title: string;
  note?: string;
  items: BetaChecklistItem[];
}

export const BETA_CHECKLIST: BetaChecklistGroup[] = [
  {
    id: "signup",
    title: "Sign-up and sign-in",
    items: [
      { id: "signup-create", label: "Create an account and verify your email" },
      { id: "signup-signout-in", label: "Sign out, then sign back in the same way" },
      { id: "signup-email-code", label: "Sign in with “Email me a sign-in code” and use the code you receive" },
      { id: "signup-deep-link", label: "While signed out, open a link to Today and check you land on Sign in, then back on Today" },
      { id: "signup-other-method", label: "Try signing in a different way with the same email and note the message you see" },
    ],
  },
  {
    id: "talk",
    title: "First conversation (Talk)",
    items: [
      { id: "talk-welcome", label: "Answer the welcome questions: name, birthday (optional), struggles, strengths and interests" },
      { id: "talk-replies", label: "Send a few messages and check the replies feel personal and on topic" },
      { id: "talk-week", label: "After a few days of check-ins, ask “How has my week been?” and check the coach mentions your entries" },
      { id: "talk-voice-in", label: "Use the microphone button to speak a message" },
      { id: "talk-voice-out", label: "Use the speaker button to have a reply read aloud" },
      { id: "talk-archive", label: "Archive a conversation, find it under Archive, and download it as PDF and TXT" },
    ],
  },
  {
    id: "today",
    title: "Today",
    items: [
      { id: "today-affirmations", label: "Check the affirmations rotate, and that pause, next and previous work" },
      { id: "today-your-day", label: "Check “Your day” updates after each check-in you complete" },
      { id: "today-patterns", label: "Check today's medication doses and “Recent patterns” show your data" },
    ],
  },
  {
    id: "morning",
    title: "Morning check-in (daily)",
    items: [
      { id: "morning-fill", label: "Pick your mental load, write up to three small goals, and add a note" },
      { id: "morning-done", label: "Submit and check you see “You've checked in today”" },
    ],
  },
  {
    id: "scans",
    title: "Scans",
    items: [
      { id: "scans-feelings", label: "Search the feelings list and pick a few feelings" },
      { id: "scans-energy", label: "Set your energy level, describe any physical sensations, and add a note" },
      { id: "scans-multiple", label: "Do more than one scan in a day and check both are saved" },
    ],
  },
  {
    id: "evening",
    title: "Evening reflection (daily)",
    items: [
      { id: "evening-ratings", label: "Rate your mood and medication effectiveness (1 to 10)" },
      { id: "evening-writing", label: "Write a win, a challenge, and one intention for tomorrow" },
      { id: "evening-done", label: "Submit and check you see “Great work today”" },
    ],
  },
  {
    id: "habits",
    title: "Habits",
    items: [
      { id: "habits-add", label: "Add a habit with a short note and a target number of days" },
      { id: "habits-streak", label: "Log it on several days and check the streak and weekly chart update" },
      { id: "habits-edit-delete", label: "Edit the habit, then delete a test habit" },
    ],
  },
  {
    id: "medications",
    title: "Medications",
    note: "Optional, only if you take any.",
    items: [
      { id: "meds-add", label: "Add a medication with its dosage and scheduled times" },
      { id: "meds-taken", label: "Mark a dose as taken and rate how well it worked" },
      { id: "meds-undo", label: "Undo a dose you marked by mistake" },
      { id: "meds-shown", label: "Check the doses appear on Today and in Insights" },
    ],
  },
  {
    id: "reminders",
    title: "Reminders",
    items: [
      { id: "reminders-setup", label: "Set your time zone, then turn on morning and evening reminders" },
      { id: "reminders-email", label: "Turn on email reminders and check one arrives at the right time" },
      { id: "reminders-text", label: "Add your phone number, turn on text reminders, and check one arrives" },
      { id: "reminders-meds", label: "If you track medications, check medication reminders match your dose times" },
    ],
  },
  {
    id: "insights",
    title: "Insights",
    items: [
      { id: "insights-charts", label: "After a week, check the charts reflect your check-ins, habits and doses" },
      { id: "insights-pdf", label: "Download the weekly summary PDF and check it opens and looks right" },
    ],
  },
  {
    id: "you",
    title: "You and account security",
    items: [
      { id: "you-profile", label: "Edit your profile (“What Kindred should know”) and save it" },
      { id: "you-security", label: "In Account security, change your password or add a passkey or authenticator app" },
      { id: "you-download", label: "In Account security, download your data and check the file opens" },
    ],
  },
  {
    id: "everywhere",
    title: "Everywhere",
    items: [
      { id: "everywhere-theme", label: "Switch between light and dark mode" },
      { id: "everywhere-public", label: "Open the About, Science, Pricing and legal pages" },
      { id: "everywhere-problems", label: "Note any page that is slow, cut off on your phone, or shows an error" },
    ],
  },
];

export const BETA_CHECKLIST_ITEM_IDS: string[] = BETA_CHECKLIST.flatMap(
  (group) => group.items.map((item) => item.id),
);
