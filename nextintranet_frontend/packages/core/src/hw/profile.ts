import type { StationProfile } from "./types"

// Stored in localStorage for now; sync will be added later.
const PROFILE_KEY = "nextIO.stationProfile"
const LEGACY_PROFILE_KEY = "nextHW.stationProfile"
const STATION_KEY = "stationId"

const DEFAULT_PROFILE: StationProfile = {
  version: 1,
  stationId: null,
  agents: [],
  browserDevices: [],
}

export function loadStationProfile(): StationProfile {
  if (typeof window === "undefined") {
    return DEFAULT_PROFILE
  }

  const raw = window.localStorage.getItem(PROFILE_KEY)
    ?? window.localStorage.getItem(LEGACY_PROFILE_KEY)
  if (!raw) {
    return DEFAULT_PROFILE
  }

  try {
    const parsed = JSON.parse(raw) as StationProfile
    if (parsed?.version !== 1) {
      return DEFAULT_PROFILE
    }
    const nextProfile = {
      ...DEFAULT_PROFILE,
      ...parsed,
      agents: parsed.agents ?? [],
      browserDevices: parsed.browserDevices ?? [],
    }
    if (parsed && window.localStorage.getItem(PROFILE_KEY) === null) {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile))
    }
    return nextProfile
  } catch {
    return DEFAULT_PROFILE
  }
}

export function saveStationProfile(profile: StationProfile): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))

  if (profile.stationId) {
    window.localStorage.setItem(STATION_KEY, profile.stationId)
  } else {
    window.localStorage.removeItem(STATION_KEY)
  }
}

export function resetStationProfile(): void {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(PROFILE_KEY)
}
