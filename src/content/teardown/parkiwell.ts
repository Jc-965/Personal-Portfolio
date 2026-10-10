/**
 * ParkiWell's teardown chapter. Every figure comes from ParkiWell's repo
 * (ARCHITECTURE.md, supabase/schema.sql, test/offline_sync_engine_test.dart,
 * lib/services/encrypted_cache_store.dart, lib/motion_coach/README.md,
 * lib/motion_coach/motion_routine_results_screen.dart,
 * lib/utils/session_wakelock.dart, lib/linechart.dart, packages/motion_engine),
 * parkiwell.com's journey, assurance, and features content, or Jesse's resume.
 * Unsupported claims (camera-to-feedback latency, process kills, user,
 * download, or rating numbers) must not be added here. An act's copy never
 * restates what its phone screen (ACT_SCREEN in rig.ts) already shows, and
 * the chapter does not mention the research the motion coach grew from.
 */
import type { TeardownStory } from './types.ts'
import { PARKIWELL_POSE } from './parkiwellPose.ts'

const SCREEN = { width: 943, height: 2048 }

export const PARKIWELL: TeardownStory = {
  id: 'parkiwell',
  name: 'ParkiWell',
  acts: [
    {
      key: 'arrival',
      span: 1.3,
      backdrop: 0,
      // The lede's second clause is the README's own phrase ("designed for real hands and real days"). The app has
      // no caregiver features, so it must not claim to be built for anyone but the person living with Parkinson's.
      lines: ['ParkiWell', "Built for people living with Parkinson's, for real hands and real days.", 'Founder and sole engineer, since 2023.'],
      callouts: [],
    },
    {
      key: 'hand',
      span: 1.3,
      backdrop: 1,
      lines: ['Designed for hands with a tremor.'],
      // Each callout states a fact about the control its leader lands beside, in screen order from the top so
      // the leader lines never cross, and none repeats the screen's own text (its intro already says entries
      // backfill to 2000). The anchors are measured on public/ParkiWell/hd/log.webp (943 by 2048): every
      // control's left edge is at x 43, so u -0.94 puts the leader's tip at x 28, 15 px left of it, and v is
      // each control's vertical centre. The severity chips are 48 pt tall (lib/Manage/editLog.dart, minHeight
      // 48) and carry the five labels, the date card's picker runs from firstDate 2000 to lastDate now, and the
      // Save button disables itself while a save is in flight, so a second tap records nothing.
      callouts: [
        { text: '48 pt tap targets', anchor: { plane: 'screen', u: -0.94, v: -0.04 } },
        { text: 'Severity in five plain levels', anchor: { plane: 'screen', u: -0.94, v: -0.15 } },
        { text: 'Date picker stops at today', anchor: { plane: 'screen', u: -0.94, v: -0.57 } },
        { text: 'Double taps forgiven', anchor: { plane: 'screen', u: -0.94, v: -0.85 } },
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
      lines: [],
      // Each callout names the part its leader lands on, front to back: the Home capture's top left corner, the
      // display the wake lock keeps on, its Symptoms chart (its plot runs from v -0.08 to -0.44), the code layer's
      // expect() lines, and the phone's chassis frame. The first anchor sat on the bare cover glass, whose top
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
        { text: 'Screen stays awake through practice sessions', anchor: { plane: 'screen', u: -0.92, v: 0.86 } },
        { text: 'The trend chart reads out to screen readers', anchor: { plane: 'screen', u: -0.92, v: -0.25 } },
        { text: 'Every change journaled until the server acknowledges it', anchor: { plane: 'code', u: -0.92, v: -0.72 } },
        { text: 'Authoritative copy on the phone, cloud as backup', anchor: { plane: 'chassis', u: -0.95, v: -0.8 } },
      ],
    },
    {
      key: 'proof',
      // The readout is typed by about 0.49 of the act and rests for about 0.57 viewport-heights before the stack
      // closes over the act's last 20%, so the coach act opens on a phone that is already whole.
      span: 1.8,
      backdrop: null,
      // The code layer prints the test's title (1M fault-injected writes), so the readout opens on its result. The
      // last line counts the 16 create table and 16 enable row level security statements in supabase/schema.sql.
      lines: ['0 lost. 0 duplicated.', 'AES-256-GCM, key held on the device', 'Row-level security on all 16 tables'],
      callouts: [],
    },
    {
      key: 'coach',
      span: 1.3,
      backdrop: 2,
      // The coach screen's own cards say the camera measures on the device, nothing is uploaded, and name the
      // two guided routines, so these lines carry only what the engine adds: maximumTempoRatio 8.0 times
      // referenceTempoS, the rep time measured from the exercise template's reference series, in
      // packages/motion_engine/lib/src/live_exercise_coach.dart, the per-rep ExerciseRepScore whose
      // symmetryScore is null unless both sides move, the ten templates under assets/motion/templates, and the
      // text, speech, and haptic cue channels in lib/motion_coach/README.md. The score names are the ones the
      // close act's results screen prints for rangeScore, tempoScore, smoothnessScore, and symmetryScore
      // (lib/motion_coach/motion_routine_results_screen.dart lines 482 to 486), so both acts use one vocabulary.
      lines: [
        'Motion coach, in development',
        "Reps still count at up to 8x slower than the exercise's set pace.",
        'Every rep scored on movement size, pace, and smoothness, plus evenness when both sides move.',
        'Ten exercises, cued by text, speech, and haptic taps.',
      ],
      callouts: [],
    },
    // The evening room is whole from 0.3 of the act. The reassembled phone reaches its close pose at half the act
    // and rests there on the results screen, with the evening room and the copy in place, until the room starts to
    // dissolve at 0.74 (0.48 viewport-heights). The phone dissolves from 0.78 and scatters by 0.93 of the act,
    // before the stage unpins.
    { key: 'close', span: 2.0, backdrop: 3, lines: ['Coming to iPhone and Android.'], callouts: [] },
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
  cards: [
    { screen: 'home', label: 'Review your symptoms' },
    { screen: 'manage', label: 'Manage your medications' },
    { screen: 'recovery', label: 'Plan your practice' },
    { screen: 'community', label: 'Access support resources' },
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
  codeSource: 'test/offline_sync_engine_test.dart',
  code: `test(
  'preserves final state across 1M fault-injected writes',
  () async {
    const mutationCount = 1000000;
    const entityCount = 10000;
    const checkpointSize = 10000;
    final baseTime = DateTime.utc(2026, 1, 1);
    final store = _MemoryMutationJournalStore();
    var engine = OfflineSyncEngine(store);
    await engine.initialize();
    final expected = <String, SyncMutation>{};
    // [...]
      await engine.enqueueAll(mutations);

      // Simulate a process interruption after each durable checkpoint.
      engine = OfflineSyncEngine(store);
      await engine.initialize();
    }

    final backend = _FaultInjectingBackend();
    var replayAttempts = 0;
    while (engine.pendingCount > 0 && replayAttempts < 100) {
      await engine.replay(backend.apply, batchSize: 250);
      replayAttempts += 1;
    }

    expect(engine.pendingCount, 0);
    expect(replayAttempts, lessThan(100));
    expect(backend.appliedMutationCount, entityCount);
    expect(backend.duplicateReplayCount, greaterThan(0));`,
  pose: PARKIWELL_POSE,
  tags: ['Flutter', 'Dart', 'Python', 'MediaPipe', 'Supabase', 'PostgreSQL'],
  links: [
    { label: 'parkiwell.com', href: 'https://parkiwell.com' },
    { label: 'source', href: 'https://github.com/ParkiWell/ParkiWell' },
  ],
}
