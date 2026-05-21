import React, { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '../convex/hooks'
import { HomeScreen, type SimulationOverride } from './HomeScreen'
import { computeSnapshotAt } from '../lib/demo-mock'

type DemoState = {
  status: 'scheduled' | 'running' | 'finished'
  actualStart: number | null
  actualEnd: number | null
}

function lsKey(slug: string) {
  return `teamlap.offline.${slug}`
}

function loadState(slug: string): DemoState {
  try {
    const raw = localStorage.getItem(lsKey(slug))
    if (raw) return JSON.parse(raw)
  } catch (_) {}
  return { status: 'scheduled', actualStart: null, actualEnd: null }
}

function saveState(slug: string, s: DemoState) {
  try { localStorage.setItem(lsKey(slug), JSON.stringify(s)) } catch (_) {}
}

export type OfflineSimulationScreenProps = {
  eventSlug: string
  onPickTeam: (teamId: string) => void
  /** Hide admin gear (always true for demo). */
  hideAdminButton?: boolean
  /** Test mode divider — default 3 (matches seeded events). */
  testModeDivider?: number
}

export function OfflineSimulationScreen({
  eventSlug,
  onPickTeam,
  hideAdminButton = true,
  testModeDivider = 3,
}: OfflineSimulationScreenProps): React.ReactElement {
  const [demo, setDemo] = useState<DemoState>(() => loadState(eventSlug))
  useEffect(() => { saveState(eventSlug, demo) }, [demo, eventSlug])

  const event = useQuery('events:getBySlug' as any, { slug: eventSlug }) as any
  const teams = useQuery('teams:getTeamsFull' as any, event?._id ? { eventId: event._id } : 'skip') as any[] | null | undefined
  const updateTeamMutation = useMutation('teams:updateTeam' as any)

  const resetTeamsState = async () => {
    if (!teams) return
    await Promise.all(teams.map((t: any) =>
      updateTeamMutation({
        teamId: t._id,
        updates: { currentIdx: 0, ready: true, autoPaused: false },
      }).catch((e: any) => console.error('reset team:', e))
    ))
  }

  const slugToTeamId = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of teams ?? []) {
      if (t.chronoplaceSlug) m.set(t.chronoplaceSlug, t._id)
    }
    return m
  }, [teams])

  const fullWindow = (demo.actualStart ?? Date.now()) + 48 * 3600 * 1000
  const laps = useMemo(() => {
    if (!demo.actualStart || demo.status === 'scheduled') return []
    const snapshots = computeSnapshotAt(
      { actualStart: demo.actualStart, testModeDivider },
      fullWindow,
    )
    return snapshots.map((l) => ({
      _id: `mock-${l.teamSlug}-${l.lapNumber}`,
      teamId: slugToTeamId.get(l.teamSlug) ?? l.teamSlug,
      runnerId: l.runnerId,
      timestamp: l.timestamp,
      lapTime: l.lapTime,
      lapNumber: l.lapNumber,
      type: l.type,
      prevCurrentIdx: l.prevCurrentIdx,
    }))
  }, [demo.actualStart, demo.status, fullWindow, slugToTeamId, testModeDivider])

  const { firstFinishTime, lastFinishTime } = useMemo(() => {
    if (laps.length === 0) return { firstFinishTime: undefined, lastFinishTime: undefined }
    const lastByTeam = new Map<string, number>()
    for (const l of laps) {
      const prev = lastByTeam.get(l.teamId) ?? 0
      if (l.timestamp > prev) lastByTeam.set(l.teamId, l.timestamp)
    }
    const values = Array.from(lastByTeam.values())
    if (values.length === 0) return { firstFinishTime: undefined, lastFinishTime: undefined }
    return { firstFinishTime: Math.min(...values), lastFinishTime: Math.max(...values) }
  }, [laps])

  const simulation: SimulationOverride = {
    status: demo.status,
    actualStart: demo.actualStart,
    actualEnd: demo.actualEnd,
    laps,
    endTimeOverride: lastFinishTime,
    finishedAtOverride: firstFinishTime,
    onStart: () => {
      setDemo({ status: 'running', actualStart: Date.now(), actualEnd: null })
      resetTeamsState().catch(() => {})
    },
    onEnd: () => setDemo((s) => ({ ...s, status: 'finished', actualEnd: Date.now() })),
    onRestart: () => {
      setDemo({ status: 'running', actualStart: Date.now(), actualEnd: null })
      resetTeamsState().catch(() => {})
    },
    hideAdminButton,
  }

  return <HomeScreen eventSlug={eventSlug} onPickTeam={onPickTeam} simulation={simulation} />
}
