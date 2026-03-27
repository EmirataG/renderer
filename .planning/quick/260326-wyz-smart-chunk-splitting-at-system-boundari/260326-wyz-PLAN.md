# Quick Task 260326-wyz: Smart chunk splitting at system boundaries

**Created:** 2026-03-27
**Status:** Complete

## Problem

The warm-up approach (260326-wir) was a band-aid. A more robust solution: never split chunks mid-transition in the first place.

## Approach

The camera only moves at "system boundaries" — when the music moves to a new staff system on the page. We know exactly when these transitions happen from the event data. By placing chunk boundaries at frames where the camera is stable, no tab ever starts mid-transition.

## Task 1: Add getChunkBoundaries to animation controller

**Files:** `export-service/src/standalone/render.ts`
**Action:** Add `getChunkBoundaries(numChunks)` method that computes transition danger zones from event Y positions and places split points outside them.

## Task 2: Use smart boundaries in parallelCapture

**Files:** `export-service/src/browser/parallelCapture.ts`
**Action:** Replace naive `framesPerTab` even division with `getChunkBoundaries()`. Remove warm-up code (no longer needed).
