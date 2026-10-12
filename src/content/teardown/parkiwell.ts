/**
 * ParkiWell's product story, grounded in its README, ARCHITECTURE.md,
 * lib/Manage/editLog.dart, lib/services/, and packages/motion_engine.
 * Explain the everyday purpose before the implementation. Figures describe
 * supported capabilities, not adoption or clinical outcomes. The motion coach
 * and store release retain their in-development / coming-soon status.
 */
import type { TeardownStory } from './types.ts'
import { PARKIWELL_POSE } from './parkiwellPose.ts'

const SCREEN = { width: 1320, height: 2868 }

export const PARKIWELL: TeardownStory = {
  id: 'parkiwell',
  name: 'ParkiWell',
  acts: [
    {
      key: 'arrival',
      span: 1.7,
      backdrop: 0,
      lines: [
        'ParkiWell',
        'An app for managing everyday life with Parkinson’s.',
        'ParkiWell brings symptom logs, medication reminders, and guided speech and movement practice into one place. It helps people keep up with daily routines and look back at what’s changed, even offline.',
      ],
      callouts: [],
    },
    {
      key: 'hand',
      span: 1.3,
      backdrop: 1,
      lines: ['Designed to be easier to use with a tremor.'],
      // Each callout states a fact about the control its leader lands beside, in screen order from the top so
      // the leader lines never cross, and none repeats the screen's own text (its intro already says entries
      // backfill to 2000). The anchors were measured on log.webp at 943 by 2048 and are fractions, so they hold at the
      // native 1320 by 2868: every control's left edge is at x 43 of 943, so u -0.94 puts the leader's tip at x 28,
      // 15 px left of it, and v is
      // each control's vertical centre. The severity chips are 48 pt tall (lib/Manage/editLog.dart, minHeight
      // 48) and carry the five labels, the date card's picker runs from firstDate 2000 to lastDate now, and the
      // Save button disables itself while a save is in flight, so a second tap records nothing.
      callouts: [
        { text: 'Large controls with room to tap', anchor: { plane: 'screen', u: -0.94, v: -0.04 } },
        { text: 'Clear language and simple choices', anchor: { plane: 'screen', u: -0.94, v: -0.15 } },
        { text: 'Flexible logging that fits your day', anchor: { plane: 'screen', u: -0.94, v: -0.57 } },
        { text: 'Protection against accidental repeat taps', anchor: { plane: 'screen', u: -0.94, v: -0.85 } },
      ],
    },
    // At 4.2 viewport-heights each wide card holds in the spotlight for about 0.35 viewport-heights, each narrow
    // deck card holds at the centre for about 0.5, and the finished row rests for about 1.0 before the quiet act
    // folds it.
    { key: 'day', span: 4.2, backdrop: 0, lines: [], callouts: [] },
    // The quiet act is the chapter's one authored pause. At 1.4 viewport-heights the row folds over the act's first
    // 60% (about 0.84 viewport-heights) and the edge-on phone then holds for about 0.5, so the seam after the day
    // act's long build reads as a pause instead of a cut between the day and the glass.
    { key: 'quiet', span: 1.4, backdrop: null, lines: [], callouts: [] },
    {
      key: 'glass',
      // The peak keeps the chapter's largest span, so it stays longer than the day act.
      span: 4.3,
      backdrop: null,
      lines: ['Your records stay with you, even offline.'],
      // Each callout names the part its leader lands on, front to back: the Home capture's top left corner, the
      // display the wake lock keeps on, its Symptoms chart (its plot runs from v -0.08 to -0.44), the code layer's
      // sync replay loop, and the phone's chassis frame. The first anchor sat on the bare cover glass, whose top
      // corner is fanned right of the screen, and its leader cut through the capture's greeting to reach it. The
      // charging coil shows through the translucent code layer above those lines, and an
      // anchor inside it read as a caption for the coil, so the code anchor stays at v -0.72. Each anchor sits lower
      // and further left than the one above it, so the leaders, which turn at one shared x, never cross while the
      // copy rides through the act. The chassis anchor sits at v -0.8, below the code anchor, since at v -0.66 the
      // two leaders crossed early in the act on tablets in portrait. An anchor on the logic board, in the chassis's
      // top half, sits above the others and crosses them as the copy rides out. Sources:
      // lib/utils/session_wakelock.dart, which the exercise video (lib/Recovery/exerciseVideo.dart line 63), speech
      // practice (lib/Recovery/speechAudio.dart line 37), and both motion coach screens
      // (lib/motion_coach/motion_routine_screen.dart line 95 and motion_coach_screen.dart line 103) acquire, the
      // chart's Semantics label in lib/linechart.dart line 494, and ARCHITECTURE.md lines 47 and 48.
      callouts: [
        { text: 'Practice without the screen going to sleep', anchor: { plane: 'screen', u: -0.92, v: 0.86 } },
        { text: 'Symptom trends that screen readers can describe', anchor: { plane: 'screen', u: -0.92, v: -0.25 } },
        { text: 'Saved changes sync when you reconnect', anchor: { plane: 'code', u: -0.92, v: -0.72 } },
        { text: 'Encrypted on your phone, with optional backup', anchor: { plane: 'chassis', u: -0.95, v: -0.8 } },
      ],
    },
    {
      key: 'proof',
      // The readout is typed by about 0.49 of the act and rests for about 0.57 viewport-heights before the stack
      // closes over the act's last 20%, so the coach act opens on a phone that is already whole.
      span: 1.8,
      backdrop: null,
      // README and ARCHITECTURE.md sections 11–16: local tracking, AES-256-GCM storage,
      // optional account backup, and per-account access enforced by PostgreSQL row-level security.
      lines: [
        'Offline symptom and dose tracking',
        'AES-256 encrypted local records',
        'Cloud backup when you choose',
        'Private records tied to your account',
      ],
      callouts: [],
    },
    {
      key: 'coach',
      span: 1.3,
      backdrop: 2,
      // MediaPipe's 33 landmarks, ten exercise templates, and per-rep range, tempo, and smoothness scores.
      // LiveExerciseCoachConfig accepts reps up to 8x the reference tempo. Camera frames and landmarks stay
      // on the device; optional account backup contains derived results only (ARCHITECTURE.md section 26).
      lines: [
        'Motion coach, in development',
        'The motion coach uses the phone’s camera to count reps and give live feedback for ten seated and standing exercises.',
        'It measures range of motion, pace, and smoothness. Audio and vibration cues help people follow along, with extra time for slower movements.',
        'MediaPipe tracks 33 body landmarks on the device, keeping camera footage on the phone.',
      ],
      callouts: [],
    },
    // The evening room is whole from 0.22 of the act. The reassembled phone reaches its close pose at half the act
    // and rests there on the results screen, with the evening room and the copy in place, until the room starts to
    // dissolve at 0.66 (0.45 viewport-heights). The phone dissolves from 0.69 and scatters by 0.95 of the act, about
    // 0.7 viewport-heights of scroll, before the stage unpins.
    {
      key: 'close', span: 2.8, backdrop: 3,
      lines: [
        'Built with Flutter, a custom motion engine, and a Supabase backend.',
        'Coming to iPhone and Android.',
      ],
      callouts: [],
    },
  ],
  screens: [
    { key: 'welcome', src: '/ParkiWell/hd/welcome.webp', alt: 'ParkiWell welcome screen', ...SCREEN },
    { key: 'home', src: '/ParkiWell/hd/home.webp', alt: "ParkiWell Home greeting Hope you're well, Janet, with 39 symptom logs, 3 medications, a health patterns insight, and a symptoms trend chart across the year", ...SCREEN },
    { key: 'manage', src: '/ParkiWell/hd/manage.webp', alt: "ParkiWell Manage with symptom logs and today's medications", ...SCREEN },
    { key: 'recovery', src: '/ParkiWell/hd/recovery.webp', alt: 'ParkiWell Recovery with the weekly practice plan and the next session', ...SCREEN },
    { key: 'community', src: '/ParkiWell/hd/community.webp', alt: 'ParkiWell Community on the Resources tab', ...SCREEN },
    { key: 'log', src: '/ParkiWell/hd/log.webp', alt: 'ParkiWell Log a symptom form, filled in with a note, with large severity chips from Very Mild to Very Severe and date and time controls', ...SCREEN },
    { key: 'coach', src: '/ParkiWell/hd/coach.webp', alt: 'ParkiWell Motion coach home with the on-device privacy card, the weekly movement goal, and guided routines', ...SCREEN },
    { key: 'results', src: '/ParkiWell/hd/results.webp', alt: 'ParkiWell Routine summary for Seated foundation, a movement score of 81 out of 100, with what went well and step by step scores', ...SCREEN },
  ],
  // Short labels explain each tab's everyday purpose: patterns, doses, practice, and peer support.
  // At 1280 px and wider the labels do not wrap, so at 1280 by 800 two neighbouring labels fit side by side only
  // within about 42 characters together, or the layout pushes one off centre (teardown-labels.test.js).
  cards: [
    { screen: 'home', label: 'See symptom patterns' },
    { screen: 'manage', label: 'Keep track of doses' },
    { screen: 'recovery', label: 'Make time to practice' },
    { screen: 'community', label: 'Find peer support' },
  ],
  // The composite centres its window on the focus point, so a larger x moves the photograph's content left on
  // the screen. The window's overscan pins the y centre at every aspect up to 16:9, so only x places the subject.
  // At 1440 by 900 the window is 0.72 of a plate wide and its centre clamps to 0.404 to 0.596. The hands x puts
  // the fingers (plate x 0.3 to 0.47) at about 0.27 to 0.51 of the frame width, in the gap between the callout
  // column and the phone, with the mug's rim at the phone's left edge and its handle half visible right of it.
  // At x 0.4 the grip and the mug's body sat behind the phone. The hands levels run from 0.05 to 0.45, so the
  // shadowed skin (linear 0.03 to 0.1, a lightness of about 0.17 to 0.32) prints at full coverage instead of
  // fading into bare dots. The chair x moves the window's bright band of floor and wall off the coach figure's
  // shoulder line. The evening x puts the water glass at 0.32 to 0.42 of the width and the
  // pill organiser's right half between the chips and the phone, and leaves the lamp out of frame. Each levels
  // pair spans the room's own lit range: the plates are dim, and without it the glyph ramp used only its lower
  // half.
  backdrops: [
    { src: '/ParkiWell/rooms/morning.webp', focus: [0.48, 0.62], levels: [0.12, 0.7] },
    { src: '/ParkiWell/rooms/hands.webp', focus: [0.47, 0.6], levels: [0.05, 0.45] },
    { src: '/ParkiWell/rooms/chair.webp', focus: [0.52, 0.5], levels: [0.1, 0.65] },
    { src: '/ParkiWell/rooms/evening.webp', focus: [0.42, 0.5], levels: [0.08, 0.6] },
  ],
  // Excerpt from the production replay loop; omitted rejection handling is marked below.
  codeSource: 'lib/services/offline_sync_engine.dart',
  code: `final snapshot = pendingMutations;
for (var offset = 0; offset < snapshot.length; offset += batchSize) {
  final end = (offset + batchSize).clamp(0, snapshot.length);
  final batch = snapshot.sublist(offset, end);
  Set<String> acknowledged;
  try {
    acknowledged = await executor(batch);
  } catch (_) {
    break;
  }

  for (final mutation in batch) {
    if (acknowledged.contains(mutation.mutationId)) {
      _rejectionCounts.remove(mutation.mutationId);
      final current = _pendingByEntity[mutation.entityKey];
      if (current?.mutationId == mutation.mutationId) {
        _pendingByEntity.remove(mutation.entityKey);
        acknowledgedCount += 1;
      }
      continue;
    }
    // [...]
  }
  await _persist();
}`,
  pose: PARKIWELL_POSE,
  tags: ['Flutter', 'Dart', 'Python', 'MediaPipe', 'Supabase', 'PostgreSQL'],
  links: [
    { label: 'parkiwell.com', href: 'https://parkiwell.com' },
    { label: 'source', href: 'https://github.com/ParkiWell/ParkiWell' },
  ],
}
