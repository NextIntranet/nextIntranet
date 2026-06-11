export interface StocktakingProgress {
  total_packets: number
  inactive_packets: number
  inventoried_packets: number
  pending_packets: number
  progress_percent: number
}

export const STOCKTAKING_PROGRESS_REFETCH_MS = 30_000

export const emptyStocktakingProgress = (): StocktakingProgress => ({
  total_packets: 0,
  inactive_packets: 0,
  inventoried_packets: 0,
  pending_packets: 0,
  progress_percent: 0,
})

export const formatCampaignProgressLabel = (progress: StocktakingProgress): string => {
  const inactiveSuffix =
    progress.inactive_packets > 0
      ? ` · ${progress.inactive_packets.toLocaleString()} inactive`
      : ""
  return `${progress.inventoried_packets} / ${progress.total_packets} done · ${progress.pending_packets} remaining${inactiveSuffix}`
}
