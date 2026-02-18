import { Type, type Static } from '@sinclair/typebox';

export const ScoreRegionSchema = Type.Object({
  x: Type.Number(),
  y: Type.Number(),
  width: Type.Number(),
  height: Type.Number(),
  rotation: Type.Optional(Type.Number()),
  perspective: Type.Optional(Type.Object({
    topLeft: Type.Object({ x: Type.Number(), y: Type.Number() }),
    topRight: Type.Object({ x: Type.Number(), y: Type.Number() }),
    bottomRight: Type.Object({ x: Type.Number(), y: Type.Number() }),
    bottomLeft: Type.Object({ x: Type.Number(), y: Type.Number() }),
  })),
});

export const BorderStyleSchema = Type.Union([
  Type.Literal('none'),
  Type.Literal('line'),
  Type.Literal('double-line'),
  Type.Literal('ornate-1'),
  Type.Literal('ornate-2'),
  Type.Literal('flourish'),
]);

export const MusicFontSchema = Type.Union([
  Type.Literal('Bravura'),
  Type.Literal('Petaluma'),
  Type.Literal('Leland'),
  Type.Literal('Gootville'),
  Type.Literal('Leipzig'),
]);

export const ExportSettingsSchema = Type.Object({
  fps: Type.Number({ minimum: 15, maximum: 60 }),
  scoreColor: Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }),
  scoreShadowDistance: Type.Number({ minimum: 0, maximum: 6 }),
  hideUnplayedNotes: Type.Boolean(),
  smoothReveal: Type.Boolean(),
  scoreRegion: Type.Union([ScoreRegionSchema, Type.Null()]),
  scoreBorder: BorderStyleSchema,
  scoreScale: Type.Number({ minimum: 0.5, maximum: 1.5 }),
  musicFont: MusicFontSchema,
  activeNoteheadColor: Type.Union([
    Type.String({ pattern: '^#[0-9a-fA-F]{6}$' }),
    Type.Null(),
  ]),
  activeNoteheadScale: Type.Number({ minimum: 1, maximum: 1.6 }),
  activeNoteheadEntryMs: Type.Number({ minimum: 0, maximum: 300 }),
  activeNoteheadHoldMs: Type.Number({ minimum: 0, maximum: 1000 }),
  activeNoteheadExitMs: Type.Number({ minimum: 0, maximum: 1000 }),
  colorFullNote: Type.Boolean(),
  hideLabels: Type.Boolean(),
  audioDuration: Type.Optional(Type.Number({ minimum: 0 })),
});

export const SyncAnchorsSchema = Type.Record(Type.String(), Type.Number());

export type ExportSettings = Static<typeof ExportSettingsSchema>;
export type SyncAnchors = Static<typeof SyncAnchorsSchema>;
export type ScoreRegion = Static<typeof ScoreRegionSchema>;
export type BorderStyle = Static<typeof BorderStyleSchema>;
export type MusicFont = Static<typeof MusicFontSchema>;
