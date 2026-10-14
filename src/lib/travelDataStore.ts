import type { TravelAppData } from '../types'
import { supabase } from './supabase'

const TRAVEL_DOCUMENTS_TABLE = 'travel_app_documents'
const APP_ADMINS_TABLE = 'app_admins'
const TRAVEL_DOCUMENT_ID = 'tokyo-trip'

const requireSupabase = () => {
  if (!supabase) {
    throw new Error('Supabase 尚未設定')
  }

  return supabase
}

export const loadTravelData = async () => {
  const client = requireSupabase()
  const { data, error } = await client
    .from(TRAVEL_DOCUMENTS_TABLE)
    .select('data, updated_at')
    .eq('id', TRAVEL_DOCUMENT_ID)
    .maybeSingle()

  if (error) throw error

  return {
    data: (data?.data as TravelAppData | null) ?? null,
    updatedAt: data?.updated_at ?? null,
  }
}

export const getTravelDataUpdatedAt = async () => {
  const client = requireSupabase()
  const { data, error } = await client
    .from(TRAVEL_DOCUMENTS_TABLE)
    .select('updated_at')
    .eq('id', TRAVEL_DOCUMENT_ID)
    .maybeSingle()

  if (error) throw error

  return data?.updated_at ?? null
}

export const saveTravelData = async (travelData: TravelAppData) => {
  const client = requireSupabase()
  const updatedAt = new Date().toISOString()
  const { error } = await client.from(TRAVEL_DOCUMENTS_TABLE).upsert({
    id: TRAVEL_DOCUMENT_ID,
    data: travelData,
    updated_at: updatedAt,
  })

  if (error) throw error

  return updatedAt
}

export const checkIsAdmin = async (userId: string) => {
  const client = requireSupabase()
  const { data, error } = await client
    .from(APP_ADMINS_TABLE)
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.warn('Admin check failed:', error.message)
    return false
  }

  return Boolean(data)
}
