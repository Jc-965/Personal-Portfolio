/**
 * ParkiWell's teardown chapter. Every figure comes from ParkiWell's repo
 * (ARCHITECTURE.md, supabase/schema.sql, test/offline_sync_engine_test.dart,
 * lib/services/encrypted_cache_store.dart, lib/motion_coach/README.md),
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
      lines: ['ParkiWell', "Built for people living with Parkinson's, and the people who help them.", 'Founder and sole engineer, since 2023.'],
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
    { key: 'day', span: 3.0, backdrop: 0, lines: [], callouts: [] },
    // The quiet act is the chapter's one authored pause. At 0.8 viewport-heights it outlasts two wheel notches
    // under Lenis, so it reads as a pause instead of a cut between the day and the glass.
    { key: 'quiet', span: 0.8, backdrop: null, lines: [], callouts: [] },
    {
      key: 'glass',
      span: 3.4,
      backdrop: null,
      lines: [],
      callouts: [
        { text: 'Screen reader labels, large targets, light and dark', anchor: { plane: 'glass', u: -0.92, v: 0.86 } },
        { text: 'Flutter app: symptoms, medications, practice, support', anchor: { plane: 'screen', u: -0.92, v: 0.4 } },
        { text: 'Offline sync: an encrypted journal, applied exactly once', anchor: { plane: 'code', u: -0.92, v: -0.1 } },
        { text: 'Supabase and PostgreSQL, row-level security on 16 tables', anchor: { plane: 'chassis', u: -0.95, v: -0.66 } },
      ],
    },
    {
      key: 'proof',
      span: 1.5,
      backdrop: null,
      lines: ['1,000,000 fault-injected writes', '0 lost. 0 duplicated.', 'AES-256-GCM, key held on the device', 'Works offline. Cloud sync optional.'],
      callouts: [],
    },
    {
      key: 'coach',
      span: 1.3,
      backdrop: 2,
      // The coach screen's own cards say the camera measures on the device, nothing is uploaded, and name the
      // two guided routines, so these lines carry only what the engine adds: maximumTempoRatio 8.0 in
      // packages/motion_engine/lib/src/live_exercise_coach.dart, the per-rep ExerciseRepScore whose
      // symmetryScore is null unless both sides move, the ten templates under assets/motion/templates, and the
      // text, speech, and haptic cue channels in lib/motion_coach/README.md.
      lines: [
        'Motion coach, in development',
        'Reps still count at up to 8x slower than the reference.',
        'Every rep scored on range, tempo, and smoothness, plus symmetry when both sides move.',
        'Ten exercises, cued by text, speech, and haptic taps.',
      ],
      callouts: [],
    },
    { key: 'close', span: 1.1, backdrop: 3, lines: ['Coming to iPhone and Android.'], callouts: [] },
  ],
  screens: [
    { key: 'welcome', src: '/ParkiWell/hd/welcome.webp', alt: 'ParkiWell welcome screen', ...SCREEN },
    { key: 'home', src: '/ParkiWell/hd/home.webp', alt: 'ParkiWell Home greeting Winding down, Janet, with symptom and medication counts, a health patterns insight, and a symptoms trend chart', ...SCREEN },
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
  // Each x puts the subject beside the phone on a 1440 px screen rather than behind it: the morning mug in the gap
  // left of the phone with the notebook's end and the right lens to its right, both hands and their mug left of
  // the phone, and the evening lamp right of the phone with the notebook and glasses to its left.
  backdrops: [
    { src: '/ParkiWell/rooms/morning.webp', focus: [0.52, 0.64] },
    { src: '/ParkiWell/rooms/hands.webp', focus: [0.57, 0.58] },
    { src: '/ParkiWell/rooms/chair.webp', focus: [0.63, 0.6] },
    { src: '/ParkiWell/rooms/evening.webp', focus: [0.57, 0.5] },
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
