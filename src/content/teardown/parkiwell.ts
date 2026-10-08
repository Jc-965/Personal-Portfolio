/**
 * ParkiWell's teardown chapter. Every figure comes from ParkiWell's repo
 * (ARCHITECTURE.md, supabase/schema.sql, test/offline_sync_engine_test.dart,
 * lib/services/encrypted_cache_store.dart, lib/motion_coach/README.md),
 * parkiwell.com's journey, assurance, and features content, or Jesse's resume.
 * Unsupported claims (camera-to-feedback latency, process kills, user,
 * download, or rating numbers) must not be added here.
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
      span: 1.0,
      backdrop: 0,
      lines: ['ParkiWell', "A calmer way to manage Parkinson's care.", 'Founder and sole engineer, since 2023.'],
      callouts: [],
    },
    {
      key: 'hand',
      span: 0.9,
      backdrop: 1,
      lines: ['Designed for hands with a tremor.'],
      callouts: [
        { text: '48 pt tap targets', anchor: { plane: 'screen', u: -0.62, v: -0.78 } },
        { text: 'Double taps forgiven', anchor: { plane: 'screen', u: -0.7, v: -0.3 } },
        { text: 'Sign-in waits three minutes', anchor: { plane: 'screen', u: -0.66, v: 0.18 } },
        { text: 'Reps counted at up to 8x slower', anchor: { plane: 'screen', u: -0.6, v: 0.64 } },
      ],
    },
    { key: 'day', span: 1.4, backdrop: 0, lines: [], callouts: [] },
    { key: 'quiet', span: 0.4, backdrop: null, lines: [], callouts: [] },
    {
      key: 'glass',
      span: 2.2,
      backdrop: null,
      lines: [],
      callouts: [
        { text: 'Screen reader labels, large targets, light and dark', anchor: { plane: 'glass', u: -0.92, v: 0.86 } },
        { text: 'Flutter app: symptoms, medications, practice, support', anchor: { plane: 'screen', u: -0.92, v: 0.4 } },
        { text: 'Offline sync: an encrypted journal, replayed exactly once', anchor: { plane: 'code', u: -0.92, v: -0.1 } },
        { text: 'Supabase and PostgreSQL, row-level security on 16 tables', anchor: { plane: 'chassis', u: -0.95, v: -0.66 } },
      ],
    },
    {
      key: 'proof',
      span: 0.9,
      backdrop: null,
      lines: ['1,000,000 fault-injected writes', '0 lost. 0 duplicated.', 'AES-256-GCM, key held on the device', 'Works offline. Account optional.'],
      callouts: [],
    },
    {
      key: 'coach',
      span: 0.8,
      backdrop: 2,
      lines: [
        'Motion coach, in development',
        '33 body landmarks, tracked on the phone',
        'The camera feed is never recorded or uploaded',
        'Grew from my research at SoftCom Lab: a first-authored paper and 95.4% mean accuracy in controlled video trials.',
      ],
      callouts: [],
    },
    { key: 'close', span: 0.8, backdrop: 3, lines: ['Coming to iPhone and Android.'], callouts: [] },
  ],
  screens: [
    { key: 'welcome', src: '/ParkiWell/hd/welcome.webp', alt: 'ParkiWell welcome screen', ...SCREEN },
    { key: 'home', src: '/ParkiWell/hd/home.webp', alt: 'ParkiWell Home with symptom and medication counts, a health pattern insight, and trend charts', ...SCREEN },
    { key: 'manage', src: '/ParkiWell/hd/manage.webp', alt: "ParkiWell Manage with symptom logs and today's medications", ...SCREEN },
    { key: 'recovery', src: '/ParkiWell/hd/recovery.webp', alt: 'ParkiWell Recovery with the weekly practice plan and the next session', ...SCREEN },
    { key: 'community', src: '/ParkiWell/hd/community.webp', alt: 'ParkiWell Community on the Resources tab', ...SCREEN },
  ],
  cards: [
    { screen: 'home', label: 'Review your symptoms' },
    { screen: 'manage', label: 'Manage your medications' },
    { screen: 'recovery', label: 'Plan your practice' },
    { screen: 'community', label: 'Access support resources' },
  ],
  backdrops: [
    { src: '/ParkiWell/backdrop/morning.webp' },
    { src: '/ParkiWell/backdrop/hands.webp' },
    { src: '/ParkiWell/backdrop/chair.webp' },
    { src: '/ParkiWell/backdrop/evening.webp' },
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
