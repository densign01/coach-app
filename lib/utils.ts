import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function buildDayId(userId: string, date: string) {
  return `${userId}::${date}`
}

export function parseDayId(dayId: string) {
  const [userId = '', date = ''] = dayId.split('::')
  return { userId, date }
}
